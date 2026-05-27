// 시간대별 인력 재배치 시뮬레이션 (잔업 최소화)
//
// 모델:
// - 각 그룹은 부하시간(인시)을 가짐. 투입 인원수만큼 시간당 소진.
//   그룹 완료 시각 = 시작 + 남은부하 / 인원
// - 부하 없는 그룹 / 먼저 끝난 그룹의 인원은 "여유 인력"이 되어
//   그 시점에 가장 늦게 끝나는(병목) 그룹으로 투입 → 전체 완료(=잔업) 최소화
// - 시작 08:30 가정, 표준 8시간 (= 16:30). 그 이후는 잔업.

export interface ReallocGroupInput {
  name: string;
  loadHours: number; // 인시
  headcount: number; // 초기 투입 인원 (출근 + 받은지원)
  urgent?: boolean; // D-1/D-2 긴급건 있는 라인 (우선 배치)
  autoManaged?: boolean; // 자동포장 등 — 인원 고정, 재배치 풀 미참여
}

// 재배치 풀에 처음부터 들어가는 잉여 인력 (예: 자동포장라인 비자야 외 인원)
export interface ReallocExtraFree {
  origin: string;
  count: number;
}

// 작업 마감 = work-time 11 (21:00). 이후 부하는 이월.
export const MAX_WORKTIME = 11;
// 긴급 라인 최소 투입 인원
const URGENT_MIN_HEADCOUNT = 2;
// 한 라인 최대 인원
const MAX_HEADCOUNT = 2;
// 새 라인 배치 최소 작업시간(h) — 이 시간 미만이면 이동 안 함
const MIN_WORK_TO_MOVE = 1;

export interface ReallocMove {
  time: number; // decimal hours
  count: number;
  from: string; // 출발 그룹 (또는 무부하 그룹)
  to: string; // 도착 그룹
}

export interface ReallocSegment {
  start: number;
  end: number;
  base: number; // 기존(해당 라인 원래) 인원
  added: number; // 이동되어 추가된 인원
}

export interface ReallocGroupTimeline {
  name: string;
  loadHours: number;
  initialHeadcount: number;
  segments: ReallocSegment[];
  finishTime: number | null; // 부하 없으면 null, 이월이면 null
  carryHours: number; // 21:00까지 못 끝낸 이월 부하(인시)
  urgent: boolean;
}

// 30분 단위 반올림
function round30(h: number): number {
  return Math.round(h * 2) / 2;
}

export interface ReallocResult {
  startTime: number;
  standardEnd: number;
  actualEnd: number;
  hasOvertime: boolean;
  overtimeHours: number;
  moves: ReallocMove[];
  timelines: ReallocGroupTimeline[];
  totalLoad: number; // 총부하 (인시)
  totalPeople: number; // 직접 출근인원
  totalCarry: number; // 다음날 이월 부하 (인시)
  availableLoad: number; // 가용부하 = 인원 × 정규8h (인시)
  idleHours: number; // 유휴 시간 (정규시간 내 안 쓰인 인력, 인시)
  overtimePeople: number; // 잔업인원
  overtimePersonHours: number; // 잔업시간 (인시)
}

const EPS = 1e-6;

// 세그먼트 기반 메트릭 (투입/잔업/유휴)
//
// 유휴 = 가용부하(인원×정규8h) − 정규시간 내 실제 투입 인시
//   · 투입 = 라인에 사람이 들어가 부하를 소진한 모든 인시 (1명도 포함)
//   · 인원 기준이라, 끝난 인원이 다른 라인에 가서 일하면 유휴로 안 잡힘
//   · 부하를 안 깎은 시간(작업 전 대기·종료 후·잉여)만 유휴로 남음
function computeMetrics(
  groups: { segments: ReallocSegment[] }[],
  startTime: number,
  standardHours: number,
  maxTime: number,
  totalPeople: number
): {
  availableLoad: number;
  idleHours: number;
  overtimePeople: number;
  overtimePersonHours: number;
} {
  const otStart = startTime + standardHours;
  let regularWork = 0; // 정규시간 내 실제 투입 인시 (1명 포함)
  let otWork = 0;
  let overtimePeople = 0;
  for (const g of groups) {
    let maxOtHc = 0;
    for (const seg of g.segments) {
      const h = seg.base + seg.added;
      // 정규시간 내 투입 인시
      const hi = Math.min(seg.end, otStart);
      const lo = Math.max(seg.start, startTime);
      if (hi > lo) regularWork += (hi - lo) * h;
      // 잔업 인시/인원 (실제 잔업 투입 기준)
      const otHi = Math.min(seg.end, maxTime);
      const otLo = Math.max(seg.start, otStart);
      if (otHi > otLo) {
        otWork += (otHi - otLo) * h;
        maxOtHc = Math.max(maxOtHc, h);
      }
    }
    overtimePeople += maxOtHc;
  }
  const availableLoad = totalPeople * standardHours;
  const idleHours = Math.max(0, availableLoad - regularWork);
  return {
    availableLoad: Math.round(availableLoad * 2) / 2,
    idleHours: Math.round(idleHours * 2) / 2,
    overtimePeople,
    overtimePersonHours: Math.round(otWork * 2) / 2,
  };
}

