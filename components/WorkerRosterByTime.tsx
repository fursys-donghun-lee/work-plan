"use client";

import { useMemo } from "react";
import {
  formatHM,
  workTimeToWall,
  MAX_WORKTIME,
  type ReallocResult,
} from "@/lib/calc/reallocation";
import { Users } from "lucide-react";

interface Props {
  result: ReallocResult;
  lineWorkers: Record<string, string[]>;
  overrides: Record<string, string>;
}

// 시간대별 라인 작업자 정리 — 이동 이벤트 사이의 안정된 구간(period)별로
// 어느 라인에 어떤 작업자가 있는지 정리해 표시
export function WorkerRosterByTime({
  result,
  lineWorkers,
  overrides,
}: Props) {
  // 이동 정렬 (NamedReallocationPlan 과 일치)
  const sortedMoves = useMemo(
    () =>
      [...result.moves].sort(
        (a, b) => a.time - b.time || a.from.localeCompare(b.from)
      ),
    [result.moves]
  );

  // 이벤트 시각 → 그 시각 직후의 라인별 작업자 상태
  const snapshotsByTime = useMemo(() => {
    const current: Record<string, string[]> = {};
    for (const k of Object.keys(lineWorkers)) current[k] = [...lineWorkers[k]];
    for (const t of result.timelines) {
      if (!current[t.name]) current[t.name] = [];
    }

    const snaps = new Map<number, Record<string, string[]>>();
    // 초기 상태 (time=0)
    snaps.set(0, JSON.parse(JSON.stringify(current)));

    const byTime = new Map<number, typeof sortedMoves>();
    for (const m of sortedMoves) {
      const arr = byTime.get(m.time) ?? [];
      arr.push(m);
      byTime.set(m.time, arr);
    }
    const times = Array.from(byTime.keys()).sort((a, b) => a - b);
    let mi = 0;
    for (const t of times) {
      const ms = byTime.get(t)!;
      for (const m of ms) {
        for (let si = 0; si < m.count; si++) {
          const key = `${mi}-${si}`;
          const ov = overrides[key];
          const fromList = current[m.from] ?? [];
          const worker =
            ov && fromList.includes(ov) ? ov : fromList[0] ?? null;
          if (worker) {
            current[m.from] = fromList.filter((w) => w !== worker);
            current[m.to] = [...(current[m.to] ?? []), worker];
          }
        }
        mi++;
      }
      snaps.set(t, JSON.parse(JSON.stringify(current)));
    }
    return snaps;
  }, [sortedMoves, lineWorkers, overrides, result.timelines]);

  // 시간대 (period) 만들기 — 이벤트 시각 정렬 + 마지막은 MAX_WORKTIME
  const periods = useMemo(() => {
    const eventTimes = new Set<number>([0]);
    for (const m of sortedMoves) eventTimes.add(m.time);
    eventTimes.add(MAX_WORKTIME);
    const sorted = Array.from(eventTimes).sort((a, b) => a - b);
    const out: { start: number; end: number }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const s = sorted[i];
      const e = sorted[i + 1];
      if (e > s + 1e-9) out.push({ start: s, end: e });
    }
    return out;
  }, [sortedMoves]);

  // 각 period 의 라인별 작업자 (period.start 시점의 스냅샷)
  const periodSnapshots = useMemo(() => {
    return periods.map((p) => {
      // 가장 큰 ≤ p.start 시각의 스냅샷 찾기
      let best: Record<string, string[]> | null = null;
      let bestT = -Infinity;
      for (const [t, snap] of snapshotsByTime.entries()) {
        if (t <= p.start + 1e-9 && t > bestT) {
          best = snap;
          bestT = t;
        }
      }
      return { period: p, lines: best ?? {} };
    });
  }, [periods, snapshotsByTime]);

  // 표시 라인 순서: result.timelines 순서 (보조 라인은 자동으로 부모 옆에 위치함)
  const lineOrder = useMemo(
    () => result.timelines.map((t) => t.name),
    [result.timelines]
  );

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-blue-600" />
        시간대별 라인 작업자 정리
        <span className="text-xs font-normal text-slate-500">
          이동 사이의 안정 구간별로
        </span>
      </h2>

      <div className="space-y-3">
        {periodSnapshots.map(({ period, lines }) => {
          // 이 period 에 작업자가 있는 라인만 표시 (효율 60% 솔로 포함)
          const linesWithWorkers = lineOrder
            .map((name) => ({ name, workers: lines[name] ?? [] }))
            .filter((l) => l.workers.length > 0);
          // 부하 없음/대기 라인 (작업자 0명)도 일부 표시할지? — 우선 작업 중 라인만
          if (linesWithWorkers.length === 0) return null;
          return (
            <div
              key={`${period.start}-${period.end}`}
              className="border border-slate-200 rounded-lg p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-slate-700">
                  {formatHM(workTimeToWall(period.start))} ~{" "}
                  {formatHM(workTimeToWall(period.end))}
                </span>
                <span className="text-xs text-slate-500">
                  · {linesWithWorkers.length}개 라인 가동
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {linesWithWorkers.map((l) => (
                  <div
                    key={l.name}
                    className="flex items-baseline gap-2 text-sm bg-slate-50 rounded px-2 py-1.5"
                  >
                    <span className="font-semibold text-slate-700 min-w-[5rem]">
                      {l.name}
                    </span>
                    <span className="text-slate-600">
                      {l.workers.join(", ")}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-400">
                      {l.workers.length}명
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
