"use client";

import { useMemo } from "react";
import { ClockInView, type ClockInConfig } from "@/components/ClockInView";
import { useDataStore } from "@/lib/store/useDataStore";
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

function slotFor(e: Employee, packagePos: Map<string, string>): string {
  // 물류 카테고리는 항상 물류 슬롯
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

const config: ClockInConfig = {
  companyDept: "다호산업",
  selfLines: ["포장1라인"],
  defaultSupportTarget: "포장1라인",
  pageTitle: "다호산업 · 포장1라인 현장 대시보드",
  lineGrid: LINE_GRID,
  slotFor,
  classifyGroup,
  // 다호산업 중 구분이 포장1라인 / 물류 인 직원만 노출
  categoryFilter: (e) => e.category === "포장1라인" || e.category === "물류",
};

export function DohoPackage1ClockInView() {
  const urgentProduction = useDataStore((s) => s.urgentProduction);
  const workDate = useDataStore((s) => s.workDate);
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