export function computeReallocation(
  groupsInput: ReallocGroupInput[],
  startTime = 8.5,
  standardHours = 8,
  extraFree: ReallocExtraFree[] = [],
  disableRealloc = false // true 면 기본 배치(이동 없음)로 계산
): ReallocResult {
  const standardEnd = startTime + standardHours;
  const STEP = 0.5; // 30분 단위 시뮬레이션

  interface G {
    name: string;
    loadHours: number;
    remaining: number;
    base: number; // 해당 라인 원래(기존) 인원 — 끝날 때까지 유지
    added: number; // 이동되어 들어온 인원
    initialHeadcount: number;
    segments: ReallocSegment[];
    segStart: number;
    segBase: number;
    segAdded: number;
    finishTime: number | null;
    urgent: boolean;
    autoManaged: boolean;
  }

  const gs: G[] = groupsInput.map((g) => ({
    name: g.name,
    loadHours: round30(g.loadHours), // 부하 30분 단위
    remaining: round30(g.loadHours),
    base: g.headcount,
    added: 0,
    initialHeadcount: g.headcount,
    segments: [],
    segStart: startTime,
    segBase: g.headcount,
    segAdded: 0,
    finishTime: g.loadHours <= EPS ? startTime : null,
    urgent: !!g.urgent,
    autoManaged: !!g.autoManaged,
  }));

  const maxTime = startTime + MAX_WORKTIME;
  const totalLoad = gs.reduce((s, g) => s + g.loadHours, 0);
  const extraFreeCount = extraFree.reduce((s, e) => s + e.count, 0);
  const totalPeople =
    gs.reduce((s, g) => s + g.initialHeadcount, 0) + extraFreeCount;

  const freePool: { origin: string }[] = [];
  let time = startTime;
  const hc = (g: G) => g.base + g.added;

  const closeSeg = (g: G) => {
    if (g.segStart < time - EPS && g.segBase + g.segAdded > 0) {
      g.segments.push({
        start: g.segStart,
        end: time,
        base: g.segBase,
        added: g.segAdded,
      });
    }
    g.segStart = time;
    g.segBase = g.base;
    g.segAdded = g.added;
  };

  // === autoManaged: 인원 고정(전부 base), 풀 미참여, 독립 처리 ===
  for (const g of gs) {
    if (!g.autoManaged) continue;
    if (g.loadHours > EPS && g.base > 0) {
      const wt = round30(g.loadHours / g.base);
      const endWt = Math.min(startTime + wt, maxTime);
      g.segments.push({ start: startTime, end: endWt, base: g.base, added: 0 });
      if (startTime + wt <= maxTime + EPS) {
        g.finishTime = startTime + wt;
        g.remaining = 0;
      } else {
        g.finishTime = null;
        g.remaining = g.loadHours - g.base * (maxTime - startTime);
      }
    } else {
      g.finishTime = startTime;
      g.remaining = 0;
    }
  }

  // === 기본 배치 모드: 각 그룹이 초기 인원으로 자기 부하만 처리 (이동 없음) ===
  if (disableRealloc) {
    for (const g of gs) {
      if (g.autoManaged) continue;
      const head = g.base;
      if (g.loadHours > EPS && head > 0) {
        const wt = round30(g.loadHours / head);
        const endWt = Math.min(startTime + wt, maxTime);
        g.segments.push({ start: startTime, end: endWt, base: head, added: 0 });
        if (startTime + wt <= maxTime + EPS) {
          g.finishTime = startTime + wt;
          g.remaining = 0;
        } else {
          g.finishTime = null;
          g.remaining = g.loadHours - head * (maxTime - startTime);
        }
      } else {
        g.finishTime = startTime;
        g.remaining = 0;
      }
    }

    const actualEnd0 = gs.reduce(
      (mx, g) => Math.max(mx, g.finishTime ?? startTime),
      startTime
    );
    const overtimeHours0 = Math.max(0, actualEnd0 - standardEnd);
    const totalCarry0 = gs.reduce((s, g) => s + Math.max(0, g.remaining), 0);
    const m0 = computeMetrics(gs, startTime, standardHours, maxTime, totalPeople);
    return {
      startTime,
      standardEnd,
      actualEnd: actualEnd0,
      hasOvertime: overtimeHours0 > EPS,
      overtimeHours: overtimeHours0,
      moves: [],
      timelines: gs.map((g) => ({
        name: g.name,
        loadHours: g.loadHours,
        initialHeadcount: g.initialHeadcount,
        segments: g.segments,
        finishTime: g.remaining > EPS ? null : g.finishTime,
        carryHours: round30(Math.max(0, g.remaining)),
        urgent: g.urgent,
      })),
      totalLoad,
      totalPeople,
      totalCarry: round30(totalCarry0),
      ...m0,
    };
  }

  // 초기 잉여 인력
  for (const ef of extraFree) {
    for (let i = 0; i < ef.count; i++) freePool.push({ origin: ef.origin });
  }

  // 한 라인 최대 2명 → 초과 base 인원은 여유 풀로
  for (const g of gs) {
    if (g.autoManaged) continue;
    if (g.base > MAX_HEADCOUNT) {
      const excess = g.base - MAX_HEADCOUNT;
      for (let i = 0; i < excess; i++) freePool.push({ origin: g.name });
      g.base = MAX_HEADCOUNT;
      g.segBase = MAX_HEADCOUNT;
    }
  }

  // 무부하 일반 그룹 인원 → 즉시 여유 풀
  for (const g of gs) {
    if (g.autoManaged) continue;
    if (g.remaining <= EPS && hc(g) > 0) {
      for (let i = 0; i < hc(g); i++) freePool.push({ origin: g.name });
      g.base = 0;
      g.added = 0;
      g.segBase = 0;
      g.segAdded = 0;
    }
  }

  const rawMoves: ReallocMove[] = [];
  const bottleneck = (a: G, b: G) => {
    const fa = hc(a) > 0 ? a.remaining / hc(a) : Infinity;
    const fb = hc(b) > 0 ? b.remaining / hc(b) : Infinity;
    if (Math.abs(fa - fb) > EPS) return fb - fa;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return 0;
  };

  let guard = 0;
  while (guard++ < 1000 && time < maxTime - EPS) {
    // 1) 여유 인력 배치 (autoManaged 제외 / 최대 2명 / 1시간 이상 작업 가능)
    while (freePool.length > 0) {
      const remToMax = maxTime - time;
      const candidates = gs.filter((g) => {
        if (g.autoManaged) return false;
        if (g.remaining <= EPS) return false;
        if (hc(g) >= MAX_HEADCOUNT) return false;
        const projected = g.remaining / (hc(g) + 1);
        return Math.min(projected, remToMax) >= MIN_WORK_TO_MOVE - EPS;
      });
      if (candidates.length === 0) break;

      let target: G;
      const urgentNeed = candidates
        .filter((g) => g.urgent && hc(g) < URGENT_MIN_HEADCOUNT)
        .sort((a, b) => hc(a) - hc(b) || bottleneck(a, b));
      const soloGroups = candidates
        .filter((g) => hc(g) === 1)
        .sort(bottleneck);

      if (urgentNeed.length > 0) target = urgentNeed[0];
      else if (soloGroups.length > 0) target = soloGroups[0];
      else target = [...candidates].sort(bottleneck)[0];

      const worker = freePool.shift()!;
      closeSeg(target);
      target.added += 1;
      target.segAdded = target.added;
      rawMoves.push({ time, count: 1, from: worker.origin, to: target.name });
    }

    // 2) 30분 진행
    const active = gs.filter(
      (g) => !g.autoManaged && g.remaining > EPS && hc(g) > 0
    );
    if (active.length === 0) break;
    const dt = Math.min(STEP, maxTime - time);
    for (const g of active) g.remaining -= hc(g) * dt;
    time += dt;

    // 완료 그룹 → 인원 여유 풀로
    for (const g of gs) {
      if (g.autoManaged) continue;
      if (g.remaining <= EPS && hc(g) > 0) {
        closeSeg(g);
        g.finishTime = time;
        for (let i = 0; i < hc(g); i++) freePool.push({ origin: g.name });
        g.base = 0;
        g.added = 0;
        g.segBase = 0;
        g.segAdded = 0;
        g.remaining = 0;
      }
    }
    if (time >= maxTime - EPS) break;
  }

  // 열린 세그먼트 닫기
  for (const g of gs) {
    if (g.autoManaged) continue;
    if (g.segBase + g.segAdded > 0 && g.segStart < time - EPS) {
      g.segments.push({
        start: g.segStart,
        end: time,
        base: g.segBase,
        added: g.segAdded,
      });
    }
  }

  // 같은 (time, from, to) 이동 합치기
  const mergedMap = new Map<string, ReallocMove>();
  for (const m of rawMoves) {
    const key = `${m.time.toFixed(4)}|${m.from}|${m.to}`;
    const ex = mergedMap.get(key);
    if (ex) ex.count += m.count;
    else mergedMap.set(key, { ...m });
  }
  const moves = Array.from(mergedMap.values()).sort(
    (a, b) => a.time - b.time || a.to.localeCompare(b.to)
  );

  const actualEnd = gs.reduce(
    (mx, g) => Math.max(mx, g.finishTime ?? startTime),
    startTime
  );
  const overtimeHours = Math.max(0, actualEnd - standardEnd);
  const totalCarry = gs.reduce((s, g) => s + Math.max(0, g.remaining), 0);
  const m = computeMetrics(gs, startTime, standardHours, maxTime, totalPeople);

  return {
    startTime,
    standardEnd,
    actualEnd,
    hasOvertime: overtimeHours > EPS,
    overtimeHours,
    moves,
    timelines: gs.map((g) => ({
      name: g.name,
      loadHours: g.loadHours,
      initialHeadcount: g.initialHeadcount,
      segments: g.segments,
      finishTime: g.remaining > EPS ? null : g.finishTime,
      carryHours: round30(Math.max(0, g.remaining)),
      urgent: g.urgent,
    })),
    totalLoad,
    totalPeople,
    totalCarry: round30(totalCarry),
    ...m,
  };
}

