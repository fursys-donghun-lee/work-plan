"use client";

import { useMemo, useCallback } from "react";
import { ClockInView, type ClockInConfig } from "@/components/ClockInView";
import { useDataStore } from "@/lib/store/useDataStore";
import { useDohoPackage1Realloc } from "@/components/useDohoPackage1Realloc";
import { computeReallocation } from "@/lib/calc/reallocation";
import { computeUrgentByGroup, getUrgentFor } from "@/lib/calc/urgentLoad";
import type { Employee } from "@/lib/types";

// 슬롯 키 (사용자 지정 그리드) — 5행 배치 (마지막 행에 물류)
const LINE_GRID: string[][] = [
  ["기타1", "기타2"],
  ["CR1", "CR2"],
  ["침대", "HSOD"],
  ["타일", "마감1", "마감2"],
  ["물류"],
];
const GRID_LINES = new Set<string>(LINE_GRID.flat());

// packagePosition.position → 슬롯 키 매핑 (포장1(...) 안의 키워드)
const POSITION_TO_SLOT: Record<string, string> = {
  "포장1(CR1)": "CR1",
  "포장1(CR2)": "CR2",
  "포장1(기타1)": "기타1",
  "포장1(기타2)": "기타2",
  "포장1(HSOD)": "HSOD",
  "포장1(침대)": "침대",
  "포장1(타일1)": "타일",
  "포장1(마감1)": "마감1",
  "포장1(마감2)": "마감2",
};

// 역매핑 — 슬롯 키 → urgentProduction.packageLine 형식 (포장1(...))
const SLOT_TO_URGENT_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(POSITION_TO_SLOT).map(([pos, slot]) => [slot, pos])
);

// 재배치 알고리즘의 그룹명 ('포장1(CR1)') → 현장 슬롯명 ('CR1') 매핑
// — 재배치 결과를 현장 슬롯에 적용할 때 사용
const REALLOC_GROUP_TO_SLOT: Record<string, string> = POSITION_TO_SLOT;

function slotFor(e: Employee, packagePos: Map<string, string>): string {
  if (e.category === "물류") return "물류";
  const pkgPos = packagePos.get(e.empCode);
  if (pkgPos && POSITION_TO_SLOT[pkgPos]) return POSITION_TO_SLOT[pkgPos];
  const loc = (e.baseLocation || "").trim();
  if (GRID_LINES.has(loc)) return loc;
  return "기타";
}

function classifyGroup(
  e: Employee,
  packagePos: Map<string, string>
): "소사장" | "피더" | "작업자" | null {
  if (e.category.includes("사장")) return "소사장";
  if (packagePos.get(e.empCode) === "피더") return "피더";
  if (e.category === "포장1라인" || e.category === "물류") return "작업자";
  return null;
}

export function DohoPackage1ClockInView() {
  const employees = useDataStore((s) => s.employees);
  const urgentProduction = useDataStore((s) => s.urgentProduction);
  const workDate = useDataStore((s) => s.workDate);
  const bulkMoveWorkers = useDataStore((s) => s.bulkMoveWorkers);
  const { groups, extraFree, lineWorkers } = useDohoPackage1Realloc();

  // 재배치 계획의 자동 배치 로직
  const handleAutoPlace = useCallback(() => {
    const result = computeReallocation(groups, 0, 8, extraFree, false, true);
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
    const nameToEmp = new Map<string, Employee>();
    for (const e of employees) {
      if (e.department.includes("다호산업")) nameToEmp.set(e.name, e);
    }
    const moves: Array<{ empCode: string; name: string; toLine: string }> = [];
    for (const [name, line] of Object.entries(finalLineByName)) {
      const emp = nameToEmp.get(name);
      if (!emp) continue;
      // 재배치 그룹명 → 현장 슬롯명 변환
      const toLine = REALLOC_GROUP_TO_SLOT[line] ?? line;
      moves.push({ empCode: emp.empCode, name, toLine });
    }
    bulkMoveWorkers(moves);
  }, [groups, extraFree, lineWorkers, employees, bulkMoveWorkers]);

  const config = useMemo<ClockInConfig>(
    () => ({
      companyDept: "다호산업",
      selfLines: ["포장1라인"],
      defaultSupportTarget: "포장1라인",
      pageTitle: "다호산업 · 포장1라인 현장 대시보드",
      lineGrid: LINE_GRID,
      slotFor,
      classifyGroup,
      categoryFilter: (e) => e.category === "포장1라인" || e.category === "물류",
      onAutoPlace: handleAutoPlace,
    }),
    [handleAutoPlace]
  );

  const urgentSlots = useMemo(() => {
    const m = computeUrgentByGroup(urgentProduction, workDate);
    const set = new Set<string>();
    for (const slot of LINE_GRID.flat()) {
      const urgentKey = SLOT_TO_URGENT_KEY[slot];
      if (!urgentKey) continue;
      const u = getUrgentFor(m, urgentKey);
      if (u.dMinus1 > 0 || u.dMinus2 > 0) set.add(slot);
    }
    return set;
  }, [urgentProduction, workDate]);

  return <ClockInView config={config} urgentSlots={urgentSlots} />;
}
