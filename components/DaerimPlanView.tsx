"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { ReallocationPlan } from "@/components/ReallocationPlan";
import { NamedReallocationPlan } from "@/components/NamedReallocationPlan";
import { WorkerRosterByTime } from "@/components/WorkerRosterByTime";
import { RealMetricsPanel } from "@/components/RealMetricsPanel";
import { ImprovementSummary } from "@/components/ImprovementSummary";
import { DragPlanView } from "@/components/DragPlanView";
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

// 재배치 계획 비교 탭: 기본 배치(이동 없음) vs 재배치 로직 두 간트를 위·아래로 표시
export function DaerimPlanView() {
  const hydrated = useHydrated();
  const workDate = useDataStore((s) => s.workDate);
  const { groups, extraFree, missing, lineWorkers } = useDaerimRealloc();
  // 이동 override (간트 라벨 클릭으로 누가 갈지 지정)
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // 임시 셀(보조 작업셀) 상태
  const [tempCells, setTempCells] = useState<TempCell[]>([]);
  // 탭 (재배치 계획 / 수동 배치)
  const [tab, setTab] = useState<"main" | "drag">("drag");

  // 기본 배치 vs 재배치 결과 → 개선 효과(델타) 계산
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

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("main")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "main"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          재배치 계획
        </button>
        <button
          type="button"
          onClick={() => setTab("drag")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "drag"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          수동 배치 (드래그앤드롭)
        </button>
      </div>

      {tab === "main" ? (
        <>
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
        </>
      ) : (
        <DragPlanView
          result={rReal}
          rBasic={rBasic}
          lineWorkers={lineWorkers}
          storageKey="drag-plan-confirmed-daerim-v1"
          companyKey="대림산업"
          feederGroups={[
            {
              count: 2, // 김성욱·유인섭
              triggerType: "load",
              lines: [
                "PA-01", "PA-02", "PA-03", "PA-04", "PA-05",
                "MM-01", "MM-02", "MM-03", "MM-04",
              ],
            },
            {
              count: 2, // 진영기·박동호
              triggerType: "ot",
              lines: [
                "PA-06", "PA-07", "PA-08",
                "MA-01", "MA-02", "MA-03", "MM-05",
              ],
            },
          ]}
        />
      )}
    </div>
  );
}

// (ImprovementSummary 는 ./ImprovementSummary 로 추출 — DragPlanView 와 공유)
