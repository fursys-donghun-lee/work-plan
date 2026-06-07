"use client";

import { useMemo } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { computePackage1Load } from "@/lib/calc/package1Load";
import { computeAll } from "@/lib/calc";
import { computeDohoPaintLoad } from "@/lib/calc/dohoPaintLoad";
import { computeUrgentByGroup, getUrgentFor } from "@/lib/calc/urgentLoad";
import type {
  ReallocGroupInput,
  ReallocExtraFree,
} from "@/lib/calc/reallocation";
import type { SupportAssignment } from "@/lib/types";

// 다호 포장1라인 재배치 입력 — useDaerimRealloc 의 package2 → package1 버전
export function useDohoPackage1Realloc(): {
  groups: ReallocGroupInput[];
  extraFree: ReallocExtraFree[];
  missing: string[];
  lineWorkers: Record<string, string[]>;
} {
  const packagePosition = useDataStore((s) => s.packagePosition);
  const packageLoad = useDataStore((s) => s.packageLoad);
  const attendance = useDataStore((s) => s.attendance);
  const overrides = useDataStore((s) => s.packageWorkerOverrides);
  const supportPlacements = useDataStore((s) => s.packageSupportPlacements);
  const workDate = useDataStore((s) => s.workDate);
  const employees = useDataStore((s) => s.employees);
  const equipment = useDataStore((s) => s.equipment);
  const loadPlan = useDataStore((s) => s.loadPlan);
  const loadBar = useDataStore((s) => s.loadBar);
  const paintPlan = useDataStore((s) => s.paintPlan);
  const supportAssignments = useDataStore((s) => s.supportAssignments);
  const supportRedirects = useDataStore((s) => s.supportRedirects);
  const workGroups = useDataStore((s) => s.workGroups);
  const lineBase = useDataStore((s) => s.lineBase);
  const urgentProduction = useDataStore((s) => s.urgentProduction);

  const woosungAll = useMemo(
    () =>
      computeAll({
        employees,
        equipment,
        loadPlan,
        attendance,
        workGroups,
        supportAssignments,
      }),
    [employees, equipment, loadPlan, attendance, workGroups, supportAssignments]
  );

  const dohoLoad = useMemo(
    () =>
      computeDohoPaintLoad({
        paintPlan,
        loadPlan,
        loadBar,
        employees,
        attendance,
        supportAssignments,
        supportRedirects,
      }),
    [
      paintPlan,
      loadPlan,
      loadBar,
      employees,
      attendance,
      supportAssignments,
      supportRedirects,
    ]
  );

  const supportableMap = new Map<string, number>();
  woosungAll.groupLoad.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );
  dohoLoad.groups.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );

  const confirmedFor = (a: SupportAssignment): number => {
    if (!a.targetLine || a.selectedCount <= 0) return 0;
    const sup = supportableMap.get(a.group) ?? 0;
    return Math.max(0, Math.min(sup, a.selectedCount));
  };
  let totalSupportCount = 0;
  for (const a of supportAssignments) {
    if (a.targetLine !== "포장1라인") continue;
    totalSupportCount += confirmedFor(a);
  }

  const result = useMemo(
    () =>
      computePackage1Load({
        packagePosition,
        packageLoad,
        attendance,
        overrides,
        supportPlacements,
        totalSupportCount,
        employees,
        lineBase,
      }),
    [
      packagePosition,
      packageLoad,
      attendance,
      overrides,
      supportPlacements,
      totalSupportCount,
      employees,
      lineBase,
    ]
  );

  const urgentMap = useMemo(
    () => computeUrgentByGroup(urgentProduction, workDate),
    [urgentProduction, workDate]
  );

  const missing: string[] = [];
  if (packagePosition.length === 0) missing.push("포장라인 기본근무위치");
  if (attendance.length === 0) missing.push("근태");
  if (packageLoad.length === 0) missing.push("라인별 포장 부하");

  // 포장1라인은 자동라인 없음 (대림과 다름) — 직접 그룹만
  const directGroups = result.groups.filter((g) => g.group !== "피더");

  const groups: ReallocGroupInput[] = directGroups.map((g) => {
    const u = getUrgentFor(urgentMap, g.group);
    return {
      name: g.group,
      loadHours: g.loadHours,
      headcount: g.presentMembers.length + g.supportCount,
      urgent: u.dMinus1 > 0 || u.dMinus2 > 0,
    };
  });
  const extraFree: ReallocExtraFree[] = [];

  const lineWorkers: Record<string, string[]> = {};
  for (const g of directGroups) {
    const names = g.presentMembers.map((m) => m.name);
    for (let i = 0; i < g.supportCount; i++) {
      names.push(`지원자${i + 1}`);
    }
    lineWorkers[g.group] = names;
  }

  return { groups, extraFree, missing, lineWorkers };
}
