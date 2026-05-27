"use client";

import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { ReallocationPlan } from "@/components/ReallocationPlan";
import { useDaerimRealloc } from "@/components/useDaerimRealloc";

// 재배치 계획 비교 탭: 기본 배치(이동 없음) vs 재배치 로직 두 간트를 위·아래로 표시
export function DaerimPlanView() {
  const hydrated = useHydrated();
  const workDate = useDataStore((s) => s.workDate);
  const { groups, extraFree, missing } = useDaerimRealloc();

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

      {/* 1) 기본 배치 (이동 없음) */}
      <ReallocationPlan
        groups={groups}
        extraFree={extraFree}
        disableRealloc
        title="① 기본 배치 (인원 이동 없음)"
        defaultOpen
      />

      {/* 2) 재배치 로직 */}
      <ReallocationPlan
        groups={groups}
        extraFree={extraFree}
        title="② 재배치 로직 적용 (잔업 최소화)"
        defaultOpen
      />
    </div>
  );
}
