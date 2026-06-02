"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { ReallocationPlan } from "@/components/ReallocationPlan";
import { NamedReallocationPlan } from "@/components/NamedReallocationPlan";
import { WorkerRosterByTime } from "@/components/WorkerRosterByTime";
import { RealMetricsPanel } from "@/components/RealMetricsPanel";
import {
  TempCellEditor,
  type TempCell,
} from "@/components/TempCellEditor";
import { useDaerimRealloc } from "@/components/useDaerimRealloc";
import {
  computeReallocation,
  type ReallocResult,
} from "@/lib/calc/reallocation";
import { cn } from "@/lib/utils";

const utilOf = (r: { availableLoad: number; workHours: number }) =>
  r.availableLoad > 0 ? (r.workHours / r.availableLoad) * 100 : 0;

// 재배치 계획 비교 탭: 기본 배치(이동 없음) vs 재배치 로직 두 간트를 위·아래로 표시
export function DaerimPlanView() {
  const hydrated = useHydrated();
  const workDate = useDataStore((s) => s.workDate);
  const { groups, extraFree, missing, lineWorkers } = useDaerimRealloc();
  // 이동 override (간트 라벨 클릭으로 누가 갈지 지정)
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // 임시 셀(보조 작업셀) 상태
  const [tempCells, setTempCells] = useState<TempCell[]>([]);

  // 기본 배치 vs 재배치 결과 → 개선 효과(델타) 계산
  const rBasic = useMemo(
    () => computeReallocation(groups, 0, 8, extraFree, true),
    [groups, extraFree]
  );
  const rReal = useMemo(
    () => computeReallocation(groups, 0, 8, extraFree, false),
    [groups, extraFree]
  );

  if (!hydrated) return null;

  if (missing.length > 0) {
    return (
      <EmptyState
        title="자료가 부족합니다"
        description={`다음 자료를 먼저 업로드해주세요: ${missing.join(" / ")}`}
        ctaLabel="일일자료 업로드"
        ctaHref="/upload"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            대림산업 · 재배치 계획
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자{" "}
            <span className="font-semibold">{workDate || "(미지정)"}</span>
            <span className="ml-2 text-slate-400">
              기본 배치 vs 재배치 로직 비교
            </span>
          </p>
        </div>
        <Link
          href="/floor"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          현장 화면으로
        </Link>
      </div>

      {/* 재배치 개선 효과 (기본 배치 → 재배치) */}
      <ImprovementSummary rBasic={rBasic} rReal={rReal} />

      {/* 기본 배치 간트 (참고용) */}
      <ReallocationPlan
        groups={groups}
        extraFree={extraFree}
        disableRealloc
        title="기본 배치 (인원 이동 없음)"
        defaultOpen
      />

      {/* 재배치 결과 지표 */}
      <RealMetricsPanel result={rReal} title="재배치 결과 지표" />

      {/* 재배치 (이름 지정) — 메인 간트: 클릭으로 이동 지정 */}
      <NamedReallocationPlan
        result={rReal}
        lineWorkers={lineWorkers}
        overrides={overrides}
        setOverrides={setOverrides}
        tempCells={tempCells}
      />

      {/* 임시 셀 운영 — 이월 부담 라인의 보조 셀 구성 */}
      <TempCellEditor
        result={rReal}
        lineWorkers={lineWorkers}
        overrides={overrides}
        tempCells={tempCells}
        setTempCells={setTempCells}
      />

      {/* 시간대별 라인 작업자 정리 */}
      <WorkerRosterByTime
        result={rReal}
        lineWorkers={lineWorkers}
        overrides={overrides}
      />
    </div>
  );
}

// 기본 배치 → 재배치 결과의 핵심 지표 변화(개선 효과)
function ImprovementSummary({
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
      fmtVal: (v) => `${v.toFixed(1)}인시`,
      fmtDelta: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}인시`,
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
      fmtVal: (v) => `${v.toFixed(1)}인시`,
      fmtDelta: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}인시`,
      betterUp: false,
    },
    {
      label: "이월",
      base: rBasic.totalCarry,
      real: rReal.totalCarry,
      fmtVal: (v) => `${v.toFixed(1)}인시`,
      fmtDelta: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}인시`,
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
