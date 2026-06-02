"use client";

import { useMemo } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { computePackage2Load } from "@/lib/calc/package2Load";
import { computeAll } from "@/lib/calc";
import { computeDohoPaintLoad } from "@/lib/calc/dohoPaintLoad";
import { computeUrgentByGroup, getUrgentFor } from "@/lib/calc/urgentLoad";
import type {
  ReallocGroupInput,
  ReallocExtraFree,
} from "@/lib/calc/reallocation";
import type { SupportAssignment } from "@/lib/types";

const AUTO_GROUP_NAMES = new Set(["PA-01", "PA-02", "자동포장(파이프)"]);

// 대림 포장2라인 재배치 입력(그룹 + 잉여인력) 계산 — DaerimFloorView / DaerimPlanView 공용
export function useDaerimRealloc(): {
  groups: ReallocGroupInput[];
  extraFree: ReallocExtraFree[];
  missing: string[];
  lineWorkers: Record<string, string[]>; // 라인 이름 → 작업자 이름 리스트
} {
  const packagePosition = useDataStore((s) => s.packagePosition);
  const packageLoad = useDataStore((s) => s.packageLoad);
  const attendance = useDataStore((s) => s.attendance);
  const overrides = useDataStore((s) => s.package2WorkerOverrides);
  const supportPlacements = useDataStore((s) => s.package2SupportPlacements);
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
    if (a.targetLine !== "포장2라인") continue;
    totalSupportCount += confirmedFor(a);
  }

  const result = useMemo(
    () =>
      computePackage2Load({
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

  const directGroups = result.groups.filter((g) => g.group !== "피더");
  const autoGroups = directGroups.filter((g) => AUTO_GROUP_NAMES.has(g.group));
  const nonAutoGroups = directGroups.filter(
    (g) => !AUTO_GROUP_NAMES.has(g.group)
  );
  const autoLoad = autoGroups.reduce((s, g) => s + g.loadHours, 0);
  const autoPresent = autoGroups.reduce(
    (s, g) => s + g.presentMembers.length + g.supportCount,
    0
  );
  const autoExtra = Math.max(0, autoPresent - 1);

  const groups: ReallocGroupInput[] = [
    ...nonAutoGroups.map((g) => {
      const u = getUrgentFor(urgentMap, g.group);
      return {
        name: g.group,
        loadHours: g.loadHours,
        headcount: g.presentMembers.length + g.supportCount,
        urgent: u.dMinus1 > 0 || u.dMinus2 > 0,
      };
    }),
    {
      name: "자동포장라인",
      loadHours: autoLoad,
      headcount: autoPresent > 0 ? 1 : 0,
      autoManaged: true,
    },
  ];
  const extraFree: ReallocExtraFree[] =
    autoExtra > 0 ? [{ origin: "자동포장라인", count: autoExtra }] : [];

  // 라인별 작업자 이름 리스트 (재배치 이름 지정 view 용)
  const lineWorkers: Record<string, string[]> = {};
  for (const g of nonAutoGroups) {
    const names = g.presentMembers.map((m) => m.name);
    for (let i = 0; i < g.supportCount; i++) {
      names.push(`지원자${i + 1}`);
    }
    lineWorkers[g.group] = names;
  }
  // 자동포장라인은 그룹 합쳐서 하나 — 출근자 이름 모두 포함
  const autoNames: string[] = [];
  for (const g of autoGroups) {
    for (const m of g.presentMembers) autoNames.push(m.name);
    for (let i = 0; i < g.supportCount; i++) {
      autoNames.push(`${g.group}지원${i + 1}`);
    }
  }
  lineWorkers["자동포장라인"] = autoNames;

  return { groups, extraFree, missing, lineWorkers };
}
