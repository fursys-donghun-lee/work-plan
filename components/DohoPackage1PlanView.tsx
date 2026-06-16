"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { DragPlanView } from "@/components/DragPlanView";
import { useDohoPackage1Realloc } from "@/components/useDohoPackage1Realloc";
import { computeReallocation } from "@/lib/calc/reallocation";

// 다호산업 포장1라인 재배치 계획 — 수동 배치 (드래그앤드롭) 만 제공
export function DohoPackage1PlanView() {
  const hydrated = useHydrated();
  const workDate = useDataStore((s) => s.workDate);
  const setDohoPlanOvertime = useDataStore((s) => s.setDohoPlanOvertime);
  const { groups, extraFree, missing, lineWorkers } = useDohoPackage1Realloc();

  const rBasic = useMemo(
    () => computeReallocation(groups, 0, 8, extraFree, true, true),
    [groups, extraFree]
  );
  const rReal = useMemo(
    () => computeReallocation(groups, 0, 8, extraFree, false, true),
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
            다호산업 · 포장1라인 재배치 계획
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자{" "}
            <span className="font-semibold">{workDate || "(미지정)"}</span>
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          메인 대시보드로
        </Link>
      </div>

      <DragPlanView
        result={rReal}
        rBasic={rBasic}
        lineWorkers={lineWorkers}
        storageKey="drag-plan-confirmed-doho-v1"
        setOvertimeFn={setDohoPlanOvertime}
        // 다호 피더 트리거 규칙은 추후 사용자가 명시 — 일단 비활성
        feederGroups={[]}
      />
    </div>
  );
}
