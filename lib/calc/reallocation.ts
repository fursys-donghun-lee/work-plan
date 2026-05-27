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
}

// 작업 마감 = work-time 11 (21:00). 이후 부하는 이월.
const MAX_WORKTIME = 11;
// 긴급 라인 최소 투입 인원
const URGENT_MIN_HEADCOUNT = 2;

export interface ReallocMove {
  time: number; // decimal hours
  count: number;
  from: string; // 출발 그룹 (또는 무부하 그룹)
  to: string; // 도착 그룹
}

export interface ReallocSegment {
  start: number;
  end: number;
  headcount: number;
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

export interface ReallocResult {
  startTime: number;
  standardEnd: number;
  actualEnd: number;
  hasOvertime: boolean;
  overtimeHours: number;
  moves: ReallocMove[];
  timelines: ReallocGroupTimeline[];
  totalLoad: number;
  totalPeople: number;
  totalCarry: number; // 다음날 이월 부하 합(인시)
}

const EPS = 1e-6;

export function computeReallocation(
  groupsInput: ReallocGroupInput[],
  startTime = 8.5,
  standardHours = 8
): ReallocResult {
  const standardEnd = startTime + standardHours;

  interface G {
    name: string;
    loadHours: number;
    remaining: number;
    headcount: number;
    initialHeadcount: number;
    segments: ReallocSegment[];
    segStart: number;
    segHc: number;
    finishTime: number | null;
    urgent: boolean;
  }

  const gs: G[] = groupsInput.map((g) => ({
    name: g.name,
    loadHours: g.loadHours,
    remaining: g.loadHours,
    headcount: g.headcount,
    initialHeadcount: g.headcount,
    segments: [],
    segStart: startTime,
    segHc: g.headcount,
    finishTime: g.loadHours <= EPS ? startTime : null,
    urgent: !!g.urgent,
  }));

  // work-time 기준이므로 startTime=0, 마감 = MAX_WORKTIME(11=21:00)
  const maxTime = startTime + MAX_WORKTIME;

  const totalLoad = gs.reduce((s, g) => s + g.loadHours, 0);
  const totalPeople = gs.reduce((s, g) => s + g.initialHeadcount, 0);

  // 여유 인력 풀 (출발지 추적)
  const freePool: { origin: string }[] = [];
  let time = startTime;

  const closeSeg = (g: G, newHc: number) => {
    if (g.segStart < time - EPS && g.segHc > 0) {
      g.segments.push({ start: g.segStart, end: time, headcount: g.segHc });
    }
    g.segStart = time;
    g.segHc = newHc;
  };

  // 시작 시 무부하 그룹 인원은 즉시 여유 풀로
  for (const g of gs) {
    if (g.remaining <= EPS && g.headcount > 0) {
      for (let i = 0; i < g.headcount; i++) freePool.push({ origin: g.name });
      g.segHc = 0;
      g.headcount = 0;
    }
  }

  const rawMoves: ReallocMove[] = [];

  let guard = 0;
  while (guard++ < 2000 && time < maxTime - EPS) {
    // 1) 여유 인력 배치
    while (freePool.length > 0) {
      const withLoad = gs.filter((g) => g.remaining > EPS);
      if (withLoad.length === 0) break;

      let target: G;
      // 1순위: 긴급(D-1/D-2) 라인 중 최소 인원(2명) 미달 → 우선 채움
      const urgentNeed = withLoad
        .filter((g) => g.urgent && g.headcount < URGENT_MIN_HEADCOUNT)
        .sort((a, b) => a.headcount - b.headcount);
      if (urgentNeed.length > 0) {
        target = urgentNeed[0];
      } else {
        // 2순위: 병목 (가장 늦게 끝나는 그룹). 동률이면 긴급 라인 우선.
        const sorted = [...withLoad].sort((a, b) => {
          const fa = a.headcount > 0 ? a.remaining / a.headcount : Infinity;
          const fb = b.headcount > 0 ? b.remaining / b.headcount : Infinity;
          if (Math.abs(fa - fb) > EPS) return fb - fa;
          if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
          return 0;
        });
        target = sorted[0];
      }
      const worker = freePool.shift()!;
      closeSeg(target, target.headcount + 1);
      target.headcount += 1;
      rawMoves.push({ time, count: 1, from: worker.origin, to: target.name });
    }

    // 2) 다음 완료 이벤트까지 진행 (단, 21:00 마감 초과 금지)
    const active = gs.filter((g) => g.remaining > EPS && g.headcount > 0);
    if (active.length === 0) break;
    let dt = Infinity;
    for (const g of active) dt = Math.min(dt, g.remaining / g.headcount);
    const dtCapped = Math.min(dt, maxTime - time);
    for (const g of active) g.remaining -= g.headcount * dtCapped;
    time += dtCapped;

    // 완료 그룹 → 인원 여유 풀로
    for (const g of gs) {
      if (g.remaining <= EPS && g.headcount > 0) {
        closeSeg(g, 0);
        g.finishTime = time;
        for (let i = 0; i < g.headcount; i++) freePool.push({ origin: g.name });
        g.headcount = 0;
        g.remaining = 0;
      }
    }
    if (time >= maxTime - EPS) break; // 21:00 마감
  }

  // 열린 세그먼트 닫기
  for (const g of gs) {
    if (g.segHc > 0 && g.segStart < time - EPS) {
      g.segments.push({ start: g.segStart, end: time, headcount: g.segHc });
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
      finishTime: g.remaining > EPS ? null : g.finishTime, // 이월이면 완료시각 없음
      carryHours: Math.max(0, g.remaining),
      urgent: g.urgent,
    })),
    totalLoad,
    totalPeople,
    totalCarry,
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
