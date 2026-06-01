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
// 잔업으로 해야 할 작업시간이 이 값(시간) 이하이면 잔업하지 않고 이월
const OT_SKIP_THRESHOLD = 2;
// 긴급 라인 최소 투입 인원
const URGENT_MIN_HEADCOUNT = 2;
// 한 라인 최대 인원
const MAX_HEADCOUNT = 2;
// 새 라인 배치 최소 작업시간(h) — 이 시간 미만이면 이동 안 함
const MIN_WORK_TO_MOVE = 1;
// 1인 작업 효율 (짝이 아니라 혼자 일하면 시간당 처리량 60%)
const SOLO_EFFICIENCY = 0.6;

// 라인 진행률(인시/시간): 자동=인원, 비자동 1명=0.6, 비자동 2명=2.0, 0명=0
function lineRate(headcount: number, autoManaged: boolean): number {
  if (headcount <= 0) return 0;
  if (autoManaged) return headcount;
  if (headcount === 1) return SOLO_EFFICIENCY;
  return headcount; // 2명 짝
}

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
  workHours: number; // 작업시간 = 정규시간 내 실제 투입 인시
  idleHours: number; // 유휴 시간 (정규 미투입 + 잔업 중 노는 시간, 인시)
  regularIdleHours: number; // 정규시간 유휴 (가용부하 − 작업시간)
  overtimeIdleHours: number; // 잔업 유휴 (잔업 인원이 잔업 슬롯에서 노는 시간)
  overtimePeople: number; // 잔업인원 (잔업 2h 이상 라인만)
  overtimePersonHours: number; // 잔업시간 (인시)
}

const EPS = 1e-6;

