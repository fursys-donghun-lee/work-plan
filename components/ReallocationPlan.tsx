"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  computeReallocation,
  formatHM,
  splitWorkSegment,
  workTimeToWall,
  STANDARD_WORKTIME,
  isOperating,
  type ReallocGroupInput,
  type ReallocExtraFree,
} from "@/lib/calc/reallocation";
import { ArrowRight, ChevronDown, ChevronUp, Clock } from "lucide-react";

interface Props {
  groups: ReallocGroupInput[]; // 직접그룹 (피더 제외)
  extraFree?: ReallocExtraFree[];
  disableRealloc?: boolean; // true 면 기본 배치(이동 없음)
  title?: string; // 헤더 제목 (기본: 시간대별 재배치 계획)
  defaultOpen?: boolean;
}

export function ReallocationPlan({
  groups,
  extraFree = [],
  disableRealloc = false,
  title,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  // 시뮬레이션은 work-time(0부터, 휴게 제외 누적 작업시간) 기준
  const result = useMemo(
    () => computeReallocation(groups, 0, 8, extraFree, disableRealloc),
    [groups, extraFree, disableRealloc]
  );

  const loadedGroups = groups.filter((g) => g.loadHours > 0.01);
  if (loadedGroups.length === 0) return null;

  // 간트 축: 하루 전체 고정 (08:30 ~ 21:00) — 블록 그리드 일관성
  const AXIS_START = 8.5;
  const AXIS_END = 21.0;
  const span = AXIS_END - AXIS_START; // 12.5h
  const pct = (wall: number) => ((wall - AXIS_START) / span) * 100;

  // 시간 블록 경계 + 휴게 구간
  const BLOCK_TICKS = [8.5, 10.5, 12.5, 13.5, 15.5, 17.5, 18.0, 21.0];
  const BREAK_BANDS = [
    { start: 12.5, end: 13.5 }, // 점심
    { start: 17.5, end: 18.0 }, // 저녁
  ];

  // 트랙 배경 (휴게 음영 + 블록 경계선)
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          {title ?? "시간대별 재배치 계획"}
          <span className="text-xs font-normal text-slate-500">
            {disableRealloc
              ? "(08:30 시작 · 점심/저녁 휴게 반영 · 이동 없음)"
              : "(08:30 시작 · 점심/저녁 휴게 반영 · 잔업 최소화)"}
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
          {/* 요약 지표 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              {
                label: "직접 출근인원",
                value: `${result.totalPeople}명`,
                tone: "slate" as const,
              },
              {
                label: "총부하",
                value: `${result.totalLoad.toFixed(1)}인시`,
                tone: "slate" as const,
              },
              {
                label: "가용부하",
                value: `${result.availableLoad.toFixed(1)}인시`,
                tone: "blue" as const,
              },
              {
                label: "유휴 시간",
                value: `${result.idleHours.toFixed(1)}인시`,
                tone: result.idleHours > 0.01 ? ("rose" as const) : ("slate" as const),
              },
              {
                label: "이월시간",
                value: `${result.totalCarry.toFixed(1)}인시`,
                tone: result.totalCarry > 0.01 ? ("amber" as const) : ("slate" as const),
              },
              {
                label: "잔업인원",
                value: `${result.overtimePeople}명`,
                tone: result.overtimePeople > 0 ? ("rose" as const) : ("slate" as const),
              },
              {
                label: "잔업시간",
                value: `${result.overtimePersonHours.toFixed(1)}인시`,
                tone:
                  result.overtimePersonHours > 0.01 ? ("rose" as const) : ("slate" as const),
              },
            ].map((s) => (
              <div
                key={s.label}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  s.tone === "rose"
                    ? "border-rose-200 bg-rose-50"
                    : s.tone === "amber"
                      ? "border-amber-200 bg-amber-50"
                      : s.tone === "blue"
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 bg-slate-50"
                )}
              >
                <div className="text-[11px] text-slate-500 whitespace-nowrap">
                  {s.label}
                </div>
                <div
                  className={cn(
                    "text-base font-bold whitespace-nowrap",
                    s.tone === "rose"
                      ? "text-rose-700"
                      : s.tone === "amber"
                        ? "text-amber-700"
                        : s.tone === "blue"
                          ? "text-blue-700"
                          : "text-slate-800"
                  )}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* 간트 차트 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              그룹별 타임라인
            </h3>

            {/* 시간축 헤더 */}
            <div className="flex items-center gap-2 mb-1">
              <div className="w-28 flex-shrink-0" />
              <div className="flex-1 relative h-4">
                {BLOCK_TICKS.map((t, i) => (
                  <span
                    key={i}
                    className="absolute text-[9px] text-slate-400 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${pct(t)}%` }}
                  >
                    {formatHM(t)}
                  </span>
                ))}
              </div>
              <div className="w-14 flex-shrink-0" />
            </div>

            <div className="space-y-1.5">
              {result.timelines
                .filter((t) => t.loadHours > 0.01)
                .map((t) => (
                  <div key={t.name} className="flex items-center gap-2">
                    <div className="w-28 flex-shrink-0 text-xs font-medium text-slate-700 truncate flex items-center gap-1">
                      {t.urgent && (
                        <span className="text-rose-600" title="긴급건 라인">
                          ●
                        </span>
                      )}
                      {t.name}
                    </div>
                    <div className="flex-1 relative h-6 bg-slate-50 rounded overflow-hidden">
                      {/* 휴게 음영 + 블록 경계선 (배경) */}
                      {trackBackground}
                      {/* 유휴(비가동) 구간 — 정규시간 내 '가동' 막대가 없는 시간을 연한 빨강으로
                          (작업 전 대기 · 종료 후 · 1명 비가동 모두 포함) */}
                      {(() => {
                        const REG = STANDARD_WORKTIME; // 정규 8h
                        // 정규시간 내 '가동' 구간만 모아 그 보색(=유휴 갭) 계산
                        const ops = t.segments
                          .filter((s) =>
                            isOperating(s.base + s.added, t.autoManaged)
                          )
                          .map((s) => ({
                            start: Math.max(0, s.start),
                            end: Math.min(REG, s.end),
                          }))
                          .filter((s) => s.end > s.start + 1e-9)
                          .sort((a, b) => a.start - b.start);
                        const gaps: { start: number; end: number }[] = [];
                        let cur = 0;
                        for (const o of ops) {
                          if (o.start > cur + 1e-9)
                            gaps.push({ start: cur, end: o.start });
                          cur = Math.max(cur, o.end);
                        }
                        if (cur < REG - 1e-9) gaps.push({ start: cur, end: REG });
                        return gaps.flatMap((gp, gi) =>
                          splitWorkSegment(gp.start, gp.end).map((w, wi) => (
                            <div
                              key={`idle-${gi}-${wi}`}
                              className="absolute top-0 bottom-0 bg-rose-400/55"
                              style={{
                                left: `${pct(w.start)}%`,
                                width: `${Math.max(pct(w.end) - pct(w.start), 0)}%`,
                              }}
                              title={`유휴 ${formatHM(w.start)}~${formatHM(w.end)} (비가동)`}
                            />
                          ))
                        );
                      })()}
                      {/* 작업 막대 — 가동(이동 포함=노랑/기존=파랑), 1명 비가동=빨강 */}
                      {t.segments.flatMap((seg, si) => {
                        const total = seg.base + seg.added;
                        if (total === 0) return null;
                        const operating = isOperating(total, t.autoManaged);
                        return splitWorkSegment(seg.start, seg.end).map((w, wi) => (
                          <div
                            key={`${si}-${wi}`}
                            className={cn(
                              "absolute top-0 bottom-0 rounded flex items-center justify-center text-[10px] font-semibold",
                              !operating
                                ? "bg-rose-400/55 text-rose-950"
                                : seg.added > 0
                                  ? "bg-yellow-100 text-slate-800 border border-yellow-300"
                                  : "bg-blue-500 text-white"
                            )}
                            style={{
                              left: `${pct(w.start)}%`,
                              width: `${Math.max(pct(w.end) - pct(w.start), 1.5)}%`,
                            }}
                            title={
                              operating
                                ? `${formatHM(w.start)}~${formatHM(w.end)} · 기존 ${seg.base} / 이동 ${seg.added}`
                                : `${formatHM(w.start)}~${formatHM(w.end)} · ${total}명 (비가동·유휴)`
                            }
                          >
                            {total}
                          </div>
                        ));
                      })}
                    </div>
                    <div className="w-14 flex-shrink-0 text-[11px] text-right">
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
                가동(기존 인원)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300 inline-block" />
                가동(이동 인원 포함)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-rose-400/55 inline-block" />
                유휴(비가동·1명·작업없음)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-slate-200 inline-block" />
                휴게
              </span>
              <span>· 막대 안 숫자 = 투입 인원 · 마우스 올리면 상세 · 우측 = 완료시각</span>
            </div>
          </div>

          {/* 이동 지시 목록 (기본 배치 모드에선 숨김) */}
          {!disableRealloc && (
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
          )}
        </div>
      )}
    </div>
  );
}
