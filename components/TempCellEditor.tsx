"use client";

import { useMemo, useState } from "react";
import {
  formatHM,
  workTimeToWall,
  MAX_WORKTIME,
  type ReallocResult,
} from "@/lib/calc/reallocation";
import { Plus, Trash2 } from "lucide-react";

export interface TempCell {
  id: string;
  parentLine: string;
  startWt: number; // work-time (0~11)
  endWt: number;
  workerNames: string[]; // 배치된 작업자
}

interface Props {
  result: ReallocResult;
  lineWorkers: Record<string, string[]>;
  overrides: Record<string, string>;
  tempCells: TempCell[];
  setTempCells: (next: TempCell[]) => void;
}

// 1시간 단위 work-time 옵션 (work-time 0 = 08:30, …)
const TIME_OPTIONS: { wt: number; label: string }[] = [];
for (let t = 0; t <= MAX_WORKTIME; t++) {
  TIME_OPTIONS.push({ wt: t, label: formatHM(workTimeToWall(t)) });
}

// 라인별 시뮬레이션 점유 상태(2-pass) 를 사용해 시각 T의 가용(비작업) 인원 계산
function computeAtTimeWorkers(
  result: ReallocResult,
  lineWorkers: Record<string, string[]>,
  overrides: Record<string, string>,
  timeWt: number
): { onLine: Set<string>; allWorkers: string[] } {
  // sortedMoves
  const sorted = [...result.moves].sort(
    (a, b) => a.time - b.time || a.from.localeCompare(b.from)
  );
  const current: Record<string, string[]> = {};
  for (const k of Object.keys(lineWorkers)) current[k] = [...lineWorkers[k]];
  for (const t of result.timelines) {
    if (!current[t.name]) current[t.name] = [];
  }

  const byTime = new Map<
    number,
    { m: (typeof sorted)[number]; mi: number }[]
  >();
  sorted.forEach((m, idx) => {
    const arr = byTime.get(m.time) ?? [];
    arr.push({ m, mi: idx });
    byTime.set(m.time, arr);
  });
  const times = Array.from(byTime.keys()).sort((a, b) => a - b);

  // 시점 timeWt 까지의 이동을 적용
  for (const t of times) {
    if (t > timeWt + 1e-9) break;
    const movesAtT = byTime.get(t)!;
    const slotAssignments: Record<number, string[]> = {};
    for (const { m, mi } of movesAtT)
      slotAssignments[mi] = Array(m.count).fill("");

    for (const { m, mi } of movesAtT) {
      for (let si = 0; si < m.count; si++) {
        const key = `${mi}-${si}`;
        const ov = overrides[key];
        if (
          ov &&
          (current[m.from] ?? []).includes(ov) &&
          !slotAssignments[mi].includes(ov)
        ) {
          slotAssignments[mi][si] = ov;
          current[m.from] = (current[m.from] ?? []).filter((w) => w !== ov);
          current[m.to] = [...(current[m.to] ?? []), ov];
        }
      }
    }
    for (const { m, mi } of movesAtT) {
      for (let si = 0; si < m.count; si++) {
        if (slotAssignments[mi][si]) continue;
        const fromList = current[m.from] ?? [];
        const worker = fromList[0] ?? "";
        if (worker) {
          current[m.from] = fromList.filter((w) => w !== worker);
          current[m.to] = [...(current[m.to] ?? []), worker];
        }
      }
    }
  }

  // 그 시각 어느 라인이 작업 중인지 확인 (segment 가 timeWt 를 포함하면 그 라인의 현재 인원은 작업 중)
  const onLine = new Set<string>();
  for (const tl of result.timelines) {
    const seg = tl.segments.find(
      (s) => s.start <= timeWt + 1e-9 && s.end > timeWt + 1e-9
    );
    if (seg && seg.base + seg.added > 0) {
      for (const w of current[tl.name] ?? []) onLine.add(w);
    }
  }
  const allWorkers = Object.values(lineWorkers).flat();
  return { onLine, allWorkers };
}