// 세그먼트 기반 메트릭 (작업시간/잔업/유휴)
//
// · 작업시간 = 정규시간 내 실제 투입 인시 (1명도 포함)
// · 유휴 = (가용부하 − 작업시간) + 잔업 중 노는 시간
//     - 잔업 투입된 인원이 21:00 전에 끝나면 남는 시간도 유휴로 봄
// · 잔업인원 = 잔업 작업시간이 2h 이상인 라인의 인원만 (그 미만은 0)
function computeMetrics(
  groups: { segments: ReallocSegment[]; autoManaged: boolean }[],
  startTime: number,
  standardHours: number,
  maxTime: number,
  totalPeople: number
): {
  availableLoad: number;
  workHours: number;
  idleHours: number;
  regularIdleHours: number;
  overtimeIdleHours: number;
  overtimePeople: number;
  overtimePersonHours: number;
} {
  const otStart = startTime + standardHours;
  let regularWork = 0; // 정규시간 내 처리 부하(인시) — 1인 60% 효율 반영
  let otWork = 0; // 잔업 처리 부하(인시) — 1인 60% 효율 반영
  let overtimePeople = 0; // 잔업인원 (라인 잔업 2h 이상만)
  let otPeople = 0; // 잔업 진입 인원 (work-time 8 경계를 넘긴 인원)
  let otOperationEnd = otStart; // 마지막 잔업 작업 종료(work-time)
  for (const g of groups) {
    let maxOtHc = 0;
    let otEndLine = otStart;
    for (const seg of g.segments) {
      const h = seg.base + seg.added;
      const r = lineRate(h, g.autoManaged); // 1인 60% 등 효율 반영
      // 정규시간 내 처리 부하
      const hi = Math.min(seg.end, otStart);
      const lo = Math.max(seg.start, startTime);
      if (hi > lo) regularWork += (hi - lo) * r;
      // 잔업 처리 부하
      const otHi = Math.min(seg.end, maxTime);
      const otLo = Math.max(seg.start, otStart);
      if (otHi > otLo) {
        otWork += (otHi - otLo) * r;
        maxOtHc = Math.max(maxOtHc, h);
        otEndLine = Math.max(otEndLine, otHi);
        otOperationEnd = Math.max(otOperationEnd, otHi);
      }
      // 잔업 진입 인원: work-time 8 경계를 지나는 세그먼트의 인원수
      if (seg.start <= otStart + EPS && seg.end > otStart + EPS) {
        otPeople += h;
      }
    }
    // 잔업인원: 잔업 작업시간이 2h 이상인 라인만 카운트
    if (maxOtHc > 0 && otEndLine - otStart >= 2 - EPS) {
      overtimePeople += maxOtHc;
    }
  }
  // 잔업 유휴(인원 기준): 잔업 진입 인원이 잔업 종료시각까지 일하지 않은 시간
  //  · 다른 라인으로 옮겨 일하면 그쪽 작업으로 잡혀 유휴 아님 (인원 기준)
  const overtimeIdle =
    otPeople > 0
      ? Math.max(0, otPeople * (otOperationEnd - otStart) - otWork)
      : 0;
  const availableLoad = totalPeople * standardHours;
  const regularIdle = Math.max(0, availableLoad - regularWork);
  const idleHours = regularIdle + overtimeIdle;
  return {
    availableLoad: Math.round(availableLoad * 2) / 2,
    workHours: Math.round(regularWork * 2) / 2,
    idleHours: Math.round(idleHours * 2) / 2,
    regularIdleHours: Math.round(regularIdle * 2) / 2,
    overtimeIdleHours: Math.round(overtimeIdle * 2) / 2,
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
    dropped: boolean; // 잔업 안 하기로 하고 정지(이월)된 라인
    otTarget: number; // 잔업 시 허용 최대 인원 (잔업인원 최소화용)
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
    dropped: false,
    otTarget: MAX_HEADCOUNT,
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

  // 단일 라인 정적 배치 (이동 없음) — 완료시각·세그먼트·이월 산출
  //  · 1인 작업은 효율 60% 적용
  //  · 잔업 작업시간이 OT_SKIP_THRESHOLD 이하이면 잔업 생략 → 정규까지만 하고 이월
  const placeStatic = (g: G, head: number) => {
    if (g.loadHours <= EPS || head <= 0) {
      g.finishTime = startTime;
      g.remaining = 0;
      return;
    }
    const r = lineRate(head, g.autoManaged); // 시간당 부하 처리량
    const wt = round30(g.loadHours / r); // 완료까지 work-time
    if (wt <= standardHours + EPS) {
      // 정규시간 내 완료
      g.segments.push({ start: startTime, end: startTime + wt, base: head, added: 0 });
      g.finishTime = startTime + wt;
      g.remaining = 0;
    } else if (wt - standardHours <= OT_SKIP_THRESHOLD + EPS) {
      // 잔업 2시간 이하 → 잔업 안 함, 정규시간까지만 작업하고 이월
      g.segments.push({
        start: startTime,
        end: startTime + standardHours,
        base: head,
        added: 0,
      });
      g.finishTime = null;
      g.remaining = g.loadHours - r * standardHours;
    } else {
      // 잔업 진행, 21:00(maxTime)까지
      const endWt = Math.min(startTime + wt, maxTime);
      g.segments.push({ start: startTime, end: endWt, base: head, added: 0 });
      if (startTime + wt <= maxTime + EPS) {
        g.finishTime = startTime + wt;
        g.remaining = 0;
      } else {
        g.finishTime = null;
        g.remaining = g.loadHours - r * (maxTime - startTime);
      }
    }
  };

  // === autoManaged: 인원 고정(전부 base), 풀 미참여, 독립 처리 ===
  for (const g of gs) {
    if (!g.autoManaged) continue;
    placeStatic(g, g.base);
  }

  // === 기본 배치 모드: 각 그룹이 초기 인원으로 자기 부하만 처리 (이동 없음) ===
  if (disableRealloc) {
    for (const g of gs) {
      if (g.autoManaged) continue;
      placeStatic(g, g.base);
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

  // 한 라인 최대 2명(짝) → 초과 인원만 여유 풀로 (짝은 유지)
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
  const projectedFinish = (g: G) => {
    const r = lineRate(hc(g), g.autoManaged);
    return r > 0 ? g.remaining / r : Infinity;
  };
  const bottleneck = (a: G, b: G) => {
    const fa = projectedFinish(a);
    const fb = projectedFinish(b);
    if (Math.abs(fa - fb) > EPS) return fb - fa;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return 0;
  };

  let guard = 0;
  while (guard++ < 1000 && time < maxTime - EPS) {
    // 0) 잔업 진입 판단 (짝 우선) — 표준시간 도달 시 라인별로:
    //    · 잔업하는 라인은 2명 짝으로 운영 (정규·잔업 모두 짝 우선)
    //    · 단, 2명이 ≥2h 잔업할 만큼(남은 부하 ≥4인시)일 때만 잔업, 그 미만은 이월
    if (Math.abs(time - standardEnd) < EPS) {
      for (const g of gs) {
        if (g.autoManaged || g.dropped) continue;
        if (g.remaining <= EPS) continue;
        const target =
          g.remaining < 2 * OT_SKIP_THRESHOLD - EPS ? 0 : MAX_HEADCOUNT;
        g.otTarget = target;
        if (hc(g) > target) {
          closeSeg(g);
          let toRelease = hc(g) - target;
          while (toRelease > 0 && g.added > 0) {
            g.added -= 1;
            freePool.push({ origin: g.name });
            toRelease -= 1;
          }
          while (toRelease > 0 && g.base > 0) {
            g.base -= 1;
            freePool.push({ origin: g.name });
            toRelease -= 1;
          }
          g.segBase = g.base;
          g.segAdded = g.added;
        }
        if (target === 0) g.dropped = true;
      }
      // 활성(잔업할) 라인이 없으면 종료
      const anyActive = gs.some(
        (g) => !g.autoManaged && !g.dropped && g.remaining > EPS && hc(g) > 0
      );
      const poolUsable =
        freePool.length > 0 &&
        gs.some(
          (g) => !g.autoManaged && !g.dropped && g.remaining > EPS && hc(g) < g.otTarget
        );
      if (!anyActive && !poolUsable) break;
    }

    // 1) 여유 인력 배치 (autoManaged 제외 / 최대 2명 / 1시간 이상 작업 가능)
    while (freePool.length > 0) {
      const remToMax = maxTime - time;
      const candidates = gs.filter((g) => {
        if (g.autoManaged || g.dropped) return false;
        if (g.remaining <= EPS) return false;
        if (hc(g) >= g.otTarget) return false; // 라인별 허용 인원(최대 2명 짝)까지만
        // 인원 1명 늘렸을 때 처리율 반영해 예상 소요 산출 (1인=0.6, 2인=2.0)
        const projected = g.remaining / lineRate(hc(g) + 1, g.autoManaged);
        return Math.min(projected, remToMax) >= MIN_WORK_TO_MOVE - EPS;
      });
      if (candidates.length === 0) break;

      // 배치 우선순위 (짝 우선):
      //  1) 긴급라인(2명 미만)  2) 인원 0명 라인 먼저 가동(라인 안 죽게)
      //  3) 1명 라인 짝짓기(2명)  4) 그 외 병목
      let target: G;
      const urgentNeed = candidates
        .filter((g) => g.urgent && hc(g) < URGENT_MIN_HEADCOUNT)
        .sort((a, b) => hc(a) - hc(b) || bottleneck(a, b));
      const zeroLines = candidates.filter((g) => hc(g) === 0).sort(bottleneck);
      const soloLines = candidates.filter((g) => hc(g) === 1).sort(bottleneck);

      if (urgentNeed.length > 0) target = urgentNeed[0];
      else if (zeroLines.length > 0) target = zeroLines[0];
      else if (soloLines.length > 0) target = soloLines[0];
      else target = [...candidates].sort(bottleneck)[0];

      // 타깃이 출발 라인인 인원이 풀에 있으면 그를 복귀(기존 인원)시켜 자기 라인 이동 표시 방지
      const ownIdx = freePool.findIndex((w) => w.origin === target.name);
      const worker =
        ownIdx >= 0 ? freePool.splice(ownIdx, 1)[0] : freePool.shift()!;
      closeSeg(target);
      if (worker.origin === target.name) {
        target.base += 1; // 원래 자기 라인으로 복귀 → 기존 인원(파랑)
        target.segBase = target.base;
      } else {
        target.added += 1;
        target.segAdded = target.added;
        rawMoves.push({ time, count: 1, from: worker.origin, to: target.name });
      }
    }

    // 2) 30분 진행
    const active = gs.filter(
      (g) => !g.autoManaged && g.remaining > EPS && hc(g) > 0
    );
    if (active.length === 0) break;
    const dt = Math.min(STEP, maxTime - time);
    // 1인 작업은 60% 효율, 2명 짝은 100% per-person
    for (const g of active) g.remaining -= lineRate(hc(g), g.autoManaged) * dt;
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
