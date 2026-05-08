"use client";

import { useEffect, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { computeAll, type ComputeResult } from "@/lib/calc";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

export function useComputed(): ComputeResult | null {
  const hydrated = useHydrated();
  const employees = useDataStore((s) => s.employees);
  const equipment = useDataStore((s) => s.equipment);
  const loadPlan = useDataStore((s) => s.loadPlan);
  const attendance = useDataStore((s) => s.attendance);
  const workGroups = useDataStore((s) => s.workGroups);
  const supportAssignments = useDataStore((s) => s.supportAssignments);

  if (!hydrated) return null;

  return computeAll({
    employees,
    equipment,
    loadPlan,
    attendance,
    workGroups,
    supportAssignments,
  });
}
