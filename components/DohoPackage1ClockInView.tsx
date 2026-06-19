"use client";

import { ClockInView, type ClockInConfig } from "@/components/ClockInView";
import type { Employee } from "@/lib/types";

// 슬롯 키 (사용자 지정 그리드) — packagePosition.position 의 "포장1(...)" 매핑
const LINE_GRID: string[][] = [
  ["기타1", "기타2", "CR1", "CR2"],
  ["침대", "HSOD"],
  ["타일", "마감1", "마감2"],
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

function slotFor(e: Employee, packagePos: Map<string, string>): string {
  const pkgPos = packagePos.get(e.empCode);
  if (pkgPos && POSITION_TO_SLOT[pkgPos]) return POSITION_TO_SLOT[pkgPos];
  // baseLocation 이 슬롯 키와 같은 경우 fallback
  const loc = (e.baseLocation || "").trim();
  if (GRID_LINES.has(loc)) return loc;
  return "기타";
}

function classifyGroup(
  e: Employee,
  packagePos: Map<string, string>
): "소사장" | "피더" | "작업자" | null {
  if (e.category.includes("사장")) return "소사장";
  // 피더 = packagePosition.position === '피더'
  if (packagePos.get(e.empCode) === "피더") return "피더";
  if (e.category === "포장1라인") return "작업자";
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
};

export function DohoPackage1ClockInView() {
  return <ClockInView config={config} />;
}
