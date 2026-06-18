"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { DragPlanView } from "@/components/DragPlanView";
import { useDohoPackage1Realloc } from "@/components/useDohoPackage1Realloc";
import { computeReallocation } from "@/lib/calc/reallocation";
import { buildPresentEmpCodes } from "@/lib/calc/groupLoad";
import { computePackage1Load } from "@/lib/calc/package1Load";

// 다호산업 포장1라인 재배치 계획 — 수동 배치 (드래그앤드롭) 만 제공
export function DohoPackage1PlanView() {
  const hydrated = useHydrated();
  const workDate = useDataStore((s) => s.workDate);
  const setDohoPlanOvertime = useDataStore((s) => s.setDohoPlanOvertime);
  const employees = useDataStore((s) => s.employees);
  const attendance = useDataStore((s) => s.attendance);
  const packagePosition = useDataStore((s) => s.packagePosition);
  const packageLoad = useDataStore((s) => s.packageLoad);
  const overrides = useDataStore((s) => s.packageWorkerOverrides);
  const lineBase = useDataStore((s) => s.lineBase);
  // 대림 포장2 잔업확정 — 다호 물류·자재 OT 규칙 입력
  const daerimP2OTConfirmed = useDataStore(
    (s) => s.manualPlanOvertimeConfirmed
  );
  const { groups, extraFree, missing, lineWorkers } = useDohoPackage1Realloc();

  // 피더 출근 인원 — package1 raw 결과에서 가져옴 (useDohoPackage1Realloc 은 직접만 노출)
  const package1 = useMemo(
    () =>
      computePackage1Load({
        packagePosition,
        packageLoad,
        attendance,
        overrides,
        employees,
        lineBase,
      }),
    [packagePosition, packageLoad, attendance, overrides, employees, lineBase]
  );

  const rBasic = useMemo(
    () => computeReallocation(groups, 0, 8, extraFree, true, true),
    [groups, extraFree]
  );
  const rReal = useMemo(
    () => computeReallocation(groups, 0, 8, extraFree, false, true),
    [groups, extraFree]
  );

  // 다호 카테고리별 출근/총인원 — 메인 대시보드 분류와 동일
  const dohoExtras = useMemo(() => {
    const presentCodes = buildPresentEmpCodes(attendance, employees);
    let totalPeople = 0;
    let totalAttendance = 0;
    let feederPresent = 0;
    let logisticsPresent = 0;
    let materialsPresent = 0;
    let directWorkers = 0; // 포장1라인 - 피더
    for (const e of employees) {
      if (!e.department.includes("다호산업")) continue;
      totalPeople += 1;
      if (!presentCodes.has(e.empCode)) continue;
      totalAttendance += 1;
    }
    // 피더 / 직접 / 물류 / 자재 출근자 — package1 raw 결과 + employees 카테고리 활용
    const feederGroup = package1.groups.find((g) => g.group === "피더");
    feederPresent = feederGroup?.presentMembers.length ?? 0;
    // 포장1라인 직접 = 포장1라인 카테고리 출근 - 피더 출근
    const p1Cat = employees.filter(
      (e) =>
        e.department.includes("다호산업") &&
        e.category === "포장1라인" &&
        presentCodes.has(e.empCode)
    ).length;
    directWorkers = Math.max(0, p1Cat - feederPresent);
    logisticsPresent = employees.filter(
      (e) =>
        e.department.includes("다호산업") &&
        e.category === "물류" &&
        presentCodes.has(e.empCode)
    ).length;
    materialsPresent = employees.filter(
      (e) =>
        e.department.includes("다호산업") &&
        e.category === "자재" &&
        presentCodes.has(e.empCode)
    ).length;
    return {
      totalPeople,
      totalAttendance,
      totalAbsent: Math.max(0, totalPeople - totalAttendance),
      directWorkers,
      feederPresent,
      logisticsPresent,
      materialsPresent,
    };
  }, [employees, attendance, package1]);

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
        companyKey="다호산업"
        setOvertimeFn={setDohoPlanOvertime}
        feederPresentCount={dohoExtras.feederPresent}
        feederGroups={[]}
        computeExtraConfirmData={(m) => {
          // 다호 잔업확정 규칙
          //  · 피더: 포장1 직접 확정 ≥ 1 → 출근 피더 전원
          //  · 물류/자재: (다호P1 확정 ≥ 1) + (대림P2 확정 ≥ 1) 라인 수 기반
          const directOT = m.overtimeDirect;
          const feederOT = directOT >= 1 ? dohoExtras.feederPresent : 0;
          const linesWithOT =
            (directOT >= 1 ? 1 : 0) + (daerimP2OTConfirmed >= 1 ? 1 : 0);
          const logisticsOT = Math.min(linesWithOT, dohoExtras.logisticsPresent);
          const materialsBase =
            linesWithOT === 0 ? 0 : linesWithOT === 1 ? 2 : 3;
          const materialsOT = Math.min(
            materialsBase,
            dohoExtras.materialsPresent
          );

          // 생산액 = 직접인원 × 4M + 직접 잔업인원 × 1.4M
          const expectedProduction =
            dohoExtras.directWorkers * 4_000_000 + directOT * 1_400_000;

          const totalPeople = dohoExtras.totalPeople;
          const totalAttendance = dohoExtras.totalAttendance;
          const totalAbsent = dohoExtras.totalAbsent;

          // 잔업확정 합계 = 직접 + 피더 + 물류 + 자재
          const overtimePeople = directOT + feederOT + logisticsOT + materialsOT;
          const standardHours = totalAttendance * 8;
          const overtimeHours = overtimePeople * 3;
          const weightedHours = standardHours + overtimeHours * 1.5;
          const expectedProductionPerHour =
            weightedHours > 0
              ? Math.round(expectedProduction / weightedHours)
              : 0;

          return {
            directWorkers: dohoExtras.directWorkers,
            feederOTConfirmed: feederOT,
            logisticsOTConfirmed: logisticsOT,
            materialsOTConfirmed: materialsOT,
            expectedProduction,
            expectedWorkHours: weightedHours,
            expectedProductionPerHour,
            totalPeople,
            totalAttendance,
            totalAbsent,
            overtimePeople,
            standardHours,
            overtimeHours,
            weightedHours,
            totalOT: overtimePeople,
          };
        }}
      />
    </div>
  );
}
