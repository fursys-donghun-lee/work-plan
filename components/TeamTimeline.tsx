"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  formatHM,
  workTimeToWall,
  STANDARD_WORKTIME,
  MAX_WORKTIME,
  type ReallocResult,
} from "@/lib/calc/reallocation";

interface Props {
  result: ReallocResult;
  title?: string;
}

// 30분 슬롯 단위로 팀(짝/솔로/자동) 가로 타임라인을 표시
// 행 = 팀1, 팀2, …, 솔로, 자동라인
// 열 = 30분 슬롯 (점심·저녁 휴게는 회색 컬럼으로 표시)
// 셀 = 그 시간에 팀이 일하는 라인 이름 (1명이면 옅은 배경으로 구분)
export function TeamTimeline({ result, title }: Props) {
  const STEP = 0.5;

  // 1) 30분 슬롯 목록 (work-time 0 ~ 11, 22 슬롯)
  const slots = useMemo(() => {
    const arr: { wt: number; wall: number; isOT: boolean; isLastReg: boolean }[] = [];
    for (let t = 0; t < MAX_WORKTIME - 1e-9; t += STEP) {
      arr.push({
        wt: t,
        wall: workTimeToWall(t),
        isOT: t >= STANDARD_WORKTIME - 1e-9,
        isLastReg: Math.abs(t + STEP - STANDARD_WORKTIME) < 1e-9,
      });
    }
    return arr;
  }, []);

  // 2) 각 슬롯에서 활성 라인 + 헤드카운트 (자동 vs 비자동 분리)
  type SlotEntry = { name: string; hc: number; autoManaged: boolean };
  const perSlot: SlotEntry[][] = useMemo(() => {
    return slots.map((slot) => {
      const entries: SlotEntry[] = [];
      for (const t of result.timelines) {
        const seg = t.segments.find(
          (s) => s.start <= slot.wt + 1e-9 && s.end > slot.wt + 1e-9
        );
        if (seg && seg.base + seg.added > 0) {
          entries.push({
            name: t.name,
            hc: seg.base + seg.added,
            autoManaged: t.autoManaged,
          });
        }
      }
      return entries;
    });
  }, [result.timelines, slots]);

  // 3) 팀 lane 할당 — 비자동 라인은 lane 유지(이전 슬롯에 같은 라인이 있던 lane 우선),
  //    새 라인은 비어 있는 lane 중 가장 낮은 번호 사용. 자동라인은 별도 lane.
  const { lanes, autoLanes } = useMemo(() => {
    type Lane = { id: number; cells: (SlotEntry | null)[] };
    const lanes: Lane[] = [];
    const autoLanes: Lane[] = [];

    // 자동라인은 슬롯 별로 별도 lane 묶음 (한 라인당 한 lane, 첫 등장 시 생성)
    const autoMap = new Map<string, number>(); // 라인명 → lane index
    // 비자동 lane 상태: 슬롯 t-1에 lane[k]에 있던 라인 이름
    let prevLaneLines: (string | null)[] = [];

    slots.forEach((_slot, si) => {
      const entries = perSlot[si];
      const autoEntries = entries.filter((e) => e.autoManaged);
      const nonAuto = entries.filter((e) => !e.autoManaged);

      // 자동라인 처리
      for (const a of autoEntries) {
        let idx = autoMap.get(a.name);
        if (idx === undefined) {
          idx = autoLanes.length;
          autoLanes.push({
            id: idx,
            cells: Array(slots.length).fill(null) as (SlotEntry | null)[],
          });
          autoMap.set(a.name, idx);
        }
        autoLanes[idx].cells[si] = a;
      }

      // 비자동 라인 → 안정적 lane 할당
      const assigned = new Map<string, number>(); // 이번 슬롯 라인명 → lane idx
      const used = new Set<number>();
      // 1순위: 이전 슬롯에 있던 라인은 그 lane 그대로
      for (const e of nonAuto) {
        const prevIdx = prevLaneLines.indexOf(e.name);
        if (prevIdx >= 0 && !used.has(prevIdx)) {
          assigned.set(e.name, prevIdx);
          used.add(prevIdx);
        }
      }
      // 2순위: 미할당 라인은 비어 있는 가장 낮은 lane 또는 새 lane
      for (const e of nonAuto) {
        if (assigned.has(e.name)) continue;
        let idx = -1;
        for (let k = 0; k < lanes.length; k++) {
          if (!used.has(k)) {
            idx = k;
            break;
          }
        }
        if (idx < 0) {
          idx = lanes.length;
          lanes.push({
            id: idx,
            cells: Array(slots.length).fill(null) as (SlotEntry | null)[],
          });
        }
        assigned.set(e.name, idx);
        used.add(idx);
      }
      // 셀 채우기
      for (const e of nonAuto) {
        const idx = assigned.get(e.name)!;
        lanes[idx].cells[si] = e;
      }
      // 다음 슬롯용 prevLaneLines 업데이트
      prevLaneLines = lanes.map((ln) => {
        const cell = ln.cells[si];
        return cell ? cell.name : null;
      });
    });

    return { lanes, autoLanes };
  }, [perSlot, slots]);

  // 4) 휴게/잔업 경계 메타 (헤더에 표시)
  const lunchSlotIdx = slots.findIndex(
    (s) => Math.abs(s.wt - 4) < 1e-9
  ); // 점심: work-time 4 = 12:30
  const otStartIdx = slots.findIndex(
    (s) => Math.abs(s.wt - STANDARD_WORKTIME) < 1e-9
  ); // 잔업 시작 슬롯
  void lunchSlotIdx;

  const noTeams = lanes.length === 0 && autoLanes.length === 0;

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-900 mb-3">
        {title ?? "팀 타임라인"}
        <span className="ml-2 text-xs font-normal text-slate-500">
          (30분 단위 · 팀별 라인 배치)
        </span>
      </h2>

      {noTeams ? (
        <p className="text-sm text-slate-500">표시할 팀이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white border-b border-slate-200 px-2 py-1 text-left font-semibold text-slate-600 w-20 min-w-[5rem]">
                  팀
                </th>
                {slots.map((s, i) => {
                  const isLunchBreak = s.wt >= 4 - 1e-9 && s.wt < 4 + 1e-9; // 12:30 슬롯 자체는 표시
                  void isLunchBreak;
                  // 정시 시각만 시간 라벨, 그 사이는 빈칸
                  const labelHour = Math.abs(s.wall - Math.floor(s.wall)) < 1e-9;
                  return (
                    <th
                      key={i}
                      className={cn(
                        "border-b border-slate-200 px-1 py-1 text-center text-[10px] text-slate-500 font-normal min-w-[2.6rem]",
                        i === otStartIdx && "border-l-2 border-l-rose-300",
                        s.isOT && "bg-rose-50/40"
                      )}
                    >
                      {labelHour ? formatHM(s.wall) : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lanes.map((ln, lnIdx) => (
                <tr key={`team-${ln.id}`}>
                  <th className="sticky left-0 z-10 bg-white border-b border-slate-100 px-2 py-1 text-left font-medium text-slate-700">
                    팀 {lnIdx + 1}
                  </th>
                  {ln.cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        "border-b border-slate-100 px-0.5 py-1 text-center text-[10px]",
                        ci === otStartIdx && "border-l-2 border-l-rose-300",
                        slots[ci].isOT && !cell && "bg-rose-50/30",
                        cell &&
                          (cell.hc >= 2
                            ? "bg-blue-50 text-blue-900 font-semibold"
                            : "bg-amber-50 text-amber-900")
                      )}
                      title={
                        cell
                          ? `${formatHM(slots[ci].wall)} · ${cell.name} · ${cell.hc}명`
                          : undefined
                      }
                    >
                      {cell ? cell.name.replace(/^MM-/, "") : ""}
                    </td>
                  ))}
                </tr>
              ))}
              {autoLanes.map((ln, lnIdx) => (
                <tr key={`auto-${ln.id}`}>
                  <th className="sticky left-0 z-10 bg-white border-b border-slate-100 px-2 py-1 text-left font-medium text-emerald-700">
                    자동
                  </th>
                  {ln.cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        "border-b border-slate-100 px-0.5 py-1 text-center text-[10px]",
                        ci === otStartIdx && "border-l-2 border-l-rose-300",
                        cell
                          ? "bg-emerald-50 text-emerald-900"
                          : slots[ci].isOT
                            ? "bg-rose-50/30"
                            : ""
                      )}
                      title={
                        cell
                          ? `${formatHM(slots[ci].wall)} · ${cell.name}`
                          : undefined
                      }
                    >
                      {cell ? "PA" : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200 inline-block" />
          짝(2명)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block" />
          솔로(1명·60%)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200 inline-block" />
          자동라인
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-rose-50/60 inline-block" />
          잔업창(18:00~21:00)
        </span>
        <span>· 셀 = 그 시간 팀이 일하는 라인 (호버로 시간·인원)</span>
      </div>
    </div>
  );
}
