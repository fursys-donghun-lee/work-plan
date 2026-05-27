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
  headcount: number;
}

export interface ReallocGroupTimeline {
  name: string;
  loadHours: number;
  initialHeadcount: number;
  segments: ReallocSegment[];
  finishTime: number | null; // 부하 없으면 null
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
  }));

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
  while (guard++ < 2000) {
    // 1) 여유 인력 → 병목 그룹 배치
    while (freePool.length > 0) {
      const candidates = gs.filter((g) => g.remaining > EPS);
      if (candidates.length === 0) break;
      // 병목: 현재 인원 기준 가장 늦게 끝나는 그룹 (인원 0이면 최우선)
      candidates.sort((a, b) => {
        const fa = a.headcount > 0 ? a.remaining / a.headcount : Infinity;
        const fb = b.headcount > 0 ? b.remaining / b.headcount : Infinity;
        return fb - fa;
      });
      const target = candidates[0];
      const worker = freePool.shift()!;
      closeSeg(target, target.headcount + 1);
      target.headcount += 1;
      rawMoves.push({ time, count: 1, from: worker.origin, to: target.name });
    }

    // 2) 다음 완료 이벤트까지 진행
    const active = gs.filter((g) => g.remaining > EPS && g.headcount > 0);
    if (active.length === 0) break;
    let dt = Infinity;
    for (const g of active) dt = Math.min(dt, g.remaining / g.headcount);
    for (const g of active) g.remaining -= g.headcount * dt;
    time += dt;

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
      finishTime: g.finishTime,
    })),
    totalLoad,
    totalPeople,
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
