"use client";

import { useMemo, useCallback } from "react";
import { ClockInView, type ClockInConfig } from "@/components/ClockInView";
import { useDataStore } from "@/lib/store/useDataStore";
import { useDaerimRealloc } from "@/components/useDaerimRealloc";
import { computeReallocation } from "@/lib/calc/reallocation";
import { computeUrgentByGroup, getUrgentFor } from "@/lib/calc/urgentLoad";
import type { Employee } from "@/lib/types";
import { PACKAGE2_FEEDER_WORKERS } from "@/lib/types";

const FEEDER_NAME_SET = new Set<string>(PACKAGE2_FEEDER_WORKERS);

const LINE_GRID: string[][] = [
  ["PA-01", "PA-02", "PA-03", "PA-04", "PA-05"],
  ["MM-01", "MM-02", "MM-03", "MM-04"],
  ["PA-06", "PA-07", "자동포장라인", "포장철물"],
  ["MA-01", "MA-02", "MA-03", "MM-05"],
];
const GRID_LINES = new Set<string>(LINE_GRID.flat());

const AUTO_PACKAGE_POSITIONS = new Set<string>([
  "PA-01",
  "PA-02",
  "자동포장(파이프)",
]);

function slotFor(e: Employee, packagePos: Map<string, string>): string {
  if (
    e.category.includes("포장철물") ||
    e.department.includes("포장철물") ||
    e.baseLocation.includes("포장철물") ||
    e.position.includes("포장철물")
  ) {
    return "포장철물";
  }
  const pkgPos = packagePos.get(e.empCode);
  if (pkgPos) {
    if (AUTO_PACKAGE_POSITIONS.has(pkgPos)) return "자동포장라인";
    if (GRID_LINES.has(pkgPos)) return pkgPos;
  }
  const loc = (e.baseLocation || "").trim();
  if (GRID_LINES.has(loc)) return loc;
  return "기타";
}

function classifyGroup(
  e: Employee
): "소사장" | "피더" | "작업자" | null {
  if (e.category.includes("사장")) return "소사장";
  if (FEEDER_NAME_SET.has(e.name)) return "피더";
  const hasPCM =
    e.category.includes("포장철물") ||
    e.department.includes("포장철물") ||
    e.baseLocation.includes("포장철물") ||
    e.position.includes("포장철물");
  if (hasPCM) return "작업자";
  if (e.category === "포장2라인") return "작업자";
  return null;
}

export function DaerimClockInView() {
  const employees = useDataStore((s) => s.employees);
  const urgentProduction = useDataStore((s) => s.urgentProduction);
  const workDate = useDataStore((s) => s.workDate);
  const bulkMoveWorkers = useDataStore((s) => s.bulkMoveWorkers);
  const { groups, extraFree, lineWorkers } = useDaerimRealloc();

  // 재배치 계획의 자동 배치 로직 — 같은 알고리즘 결과로 라인 재배치
  const handleAutoPlace = useCallback(() => {
    const result = computeReallocation(groups, 0, 8, extraFree, false, true);
    // 각 워커의 '최종 도착 라인' 계산
    const byLine: Record<string, string[]> = {};
    const finalLineByName: Record<string, string> = {};
    for (const [line, workers] of Object.entries(lineWorkers)) {
      byLine[line] = [...workers];
      for (const w of workers) finalLineByName[w] = line;
    }
    const sortedMoves = [...result.moves].sort((a, b) => a.time - b.time);
    for (const m of sortedMoves) {
      for (let i = 0; i < m.count; i++) {
        const fromList = byLine[m.from] ?? [];
        const worker = fromList.shift();
        if (!worker) continue;
        if (!byLine[m.to]) byLine[m.to] = [];
        byLine[m.to].push(worker);
        finalLineByName[worker] = m.to;
      }
    }
    // name → empCode 매핑 + 이동 list 생성
    const nameToEmp = new Map<string, Employee>();
    for (const e of employees) {
      if (e.department.includes("대림산업")) nameToEmp.set(e.name, e);
    }
    const moves: Array<{ empCode: string; name: string; toLine: string }> = [];
    for (const [name, line] of Object.entries(finalLineByName)) {
      const emp = nameToEmp.get(name);
      if (!emp) continue;
      moves.push({ empCode: emp.empCode, name, toLine: line });
    }
    bulkMoveWorkers(moves);
  }, [groups, extraFree, lineWorkers, employees, bulkMoveWorkers]);

  const config = useMemo<ClockInConfig>(
    () => ({
      companyDept: "대림산업",
      selfLines: ["포장2라인"],
      defaultSupportTarget: "포장2라인",
      pageTitle: "대림산업 · 현장 대시보드",
      lineGrid: LINE_GRID,
      slotFor,
      classifyGroup,
      displayLineName: (l) => (l === "자동포장라인" ? "자동포장" : l),
      onAutoPlace: handleAutoPlace,
    }),
    [handleAutoPlace]
  );

  const urgentSlots = useMemo(() => {
    const m = computeUrgentByGroup(urgentProduction, workDate);
    const set = new Set<string>();
    for (const slot of LINE_GRID.flat()) {
      const u = getUrgentFor(m, slot);
      if (u.dMinus1 > 0 || u.dMinus2 > 0) set.add(slot);
    }
    return set;
  }, [urgentProduction, workDate]);

  return <ClockInView config={config} urgentSlots={urgentSlots} />;
}
