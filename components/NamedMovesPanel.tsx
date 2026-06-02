"use client";

import { useMemo } from "react";
import {
  formatHM,
  workTimeToWall,
  type ReallocResult,
} from "@/lib/calc/reallocation";
import { ArrowRight, User } from "lucide-react";

interface Props {
  result: ReallocResult;
  lineWorkers: Record<string, string[]>; // 초기 라인별 작업자 이름
  overrides: Record<string, string>;
  setOverrides: (next: Record<string, string>) => void;
}

// 이름 지정 이동 명단 — 시뮬레이션 이동(인원수 단위)을 시간순으로 풀어
// "누가" 이동할지 작업자명으로 표시 + 사용자가 드롭다운으로 선택 변경 가능
export function NamedMovesPanel({ result, lineWorkers, overrides, setOverrides }: Props) {

  // 이동 순서대로 walk하면서 현재 라인 작업자 상태 갱신 + 각 슬롯의 출발 라인 후보 결정
  const assignments = useMemo(() => {
    const current: Record<string, string[]> = {};
    for (const k of Object.keys(lineWorkers)) current[k] = [...lineWorkers[k]];

    type Assignment = {
      moveIdx: number;
      slotIdx: number;
      time: number;
      from: string;
      to: string;
      assigned: string; // 실제 이동하는 작업자명
      available: string[]; // 그 시점 출발 라인 작업자 후보
    };

    const sorted = [...result.moves].sort(
      (a, b) => a.time - b.time || a.from.localeCompare(b.from)
    );
    const list: Assignment[] = [];
    for (let mi = 0; mi < sorted.length; mi++) {
      const m = sorted[mi];
      for (let si = 0; si < m.count; si++) {
        const fromList = current[m.from] ?? [];
        const key = `${mi}-${si}`;
        // override 가 fromList 에 있으면 그 사람을, 아니면 첫 번째 자동 선택
        const ov = overrides[key];
        const assigned =
          ov && fromList.includes(ov) ? ov : fromList[0] ?? "(인원 없음)";
        // 후보: 그 시점의 from 라인 사람들 + 이미 자동 선택된 경우도 포함
        const available = [...fromList];
        list.push({
          moveIdx: mi,
          slotIdx: si,
          time: m.time,
          from: m.from,
          to: m.to,
          assigned,
          available,
        });
        // 실제 이동: from 에서 제거, to 에 추가
        if (assigned && fromList.includes(assigned)) {
          current[m.from] = fromList.filter((w) => w !== assigned);
          current[m.to] = [...(current[m.to] ?? []), assigned];
        }
      }
    }
    return { list, finalState: current };
  }, [result.moves, lineWorkers, overrides]);

  // 시간별로 그룹화해서 보기 편하게
  const grouped = useMemo(() => {
    const byTime = new Map<number, typeof assignments.list>();
    for (const a of assignments.list) {
      const arr = byTime.get(a.time) ?? [];
      arr.push(a);
      byTime.set(a.time, arr);
    }
    return Array.from(byTime.entries()).sort((a, b) => a[0] - b[0]);
  }, [assignments.list]);

  if (result.moves.length === 0) {
    return (
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <User className="w-4 h-4 text-blue-600" />
          작업자 이동 명단 (이름 지정)
        </h2>
        <p className="text-sm text-slate-500">이동 없이 초기 배치로 완료됩니다.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <User className="w-4 h-4 text-blue-600" />
        작업자 이동 명단 (이름 지정)
        <span className="text-xs font-normal text-slate-500">
          드롭다운으로 누가 이동할지 변경 가능
        </span>
      </h2>

      <div className="space-y-3">
        {grouped.map(([time, items]) => (
          <div key={time} className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-slate-700">
                {formatHM(workTimeToWall(time))}
              </span>
              <span className="text-xs text-slate-500">
                · 총 {items.length}명 이동
              </span>
            </div>
            <div className="space-y-1.5">
              {items.map((a) => {
                const key = `${a.moveIdx}-${a.slotIdx}`;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 text-sm bg-slate-50 rounded-md px-3 py-2 flex-wrap"
                  >
                    <span className="font-medium text-slate-700">{a.from}</span>
                    <span className="text-xs text-slate-500">에서</span>
                    {a.available.length > 0 ? (
                      <select
                        value={a.assigned}
                        onChange={(e) =>
                          setOverrides({
                            ...overrides,
                            [key]: e.target.value,
                          })
                        }
                        className="text-sm font-bold text-blue-700 bg-white border border-slate-300 rounded px-2 py-0.5"
                      >
                        {a.available.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-rose-600 font-medium">
                        {a.assigned}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">을(를)</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="badge badge-blue">{a.to}</span>
                    <span className="text-xs text-slate-500">으로 이동</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 최종 라인별 작업자 상태 */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">
          최종 라인별 작업자 상태 (모든 이동 반영 후)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Object.entries(assignments.finalState).map(([line, workers]) => (
            <div
              key={line}
              className="text-xs border border-slate-200 rounded px-2 py-1.5"
            >
              <div className="font-semibold text-slate-700">{line}</div>
              <div className="text-slate-500 mt-0.5">
                {workers.length > 0 ? workers.join(", ") : "(이동 후 없음)"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