export function TempCellEditor({
  result,
  lineWorkers,
  overrides,
  tempCells,
  setTempCells,
}: Props) {
  const [adding, setAdding] = useState(false);

  // 가용 후보: 부하 있는 라인 (이월/잔업 위험 우선)
  const parentCandidates = useMemo(
    () => result.timelines.filter((t) => t.loadHours > 0.01 && !t.autoManaged),
    [result.timelines]
  );

  const addNewCell = () => {
    const defaultParent =
      parentCandidates.find((t) => t.carryHours > 0.5)?.name ??
      parentCandidates[0]?.name ??
      "";
    const newCell: TempCell = {
      id: `tc-${Date.now()}`,
      parentLine: defaultParent,
      startWt: 8, // 18:00 (잔업 시작)
      endWt: 11, // 21:00 (잔업 끝)
      workerNames: [],
    };
    setTempCells([...tempCells, newCell]);
    setAdding(false);
  };

  const updateCell = (id: string, patch: Partial<TempCell>) => {
    setTempCells(tempCells.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeCell = (id: string) => {
    setTempCells(tempCells.filter((c) => c.id !== id));
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900">
          임시 셀 운영
          <span className="ml-2 text-xs font-normal text-slate-500">
            이월 부담이 큰 라인을 위한 보조 작업 셀을 시간대별로 구성
          </span>
        </h2>
        <button
          type="button"
          onClick={addNewCell}
          className="flex items-center gap-1 text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded"
        >
          <Plus className="w-4 h-4" />
          임시 셀 추가
        </button>
      </div>

      {tempCells.length === 0 ? (
        <p className="text-sm text-slate-500">
          아직 등록된 임시 셀이 없습니다. 위 "임시 셀 추가" 버튼으로 생성하세요.
          (예: MA-03 이월 부하가 클 때, 잔업시간(18:00~21:00) 동안 2명을
          배치해 6인시 추가 처리)
        </p>
      ) : (
        <div className="space-y-3">
          {tempCells.map((cell, idx) => {
            const cellDuration = Math.max(0, cell.endWt - cell.startWt);
            const peopleCount = cell.workerNames.length;
            const effectiveLoad = peopleCount === 1
              ? cellDuration * 0.6 // 1명 60%
              : peopleCount * cellDuration;
            const { onLine, allWorkers } = computeAtTimeWorkers(
              result,
              lineWorkers,
              overrides,
              cell.startWt
            );
            const available = allWorkers.filter(
              (w) => !onLine.has(w) && !cell.workerNames.includes(w)
            );

            return (
              <div
                key={cell.id}
                className="border border-slate-200 rounded-lg p-3 bg-slate-50/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">
                    임시 셀 #{idx + 1}
                  </span>
                  <button
                    onClick={() => removeCell(cell.id)}
                    className="text-slate-400 hover:text-rose-600"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                  <label className="text-xs">
                    <span className="text-slate-500 block mb-0.5">
                      부모 라인
                    </span>
                    <select
                      value={cell.parentLine}
                      onChange={(e) =>
                        updateCell(cell.id, { parentLine: e.target.value })
                      }
                      className="w-full text-sm border border-slate-300 rounded px-2 py-1"
                    >
                      {parentCandidates.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                          {t.carryHours > 0.5
                            ? ` (이월 ${t.carryHours.toFixed(1)}인시)`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="text-slate-500 block mb-0.5">
                      시작 시각
                    </span>
                    <select
                      value={cell.startWt}
                      onChange={(e) =>
                        updateCell(cell.id, {
                          startWt: Number(e.target.value),
                        })
                      }
                      className="w-full text-sm border border-slate-300 rounded px-2 py-1"
                    >
                      {TIME_OPTIONS.filter(
                        (o) => o.wt < MAX_WORKTIME
                      ).map((o) => (
                        <option key={o.wt} value={o.wt}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="text-slate-500 block mb-0.5">
                      종료 시각
                    </span>
                    <select
                      value={cell.endWt}
                      onChange={(e) =>
                        updateCell(cell.id, { endWt: Number(e.target.value) })
                      }
                      className="w-full text-sm border border-slate-300 rounded px-2 py-1"
                    >
                      {TIME_OPTIONS.filter((o) => o.wt > cell.startWt).map(
                        (o) => (
                          <option key={o.wt} value={o.wt}>
                            {o.label}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>
                <div className="mb-2">
                  <div className="text-xs text-slate-500 mb-1">
                    배치 작업자 (이 시각 가용·비작업 인원만)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cell.workerNames.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() =>
                          updateCell(cell.id, {
                            workerNames: cell.workerNames.filter((x) => x !== w),
                          })
                        }
                        className="text-xs px-2 py-1 rounded bg-purple-500 hover:bg-purple-600 text-white font-medium"
                        title="클릭해서 제거"
                      >
                        {w} ×
                      </button>
                    ))}
                    {cell.workerNames.length < 2 && available.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          updateCell(cell.id, {
                            workerNames: [
                              ...cell.workerNames,
                              e.target.value,
                            ],
                          });
                        }}
                        className="text-xs border border-slate-300 rounded px-2 py-1"
                      >
                        <option value="">+ 작업자 추가</option>
                        {available.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    )}
                    {cell.workerNames.length === 0 && available.length === 0 && (
                      <span className="text-xs text-rose-600">
                        이 시각 가용 작업자가 없습니다
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                  <span>
                    가동 시간:{" "}
                    <b className="text-slate-700">
                      {formatHM(workTimeToWall(cell.startWt))} ~{" "}
                      {formatHM(workTimeToWall(cell.endWt))}
                    </b>{" "}
                    ({cellDuration}h)
                  </span>
                  <span>
                    배치:{" "}
                    <b className="text-slate-700">{peopleCount}명</b>
                  </span>
                  <span>
                    처리 부하:{" "}
                    <b className="text-emerald-700">
                      {effectiveLoad.toFixed(1)}인시
                    </b>{" "}
                    {peopleCount === 1 && "(1인 60% 적용)"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
