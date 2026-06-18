"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  STANDARD_WORKTIME,
  MAX_WORKTIME,
  type ReallocResult,
} from "@/lib/calc/reallocation";

interface Props {
  result: ReallocResult;
  title?: string;
}

// 재배치 결과 핵심 지표 6개 패널 (가용부하·작업시간은 가동률에 함의되어 생략)
export function RealMetricsPanel({ result, title }: Props) {
  const utilization =
    result.availableLoad > 0
      ? (result.workHours / result.availableLoad) * 100
      : 0;

  const otStartWt = STANDARD_WORKTIME;
  const otEndWt = MAX_WORKTIME;
  const activeLineCount = result.timelines.filter(
    (t) => t.loadHours > 0.01
  ).length;
  const otLineCount = useMemo(() => {
    return result.timelines.filter((t) => {
      let maxOtHc = 0;
      let otEndLine = otStartWt;
      for (const seg of t.segments) {
        const h = seg.base + seg.added;
        const hi = Math.min(seg.end, otEndWt);
        const lo = Math.max(seg.start, otStartWt);
        if (hi > lo && h > 0) {
          maxOtHc = Math.max(maxOtHc, h);
          otEndLine = Math.max(otEndLine, hi);
        }
      }
      return maxOtHc > 0 && otEndLine - otStartWt >= 2 - 1e-6;
    }).length;
  }, [result.timelines, otStartWt, otEndWt]);

  type Tone = "slate" | "rose" | "amber" | "emerald";
  const metrics: { label: string; value: string; tone: Tone; hint?: string }[] = [
    {
      label: "직접 출근인원",
      value: `${result.totalPeople}명`,
      tone: "slate",
    },
    {
      label: "인력 가동률",
      value: `${utilization.toFixed(0)}%`,
      tone: "emerald",
    },
    {
      label: "유휴시간",
      value: `${result.idleHours.toFixed(1)}시간`,
      tone: result.idleHours > 0.01 ? "rose" : "slate",
      hint: `정규 유휴 ${result.regularIdleHours.toFixed(1)}시간 + 잔업 유휴 ${result.overtimeIdleHours.toFixed(1)}시간`,
    },
    {
      label: "잔업인원",
      value: `${result.overtimePeople}명`,
      tone: result.overtimePeople > 0 ? "rose" : "slate",
    },
    {
      label: "잔업 라인",
      value: `${otLineCount}라인`,
      tone: otLineCount > 0 ? "rose" : "slate",
      hint: `잔업 작업시간 2h 이상 라인 ${otLineCount}개 / 전체 가동 라인 ${activeLineCount}개`,
    },
    {
      label: "이월시간",
      value: `${result.totalCarry.toFixed(1)}시간`,
      tone: result.totalCarry > 0.01 ? "amber" : "slate",
    },
  ];

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-900 mb-3">
        {title ?? "재배치 결과 지표"}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            title={m.hint}
            className={cn(
              "rounded-lg border px-3 py-2",
              m.tone === "rose"
                ? "border-rose-200 bg-rose-50"
                : m.tone === "amber"
                  ? "border-amber-200 bg-amber-50"
                  : m.tone === "emerald"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
            )}
          >
            <div className="text-[11px] text-slate-500 whitespace-nowrap">
              {m.label}
            </div>
            <div
              className={cn(
                "text-base font-bold whitespace-nowrap",
                m.tone === "rose"
                  ? "text-rose-700"
                  : m.tone === "amber"
                    ? "text-amber-700"
                    : m.tone === "emerald"
                      ? "text-emerald-700"
                      : "text-slate-800"
              )}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