export function formatHM(decimalHours: number): string {
  let h = Math.floor(decimalHours + EPS);
  let m = Math.round((decimalHours - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// === 실제 작업 시간표 (휴게 반영) ===
// 작업: 08:30~12:30(4h) + 13:30~17:30(4h) = 표준 8h
// 점심 12:30~13:30, 저녁 17:30~18:00 (작업 없음)
// 잔업: 18:00~21:00 (3h)
// work-time(누적 작업시간, 0부터) ↔ 벽시계 변환
export const WORK_PERIODS = [
  { wtStart: 0, wtEnd: 4, wallStart: 8.5 }, // 08:30~12:30
  { wtStart: 4, wtEnd: 8, wallStart: 13.5 }, // 13:30~17:30
  { wtStart: 8, wtEnd: 11, wallStart: 18.0 }, // 18:00~21:00 (잔업)
];

// 표준 종료 = work-time 8 = 17:30
export const STANDARD_WORKTIME = 8;
export const STANDARD_END_WALL = 17.5;

export function workTimeToWall(wt: number): number {
  for (const p of WORK_PERIODS) {
    if (wt <= p.wtEnd + EPS) {
      return p.wallStart + (wt - p.wtStart);
    }
  }
  const last = WORK_PERIODS[WORK_PERIODS.length - 1];
  // 21:00 초과분은 그대로 연장 표시
  return last.wallStart + (last.wtEnd - last.wtStart) + (wt - last.wtEnd);
}

// work-time 구간 [a,b] 를 휴게로 분할한 벽시계 구간 목록으로
export function splitWorkSegment(
  a: number,
  b: number
): { start: number; end: number }[] {
  const segs: { start: number; end: number }[] = [];
  for (const p of WORK_PERIODS) {
    const lo = Math.max(a, p.wtStart);
    const hi = Math.min(b, p.wtEnd);
    if (hi > lo + EPS) {
      segs.push({
        start: p.wallStart + (lo - p.wtStart),
        end: p.wallStart + (hi - p.wtStart),
      });
    }
  }
  const last = WORK_PERIODS[WORK_PERIODS.length - 1];
  if (b > last.wtEnd + EPS) {
    const lo = Math.max(a, last.wtEnd);
    const base = last.wallStart + (last.wtEnd - last.wtStart);
    segs.push({ start: base + (lo - last.wtEnd), end: base + (b - last.wtEnd) });
  }
  return segs;
}
