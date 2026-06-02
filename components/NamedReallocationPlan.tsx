"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatHM,
  splitWorkSegment,
  workTimeToWall,
  STANDARD_WORKTIME,
  MAX_WORKTIME,
  type ReallocResult,
} from "@/lib/calc/reallocation";
import { X } from "lucide-react";

interface Props {
  result: ReallocResult;
  lineWorkers: Record<string, string[]>;
  overrides: Record<string, string>;
  setOverrides: (next: Record<string, string>) => void;
}

// 이름 지정 간트 — 막대 안에 작업자 이름이 보이고, 이름을 클릭해 이동 명령
export function NamedReallocationPlan({
  result,
  lineWorkers,
  overrides,
  setOverrides,
}: Props) {
  // 간트 축
  const AXIS_START = 8.5;
  const AXIS_END = 21.0;
  const span = AXIS_END - AXIS_START;
  const pct = (wall: number) => ((wall - AXIS_START) / span) * 100;

  const BLOCK_TICKS = [
    8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.0, 19.0, 20.0,
    21.0,
  ];
  const BREAK_BANDS = [
    { start: 12.5, end: 13.5 },
    { start: 17.5, end: 18.0 },
  ];

  // 이동 정렬 (NamedMovesPanel과 동일하게)
  const sortedMoves = useMemo(
    () =>
      [...result.moves].sort(
        (a, b) => a.time - b.time || a.from.localeCompare(b.from)
      ),
    [result.moves]
  );

  // 시뮬레이션 + override 를 시간순으로 재생하며 라인별 작업자 스냅샷 계산
  const snapshots = useMemo(() => {
    const current: Record<string, string[]> = {};
    for (const k of Object.keys(lineWorkers)) current[k] = [...lineWorkers[k]];

    // line -> sorted list of {time, workers}
    const out: Record<string, { time: number; workers: string[] }[]> = {};
    for (const k of Object.keys(current)) {
      out[k] = [{ time: 0, workers: [...current[k]] }];
    }
    // ensure timelines lines exist in out (zero-load may not have lineWorkers)
    for (const t of result.timelines) {
      if (!out[t.name]) out[t.name] = [{ time: 0, workers: [] }];
      if (!current[t.name]) current[t.name] = [];
    }

    // Group moves by time
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
      for (const k of Object.keys(current)) {
        if (!out[k]) out[k] = [];
        out[k].push({ time: t, workers: [...current[k]] });
      }
    }
    return out;
  }, [sortedMoves, lineWorkers, overrides, result.timelines]);

  // (line, workTime) 의 작업자 — snapshots에서 ≤ time 인 최신 스냅샷
  const workersAt = (line: string, time: number): string[] => {
    const arr = snapshots[line];
    if (!arr || arr.length === 0) return [];
    let best = arr[0].workers;
    for (const s of arr) {
      if (s.time <= time + 1e-9) best = s.workers;
      else break;
    }
    return best;
  };

  // 클릭 상태
  const [clicked, setClicked] = useState<{
    worker: string;
    from: string;
    time: number;
  } | null>(null);

  // 이 작업자에 대해 'time 이후 from 라인에서 다른 라인으로의' 시뮬레이션 예정 이동 슬롯
  const candidateDests = useMemo(() => {
    if (!clicked) return [];
    const out: { to: string; key: string; time: number }[] = [];
    let mi = 0;
    for (const m of sortedMoves) {
      if (
        m.from === clicked.from &&
        m.time >= clicked.time - 1e-9 &&
        m.to !== clicked.from
      ) {
        for (let si = 0; si < m.count; si++) {
          out.push({ to: m.to, key: `${mi}-${si}`, time: m.time });
        }
      }
      mi++;
    }
    return out;
  }, [clicked, sortedMoves]);

  const trackBackground = (
    <>
      {BREAK_BANDS.map((b, i) => (
        <div
          key={`brk-${i}`}
          className="absolute top-0 bottom-0 bg-slate-200/70"
          style={{
            left: `${pct(b.start)}%`,
            width: `${pct(b.end) - pct(b.start)}%`,
          }}
        />
      ))}
      {BLOCK_TICKS.map((t, i) => (
        <div
          key={`tick-${i}`}
          className="absolute top-0 bottom-0 border-l border-slate-300/60"
          style={{ left: `${pct(t)}%` }}
        />
      ))}
    </>
  );

  const handleWorkerClick = (worker: string, line: string, time: number) => {
    setClicked({ worker, from: line, time });
  };

  // 도착지 선택 → 해당 destination의 첫 번째 미할당 슬롯에 worker override
  const handleAssign = (to: string) => {
    if (!clicked) return;
    // 같은 to 의 슬롯들 중 아직 다른 사람이 override되지 않은(또는 이 사람과 같은) 첫 슬롯
    const slot = candidateDests.find(
      (d) => d.to === to && overrides[d.key] !== clicked.worker
    );
    if (slot) {
      setOverrides({ ...overrides, [slot.key]: clicked.worker });
    }
    setClicked(null);
  };

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-900 mb-3">
        재배치 (이름 지정 · 이름 클릭으로 이동 명령)
      </h2>

      {/* 시간축 */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-28 flex-shrink-0" />
        <div className="flex-1 relative h-4">
          {BLOCK_TICKS.map((t, i) => (
            <span
              key={i}
              className="absolute text-[10px] text-slate-400 -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${pct(t)}%` }}
            >
              {formatHM(t)}
            </span>
          ))}
        </div>
        <div className="w-24 flex-shrink-0" />
      </div>

      <div className="space-y-1.5">
        {result.timelines.map((t) => (
          <div key={t.name} className="flex items-center gap-2">
            <div className="w-28 flex-shrink-0 flex items-center gap-1">
              {t.urgent && (
                <span
                  className="text-rose-600 text-base leading-none flex-shrink-0"
                  title="긴급건 라인"
                >
                  ●
                </span>
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-xs font-medium text-slate-700 truncate">
                  {t.name}
                </div>
                {t.loadHours > 0.01 && (
                  <div className="text-[10px] text-slate-400">
                    {t.loadHours.toFixed(1)}인시
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 relative h-12 bg-slate-50 rounded overflow-hidden">
              {trackBackground}
              {/* 작업없음 영역 (배경) */}
              {(() => {
                const REG = STANDARD_WORKTIME;
                const maxEnd = t.segments.reduce(
                  (mx, s) => (s.base + s.added > 0 ? Math.max(mx, s.end) : mx),
                  0
                );
                const limit = maxEnd > REG + 1e-9 ? MAX_WORKTIME : REG;
                const staffed = t.segments
                  .filter((s) => s.base + s.added > 0)
                  .map((s) => ({
                    start: Math.max(0, s.start),
                    end: Math.min(limit, s.end),
                  }))
                  .filter((s) => s.end > s.start + 1e-9)
                  .sort((a, b) => a.start - b.start);
                const gaps: { start: number; end: number }[] = [];
                let cur = 0;
                for (const s of staffed) {
                  if (s.start > cur + 1e-9)
                    gaps.push({ start: cur, end: s.start });
                  cur = Math.max(cur, s.end);
                }
                if (cur < limit - 1e-9) gaps.push({ start: cur, end: limit });
                return gaps.flatMap((gp, gi) =>
                  splitWorkSegment(gp.start, gp.end).map((w, wi) => (
                    <div
                      key={`g-${gi}-${wi}`}
                      className="absolute top-0 bottom-0 bg-white border border-slate-200"
                      style={{
                        left: `${pct(w.start)}%`,
                        width: `${Math.max(pct(w.end) - pct(w.start), 0)}%`,
                      }}
                    />
                  ))
                );
              })()}
              {/* 작업 막대 (이름 표시) */}
              {t.segments.flatMap((seg, si) => {
                const total = seg.base + seg.added;
                if (total === 0) return null;
                const names = workersAt(t.name, seg.start);
                return splitWorkSegment(seg.start, seg.end).map((w, wi) => {
                  const widthPct = Math.max(pct(w.end) - pct(w.start), 1.5);
                  return (
                    <div
                      key={`s-${si}-${wi}`}
                      className={cn(
                        "absolute top-0 bottom-0 rounded flex items-center justify-center gap-0.5 px-0.5 overflow-hidden",
                        seg.added > 0
                          ? "bg-yellow-100 border border-yellow-300"
                          : "bg-blue-500"
                      )}
                      style={{
                        left: `${pct(w.start)}%`,
                        width: `${widthPct}%`,
                      }}
                    >
                      {names.slice(0, total).map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleWorkerClick(name, t.name, w.start);
                          }}
                          className={cn(
                            "text-[10px] font-bold leading-none px-1 py-0.5 rounded hover:ring-2 hover:ring-orange-400 whitespace-nowrap truncate",
                            seg.added > 0
                              ? "text-slate-800"
                              : "text-white hover:bg-blue-600"
                          )}
                          title={`${name} · ${formatHM(w.start)}~${formatHM(w.end)} · 클릭해서 이동 명령`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  );
                });
              })}
            </div>
            <div className="w-24 flex-shrink-0 text-xs text-right leading-tight">
              {t.loadHours <= 0.01 ? (
                <span className="text-slate-300">—</span>
              ) : t.finishTime !== null ? (
                <span className="text-slate-500">
                  {formatHM(workTimeToWall(t.finishTime))}
                </span>
              ) : (
                <span className="text-amber-700 font-medium whitespace-nowrap">
                  {t.carryHours.toFixed(1)}인시 이월
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-slate-400">
        · 작업자 이름을 클릭해서 이동 명령을 내릴 수 있습니다 · 가능한 이동은
        시뮬레이션이 계획한 출발 라인의 도착지로 제한됩니다
      </div>

      {/* 클릭 팝업 */}
      {clicked && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setClicked(null)}
        >
          <div
            className="bg-white rounded-lg p-5 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {clicked.worker} 이동 명령
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {formatHM(workTimeToWall(clicked.time))} 시점 ·{" "}
                  {clicked.from} 에서 어느 라인으로?
                </p>
              </div>
              <button
                onClick={() => setClicked(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-1">
              {Array.from(new Set(candidateDests.map((d) => d.to))).map(
                (to) => (
                  <button
                    key={to}
                    type="button"
                    onClick={() => handleAssign(to)}
                    className="w-full text-left px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded text-sm"
                  >
                    → {to} 으로 보내기
                  </button>
                )
              )}
              {candidateDests.length === 0 && (
                <p className="text-sm text-slate-500 px-1">
                  이 시점 이후 {clicked.from} 에서 다른 라인으로의 예정 이동이
                  없습니다.
                </p>
              )}
            </div>
            <button
              onClick={() => setClicked(null)}
              className="mt-4 w-full px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
