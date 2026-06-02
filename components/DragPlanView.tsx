"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatHM,
  MAX_WORKTIME,
  type ReallocResult,
} from "@/lib/calc/reallocation";

interface Props {
  result: ReallocResult; // 라인 부하 정보용
  lineWorkers: Record<string, string[]>; // 출근 시 라인별 작업자
}

// 11 시간 슬롯 (work-time 0..10)
const HOUR_COUNT = MAX_WORKTIME; // 11

// 1명 60% 효율, 2명 100%, 0명 0
function ratePerHour(headcount: number): number {
  if (headcount <= 0) return 0;
  if (headcount === 1) return 0.6;
  return 2; // ≥2 (max 2 in practice)
}

// 수동 배치 (드래그앤드롭) — 라인별 시간 슬롯에 작업자 직접 배치
export function DragPlanView({ result, lineWorkers }: Props) {
  // assignments[workerName] = [line at hour 0, ..., hour HOUR_COUNT-1]
  const initialAssignments = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const [line, workers] of Object.entries(lineWorkers)) {
      for (const w of workers) {
        if (!m[w]) m[w] = Array(HOUR_COUNT).fill(line);
      }
    }
    return m;
  }, [lineWorkers]);

  const [assignments, setAssignments] =
    useState<Record<string, string[]>>(initialAssignments);

  // 모든 라인 이름 (timelines 순서, 자동 포함)
  const lineNames = useMemo(
    () => result.timelines.map((t) => t.name),
    [result.timelines]
  );

  // 라인별·시간별 현재 작업자
  const cellWorkers = useMemo(() => {
    const m: Record<string, string[][]> = {};
    for (const line of lineNames) {
      m[line] = Array.from({ length: HOUR_COUNT }, () => [] as string[]);
    }
    for (const w of Object.keys(assignments)) {
      const arr = assignments[w];
      for (let h = 0; h < HOUR_COUNT; h++) {
        const line = arr[h];
        if (!line) continue;
        if (!m[line]) m[line] = Array.from({ length: HOUR_COUNT }, () => []);
        m[line][h].push(w);
      }
    }
    return m;
  }, [assignments, lineNames]);

  // 라인별 처리 부하 (인시) 계산
  const consumed = useMemo(() => {
    const c: Record<string, number> = {};
    for (const line of lineNames) {
      let total = 0;
      for (let h = 0; h < HOUR_COUNT; h++) {
        const count = (cellWorkers[line]?.[h] ?? []).length;
        total += ratePerHour(count);
      }
      c[line] = total;
    }
    return c;
  }, [cellWorkers, lineNames]);

  // 라인 부하 lookup
  const loadByLine = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of result.timelines) m[t.name] = t.loadHours;
    return m;
  }, [result.timelines]);

  // 드래그 핸들러
  const [dragging, setDragging] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, worker: string) => {
    e.dataTransfer.setData("text/plain", worker);
    e.dataTransfer.effectAllowed = "move";
    setDragging(worker);
  };

  const handleDragEnd = () => setDragging(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // 드롭: destHour 부터 destLine 으로, 이전과 같은 값이 이어지는 한 propagate
  const handleDrop = (
    e: React.DragEvent,
    destLine: string,
    destHour: number
  ) => {
    e.preventDefault();
    const worker = e.dataTransfer.getData("text/plain");
    if (!worker) return;
    setAssignments((prev) => {
      const arr = [...(prev[worker] ?? Array(HOUR_COUNT).fill(""))];
      const oldLine = arr[destHour] ?? "";
      if (oldLine === destLine) return prev;
      for (let h = destHour; h < HOUR_COUNT; h++) {
        if (arr[h] === oldLine) arr[h] = destLine;
        else break;
      }
      return { ...prev, [worker]: arr };
    });
  };

  // 초기화
  const handleReset = () => setAssignments(initialAssignments);

  // 시간 슬롯 — 근무 셀과 휴게(점심·저녁) 셀이 섞여 있는 시간축
  type Slot =
    | { type: "work"; wt: number; wallStart: number; wallEnd: number; isOT: boolean; isFirstOT: boolean }
    | { type: "break"; label: string; wallStart: number; wallEnd: number };
  const slots: Slot[] = [
    { type: "work", wt: 0, wallStart: 8.5, wallEnd: 9.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 1, wallStart: 9.5, wallEnd: 10.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 2, wallStart: 10.5, wallEnd: 11.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 3, wallStart: 11.5, wallEnd: 12.5, isOT: false, isFirstOT: false },
    { type: "break", label: "점심", wallStart: 12.5, wallEnd: 13.5 },
    { type: "work", wt: 4, wallStart: 13.5, wallEnd: 14.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 5, wallStart: 14.5, wallEnd: 15.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 6, wallStart: 15.5, wallEnd: 16.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 7, wallStart: 16.5, wallEnd: 17.5, isOT: false, isFirstOT: false },
    { type: "break", label: "저녁", wallStart: 17.5, wallEnd: 18.0 },
    { type: "work", wt: 8, wallStart: 18.0, wallEnd: 19.0, isOT: true, isFirstOT: true },
    { type: "work", wt: 9, wallStart: 19.0, wallEnd: 20.0, isOT: true, isFirstOT: false },
    { type: "work", wt: 10, wallStart: 20.0, wallEnd: 21.0, isOT: true, isFirstOT: false },
  ];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900">
          수동 배치 (드래그앤드롭)
          <span className="ml-2 text-xs font-normal text-slate-500">
            작업자 칩을 다른 라인·시간으로 드래그해서 직접 배치
          </span>
        </h2>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded"
        >
          출근 위치로 초기화
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-600 w-32 min-w-[8rem]">
                라인
              </th>
              <th className="border-b border-slate-200 px-2 py-1 text-center font-semibold text-slate-600 w-24 min-w-[6rem]">
                부하/처리
              </th>
              {slots.map((s, idx) => {
                if (s.type === "break") {
                  return (
                    <th
                      key={`brk-${idx}`}
                      className="border-b border-slate-300 px-1 py-1 text-center w-10 min-w-[2.5rem] bg-slate-200/60"
                    >
                      <div className="text-[10px] font-semibold text-slate-600">
                        {s.label}
                      </div>
                      <div className="text-[8px] text-slate-500">
                        {formatHM(s.wallStart)}
                        <br />~{formatHM(s.wallEnd)}
                      </div>
                    </th>
                  );
                }
                return (
                  <th
                    key={`w-${s.wt}`}
                    className={cn(
                      "border-b border-slate-200 px-1 py-1 text-center w-20 min-w-[5rem]",
                      s.isOT && "bg-rose-50/40",
                      s.isFirstOT && "border-l-4 border-l-rose-500"
                    )}
                  >
                    <div className="text-[10px] font-medium text-slate-700 leading-tight">
                      {formatHM(s.wallStart)}
                      <br />~{formatHM(s.wallEnd)}
                    </div>
                    {s.isFirstOT && (
                      <div className="text-[9px] text-rose-600 font-bold mt-0.5">
                        잔업 시작
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lineNames.map((line) => {
              const load = loadByLine[line] ?? 0;
              const done = consumed[line] ?? 0;
              const isAuto = result.timelines.find((t) => t.name === line)
                ?.autoManaged;
              const tooltipState =
                load <= 0.01
                  ? "부하 없음"
                  : done >= load - 0.01
                    ? `완료 (여유 ${(done - load).toFixed(1)})`
                    : `이월 ${(load - done).toFixed(1)}인시`;
              return (
                <tr key={line}>
                  <th className="sticky left-0 bg-white border-b border-slate-100 px-2 py-1 text-left font-medium text-slate-700">
                    <div className="truncate">
                      {result.timelines.find((t) => t.name === line)?.urgent &&
                        "● "}
                      {line}
                    </div>
                    {isAuto && (
                      <div className="text-[10px] text-emerald-600 font-normal">
                        자동라인
                      </div>
                    )}
                  </th>
                  <td className="border-b border-slate-100 px-2 py-1 text-center text-[11px]">
                    {load > 0.01 ? (
                      <>
                        <div
                          className={cn(
                            "font-bold",
                            done >= load - 0.01
                              ? "text-emerald-700"
                              : "text-amber-700"
                          )}
                          title={tooltipState}
                        >
                          {done.toFixed(1)} / {load.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-slate-400">인시</div>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  {slots.map((s, idx) => {
                    if (s.type === "break") {
                      return (
                        <td
                          key={`brk-${idx}`}
                          className="border border-slate-300 bg-slate-200/40 w-10 min-w-[2.5rem]"
                          title={`${s.label} 휴게 ${formatHM(s.wallStart)}~${formatHM(s.wallEnd)}`}
                        />
                      );
                    }
                    const workers = cellWorkers[line]?.[s.wt] ?? [];
                    return (
                      <td
                        key={`w-${s.wt}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, line, s.wt)}
                        className={cn(
                          "border border-slate-200 p-0.5 align-top h-12",
                          s.isFirstOT && "border-l-4 border-l-rose-500",
                          s.isOT && "bg-rose-50/20"
                        )}
                        title={`${formatHM(s.wallStart)}~${formatHM(s.wallEnd)} ${s.isOT ? "(잔업)" : ""}`}
                      >
                        <div className="flex flex-wrap gap-0.5">
                          {workers.map((w) => (
                            <div
                              key={w}
                              draggable
                              onDragStart={(e) => handleDragStart(e, w)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded cursor-move whitespace-nowrap",
                                workers.length >= 2
                                  ? "bg-blue-500 text-white"
                                  : "bg-yellow-200 border border-yellow-400 text-slate-800",
                                dragging === w &&
                                  "ring-2 ring-orange-500 opacity-50"
                              )}
                              title={`${w} — 드래그해서 다른 라인·시간으로 이동`}
                            >
                              {w}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500 inline-block" />
          짝(2명)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-400 inline-block" />
          솔로(1명·60%)
        </span>
        <span>· 드래그해서 작업자를 다른 라인·시간 셀로 이동시킬 수 있습니다</span>
        <span>· 드롭 시 그 시각부터 같은 라인이 이어지는 한 자동 전파</span>
      </div>
    </div>
  );
}
