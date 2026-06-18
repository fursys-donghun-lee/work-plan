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
import type { TempCell } from "@/components/TempCellEditor";

interface Props {
  result: ReallocResult;
  lineWorkers: Record<string, string[]>;
  overrides: Record<string, string>;
  setOverrides: (next: Record<string, string>) => void;
  tempCells?: TempCell[];
}

// 이름 지정 간트 — 막대에 작업자 이름 표시, '이동시킬 것' 라벨 클릭으로 누가 갈지 결정
export function NamedReallocationPlan({
  result,
  lineWorkers,
  overrides,
  setOverrides,
  tempCells = [],
}: Props) {
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

  // 이동 일관 정렬 (NamedMovesPanel/WorkerRoster와 동일)
  const sortedMoves = useMemo(
    () =>
      [...result.moves].sort(
        (a, b) => a.time - b.time || a.from.localeCompare(b.from)
      ),
    [result.moves]
  );

  // 시간순 작업자 스냅샷 + 이동별 배정 추적 (2-pass: override 먼저 적용 후 나머지)
  // preTimeSourceWorkers[moveIdx] = 이 시각·출발 라인의 이동 처리 전 원본 작업자 목록
  // (팝업 후보 목록으로 사용 — 같은 시각 다른 이동에 빠지기 전 상태)
  const { snapshots, moveAssignments, preTimeSourceWorkers, moveIndexInSorted } = useMemo(() => {
    const current: Record<string, string[]> = {};
    for (const k of Object.keys(lineWorkers)) current[k] = [...lineWorkers[k]];
    for (const t of result.timelines) {
      if (!current[t.name]) current[t.name] = [];
    }

    const out: Record<string, { time: number; workers: string[] }[]> = {};
    for (const k of Object.keys(current)) {
      out[k] = [{ time: 0, workers: [...current[k]] }];
    }
    const assignments: string[][] = [];
    const preSrc: Record<number, string[]> = {};
    const moveIndex: Record<number, number> = {}; // 정렬된 인덱스 매핑 (sortedMoves index)

    const byTime = new Map<number, { m: (typeof sortedMoves)[number]; mi: number }[]>();
    sortedMoves.forEach((m, idx) => {
      const arr = byTime.get(m.time) ?? [];
      arr.push({ m, mi: idx });
      byTime.set(m.time, arr);
    });
    const times = Array.from(byTime.keys()).sort((a, b) => a - b);

    for (const t of times) {
      const movesAtT = byTime.get(t)!;
      // 1) 이 시각의 모든 출발 라인의 사전 상태 저장 (팝업 후보용)
      const fromLines = new Set(movesAtT.map(({ m }) => m.from));
      const preState: Record<string, string[]> = {};
      for (const L of fromLines) preState[L] = [...(current[L] ?? [])];
      for (const { m, mi } of movesAtT) {
        preSrc[mi] = [...preState[m.from]];
        moveIndex[mi] = mi;
      }

      // 2) Pass 1: override 가 있고 출발 라인 원본에 존재하는 슬롯부터 처리
      const slotAssignments: Record<number, string[]> = {};
      for (const { m, mi } of movesAtT) slotAssignments[mi] = Array(m.count).fill("");

      for (const { m, mi } of movesAtT) {
        for (let si = 0; si < m.count; si++) {
          const key = `${mi}-${si}`;
          const ov = overrides[key];
          if (
            ov &&
            (current[m.from] ?? []).includes(ov) &&
            // 같은 이동 내 다른 슬롯이 이미 같은 사람을 가져가지 않았는지 (중복 방지)
            !slotAssignments[mi].includes(ov)
          ) {
            slotAssignments[mi][si] = ov;
            current[m.from] = (current[m.from] ?? []).filter((w) => w !== ov);
            current[m.to] = [...(current[m.to] ?? []), ov];
          }
        }
      }

      // 3) Pass 2: override 없는(또는 실패한) 슬롯에 남은 작업자 중 첫 번째 배정
      for (const { m, mi } of movesAtT) {
        for (let si = 0; si < m.count; si++) {
          if (slotAssignments[mi][si]) continue;
          const fromList = current[m.from] ?? [];
          const worker = fromList[0] ?? "";
          if (worker) {
            slotAssignments[mi][si] = worker;
            current[m.from] = fromList.filter((w) => w !== worker);
            current[m.to] = [...(current[m.to] ?? []), worker];
          }
        }
        assignments[mi] = slotAssignments[mi];
      }

      // 4) 시간 T 끝 — 스냅샷 저장
      for (const k of Object.keys(current)) {
        if (!out[k]) out[k] = [];
        out[k].push({ time: t, workers: [...current[k]] });
      }
    }
    return {
      snapshots: out,
      moveAssignments: assignments,
      preTimeSourceWorkers: preSrc,
      moveIndexInSorted: moveIndex,
    };
  }, [sortedMoves, lineWorkers, overrides, result.timelines]);

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

  // 출발 라인별 외향 이동 (이동 라벨 렌더링용) — sortedMoves 인덱스 보존
  const outgoingByLineTime = useMemo(() => {
    const map = new Map<
      string,
      Map<
        number,
        { to: string; count: number; moveIdx: number }[]
      >
    >();
    let mi = 0;
    for (const m of sortedMoves) {
      if (!map.has(m.from)) map.set(m.from, new Map());
      const byT = map.get(m.from)!;
      const arr = byT.get(m.time) ?? [];
      arr.push({ to: m.to, count: m.count, moveIdx: mi });
      byT.set(m.time, arr);
      mi++;
    }
    return map;
  }, [sortedMoves]);

  // 이동 라벨 클릭 시 팝업 상태
  const [pillModal, setPillModal] = useState<{
    from: string;
    to: string;
    time: number;
    count: number;
    moveIdx: number;
  } | null>(null);

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

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-900 mb-3">
        재배치 (이름 지정)
        <span className="ml-2 text-xs font-normal text-slate-500">
          노란색 = 인원 이동 / 파란색 = 그대로 유지 · 주황 라벨 클릭으로 누가 갈지
          지정
        </span>
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
        {result.timelines.map((t) => {
          const linesTempCells = tempCells.filter((c) => c.parentLine === t.name);
          return (
        <div key={t.name}>
          <div className="flex items-center gap-2">
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
                    {t.loadHours.toFixed(1)}H
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 relative h-12 bg-slate-50 rounded overflow-hidden">
              {trackBackground}
              {/* 작업없음 영역 */}
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
              {/* 작업 막대 (이름 표시, 클릭 X) */}
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
                          ? "bg-yellow-200 border border-yellow-400"
                          : "bg-blue-500"
                      )}
                      style={{
                        left: `${pct(w.start)}%`,
                        width: `${widthPct}%`,
                      }}
                      title={`${formatHM(w.start)}~${formatHM(w.end)} · ${names.slice(0, total).join(", ")}`}
                    >
                      {names.slice(0, total).map((name) => (
                        <span
                          key={name}
                          className={cn(
                            "text-[10px] font-bold leading-none px-1 whitespace-nowrap truncate",
                            seg.added > 0 ? "text-slate-800" : "text-white"
                          )}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  );
                });
              })}
              {/* 이동 라벨 (주황) — 클릭으로 누가 갈지 지정 */}
              {(() => {
                const byTime = outgoingByLineTime.get(t.name);
                if (!byTime || byTime.size === 0) return null;
                return Array.from(byTime.entries()).map(([time, ms]) => {
                  const xPct = pct(workTimeToWall(time));
                  return (
                    <div
                      key={`out-${time}`}
                      className="absolute top-1/2 -translate-y-1/2 flex flex-col gap-0.5 z-10"
                      style={{ left: `${xPct}%`, paddingLeft: 4 }}
                    >
                      {ms.map((m) => {
                        const assigned = (moveAssignments[m.moveIdx] ?? []).filter(
                          (n) => n
                        );
                        return (
                          <button
                            key={`${m.moveIdx}`}
                            type="button"
                            onClick={() =>
                              setPillModal({
                                from: t.name,
                                to: m.to,
                                time,
                                count: m.count,
                                moveIdx: m.moveIdx,
                              })
                            }
                            className="text-[11px] font-bold leading-none px-2 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white shadow whitespace-nowrap cursor-pointer"
                            title="클릭해서 누가 이동할지 지정"
                          >
                            {m.to}으로 {m.count}명 이동
                            {assigned.length > 0
                              ? `(${assigned.join(", ")})`
                              : ""}
                          </button>
                        );
                      })}
                    </div>
                  );
                });
              })()}
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
                  {t.carryHours.toFixed(1)}H 이월
                </span>
              )}
            </div>
          </div>
          {/* 임시 셀 행 — 부모 라인 바로 아래 (점선 테두리로 구분) */}
          {linesTempCells.map((cell, ci) => (
            <div
              key={cell.id}
              className="flex items-center gap-2 mt-1.5 pl-1 pr-1 py-0.5 rounded border-2 border-dashed border-amber-600 bg-amber-50/50"
            >
              <div className="w-28 flex-shrink-0 flex items-center gap-1">
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-xs font-bold text-amber-700 truncate">
                    {t.name} 임시 #{ci + 1}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {cell.workerNames.length === 1
                      ? "1명 60%"
                      : `${cell.workerNames.length}명`}
                  </div>
                </div>
              </div>
              <div className="flex-1 relative h-12 bg-slate-50 rounded overflow-hidden">
                {trackBackground}
                {/* 임시 셀 작업 막대 (노란색 + 점선 테두리로 임시 표시) */}
                {(() => {
                  if (
                    cell.workerNames.length === 0 ||
                    cell.endWt <= cell.startWt
                  )
                    return null;
                  return splitWorkSegment(cell.startWt, cell.endWt).map(
                    (w, wi) => {
                      const widthPct = Math.max(
                        pct(w.end) - pct(w.start),
                        1.5
                      );
                      return (
                        <div
                          key={`tc-${wi}`}
                          className="absolute top-0 bottom-0 rounded flex items-center justify-center gap-0.5 px-0.5 overflow-hidden bg-yellow-300 border-2 border-dashed border-amber-700"
                          style={{
                            left: `${pct(w.start)}%`,
                            width: `${widthPct}%`,
                          }}
                          title={`${formatHM(w.start)}~${formatHM(w.end)} · 임시 셀 · ${cell.workerNames.join(", ")}`}
                        >
                          {cell.workerNames.map((name) => (
                            <span
                              key={name}
                              className="text-[10px] font-bold leading-none px-1 whitespace-nowrap truncate text-slate-900"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      );
                    }
                  );
                })()}
              </div>
              <div className="w-24 flex-shrink-0 text-xs text-right leading-tight">
                <span className="text-amber-700 font-bold whitespace-nowrap">
                  {(() => {
                    const dur = Math.max(0, cell.endWt - cell.startWt);
                    const eff =
                      cell.workerNames.length === 1
                        ? dur * 0.6
                        : cell.workerNames.length * dur;
                    return `+${eff.toFixed(1)}H`;
                  })()}
                </span>
              </div>
            </div>
          ))}
        </div>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500 inline-block" />
          파랑 = 인원 그대로 유지
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-400 inline-block" />
          노랑 = 인원 이동 발생
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500 text-white">
            OO으로 N명 이동(이름)
          </span>
          ← 클릭해서 누가 갈지 지정
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-white border border-slate-200 inline-block" />
          작업없음
        </span>
      </div>

      {/* 이동 지정 팝업 */}
      {pillModal &&
        (() => {
          // 후보 목록 = 이 시각의 이동들이 처리되기 전 출발 라인 원본 명단
          // (같은 시각 다른 이동에서 빠진 후가 아니라, '14:30 시점 PA-04' 원본)
          const sourceWorkers =
            preTimeSourceWorkers[pillModal.moveIdx] ??
            workersAt(pillModal.from, pillModal.time);
          // 이 이동에서 다른 슬롯에 이미 지정된 작업자 (한 이동 내 중복 방지)
          const otherSlotsPicked = (curSlot: number) =>
            Array.from({ length: pillModal.count })
              .map((_, i) =>
                i !== curSlot
                  ? overrides[`${pillModal.moveIdx}-${i}`] ?? null
                  : null
              )
              .filter((x): x is string => !!x);

          // 기본값: override 가 있으면 그 사람, 없으면 실제 배정된 사람 (2-pass 결과)
          const defaultForSlot = (i: number) =>
            overrides[`${pillModal.moveIdx}-${i}`] ??
            (moveAssignments[pillModal.moveIdx] ?? [])[i] ??
            sourceWorkers[0] ??
            "";

          return (
            <div
              className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
              onClick={() => setPillModal(null)}
            >
              <div
                className="bg-white rounded-lg p-5 max-w-md w-full shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-base text-slate-900">
                      이동 지정
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      <span className="font-semibold text-slate-700">
                        {formatHM(workTimeToWall(pillModal.time))}
                      </span>{" "}
                      · {pillModal.from} → {pillModal.to} ·{" "}
                      {pillModal.count}명 이동
                    </p>
                  </div>
                  <button
                    onClick={() => setPillModal(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-2 mb-4">
                  {Array.from({ length: pillModal.count }, (_, i) => {
                    const key = `${pillModal.moveIdx}-${i}`;
                    const picked = otherSlotsPicked(i);
                    const value = defaultForSlot(i);
                    const options = sourceWorkers.filter(
                      (w) => !picked.includes(w) || w === value
                    );
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="text-slate-500 w-16">
                          {i + 1}번째:
                        </span>
                        {sourceWorkers.length > 0 ? (
                          <select
                            value={value}
                            onChange={(e) =>
                              setOverrides({
                                ...overrides,
                                [key]: e.target.value,
                              })
                            }
                            className="flex-1 text-sm font-bold text-blue-700 bg-white border border-slate-300 rounded px-2 py-1"
                          >
                            {options.map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-rose-600 font-medium">
                            (출발 라인에 가용 작업자 없음)
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPillModal(null)}
                  className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded"
                >
                  완료
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
