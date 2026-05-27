"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  computeReallocation,
  formatHM,
  splitWorkSegment,
  workTimeToWall,
  STANDARD_WORKTIME,
  STANDARD_END_WALL,
  type ReallocGroupInput,
} from "@/lib/calc/reallocation";
import { ArrowRight, ChevronDown, ChevronUp, Clock } from "lucide-react";

interface Props {
  groups: ReallocGroupInput[]; // 직접그룹 (피더 제외)
}

export function ReallocationPlan({ groups }: Props) {
  const [open, setOpen] = useState(false);

  // 시뮬레이션은 work-time(0부터, 휴게 제외 누적 작업시간) 기준
  const result = useMemo(() => computeReallocation(groups, 0, 8), [groups]);

  const loadedGroups = groups.filter((g) => g.loadHours > 0.01);
  if (loadedGroups.length === 0) return null;

  // 벽시계 변환
  const startWall = workTimeToWall(0); // 08:30
  const endWall = workTimeToWall(result.actualEnd);
  const spanWall = Math.max(endWall - startWall, 0.5);
  const pct = (wall: number) => ((wall - startWall) / spanWall) * 100;

  const overtimeWorkHours = Math.max(0, result.actualEnd - STANDARD_WORKTIME);
  const hasOvertime = overtimeWorkHours > 1e-6;
  const cannotFinish = result.actualEnd > 11 + 1e-6; // 21:00 초과

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          시간대별 재배치 계획
          <span className="text-xs font-normal text-slate-500">
            (08:30 시작 · 점심/저녁 휴게 반영 · 잔업 최소화)
          </span>
        </h2>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {/* 요약 */}
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700">
              시작 <b>{formatHM(startWall)}</b>
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700">
              예상 완료 <b>{formatHM(endWall)}</b>
            </span>
            <span
              className={cn(
                "px-2.5 py-1 rounded",
                cannotFinish
                  ? "bg-rose-100 text-rose-800"
                  : hasOvertime
                    ? "bg-rose-50 text-rose-700"
                    : "bg-emerald-50 text-emerald-700"
              )}
            >
              {cannotFinish
                ? "21:00 내 완료 불가 (인력 부족)"
                : hasOvertime
                  ? `잔업 필요 (작업 +${overtimeWorkHours.toFixed(1)}h)`
                  : "정규시간 내 완료"}
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700">
              총부하 {result.totalLoad.toFixed(1)}인시 / {result.totalPeople}명
            </span>
            {result.totalCarry > 0.01 && (
              <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-700">
                다음날 이월 {result.totalCarry.toFixed(1)}인시
              </span>
            )}
          </div>

          {/* 간트 차트 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              그룹별 타임라인
            </h3>
            <div className="space-y-1.5">
              {result.timelines
                .filter((t) => t.loadHours > 0.01)
                .map((t) => (
                  <div key={t.name} className="flex items-center gap-2">
                    <div className="w-28 text-xs font-medium text-slate-700 truncate flex items-center gap-1">
                      {t.urgent && (
                        <span className="text-rose-600" title="긴급건 라인">
                          ●
                        </span>
                      )}
                      {t.name}
                    </div>
                    <div className="flex-1 relative h-6 bg-slate-100 rounded">
                      {/* 표준 종료(17:30) 경계선 */}
                      {STANDARD_END_WALL < endWall && (
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-rose-400 border-dashed z-10"
                          style={{ left: `${pct(STANDARD_END_WALL)}%` }}
                          title="표준 종료 17:30"
                        />
                      )}
                      {t.segments.flatMap((seg, si) =>
                        splitWorkSegment(seg.start, seg.end).map((w, wi) => {
                          const isOvertime = seg.end > STANDARD_WORKTIME + 1e-6;
                          return (
                            <div
                              key={`${si}-${wi}`}
                              className={cn(
                                "absolute top-0 bottom-0 rounded flex items-center justify-center text-[10px] font-semibold text-white",
                                isOvertime ? "bg-rose-500" : "bg-blue-500"
                              )}
                              style={{
                                left: `${pct(w.start)}%`,
                                width: `${Math.max(pct(w.end) - pct(w.start), 1.5)}%`,
                              }}
                              title={`${formatHM(w.start)}~${formatHM(w.end)} ${seg.headcount}명`}
                            >
                              {seg.headcount}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="w-14 text-[11px] text-right">
                      {t.finishTime !== null ? (
                        <span className="text-slate-500">
                          {formatHM(workTimeToWall(t.finishTime))}
                        </span>
                      ) : (
                        <span
                          className="text-amber-700 font-medium"
                          title={`${t.carryHours.toFixed(1)}인시 이월`}
                        >
                          이월
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-500 inline-block" />
                정규
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
                잔업(18:00~)
              </span>
              <span>· 막대 안 숫자 = 투입 인원 · 빈칸 = 휴게/완료 · 우측 = 완료시각</span>
            </div>
          </div>

          {/* 이동 지시 목록 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              인력 이동 지시
            </h3>
            {result.moves.length === 0 ? (
              <p className="text-sm text-slate-500">
                이동 없이 초기 배치로 완료됩니다.
              </p>
            ) : (
              <div className="space-y-1.5">
                {result.moves.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm bg-slate-50 rounded-md px-3 py-2"
                  >
                    <span className="font-mono text-xs text-slate-500 w-12">
                      {formatHM(workTimeToWall(m.time))}
                    </span>
                    <span className="font-medium text-slate-700">{m.from}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="badge badge-blue">{m.to}</span>
                    <span className="font-semibold text-blue-700">
                      {m.count}명
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
