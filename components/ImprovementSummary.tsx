"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ReallocResult } from "@/lib/calc/reallocation";

const utilOf = (r: { availableLoad: number; workHours: number }) =>
  r.availableLoad > 0 ? (r.workHours / r.availableLoad) * 100 : 0;

// 기본 배치 → 재배치(또는 수동 배치) 핵심 지표 변화(개선 효과)
export function ImprovementSummary({
  rBasic,
  rReal,
}: {
  rBasic: ReallocResult;
  rReal: ReallocResult;
}) {
  const items: {
    label: string;
    base: number;
    real: number;
    fmtVal: (v: number) => string;
    fmtDelta: (d: number) => string;
    betterUp: boolean;
  }[] = [
    {
      label: "인력 가동률",
      base: utilOf(rBasic),
      real: utilOf(rReal),
      fmtVal: (v) => `${v.toFixed(0)}%`,
      fmtDelta: (d) => `${d > 0 ? "+" : ""}${d.toFixed(0)}%p`,
      betterUp: true,
    },
    {
      label: "유휴 시간",
      base: rBasic.idleHours,
      real: rReal.idleHours,
      fmtVal: (v) => `${v.toFixed(1)}시간`,
      fmtDelta: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}시간`,
      betterUp: false,
    },
    {
      label: "잔업 인원",
      base: rBasic.overtimePeople,
      real: rReal.overtimePeople,
      fmtVal: (v) => `${v}명`,
      fmtDelta: (d) => `${d > 0 ? "+" : ""}${d}명`,
      betterUp: false,
    },
    {
      label: "잔업 시간",
      base: rBasic.overtimePersonHours,
      real: rReal.overtimePersonHours,
      fmtVal: (v) => `${v.toFixed(1)}시간`,
      fmtDelta: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}시간`,
      betterUp: false,
    },
    {
      label: "이월",
      base: rBasic.totalCarry,
      real: rReal.totalCarry,
      fmtVal: (v) => `${v.toFixed(1)}시간`,
      fmtDelta: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}시간`,
      betterUp: false,
    },
  ];

  return (
    <div className="card border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white">
      <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-emerald-600" />
        재배치 개선 효과
        <span className="text-xs font-normal text-slate-500">
          기본 배치 → 재배치 로직
        </span>
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((it) => {
          const delta = it.real - it.base;
          const flat = Math.abs(delta) < 1e-6;
          const improved = !flat && (it.betterUp ? delta > 0 : delta < 0);
          const Icon = flat ? Minus : improved ? TrendingUp : TrendingDown;
          const tone = flat
            ? "text-slate-400"
            : improved
              ? "text-emerald-700"
              : "text-rose-700";
          return (
            <div
              key={it.label}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="text-[11px] text-slate-500">{it.label}</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-sm text-slate-400">
                  {it.fmtVal(it.base)}
                </span>
                <span className="text-slate-300">→</span>
                <span className="text-base font-bold text-slate-800">
                  {it.fmtVal(it.real)}
                </span>
              </div>
              <div
                className={cn(
                  "flex items-center gap-0.5 text-xs font-semibold mt-0.5",
                  tone
                )}
              >
                <Icon className="w-3 h-3" />
                {flat ? "변화 없음" : it.fmtDelta(delta)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
