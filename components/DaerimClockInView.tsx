"use client";

import { ClockInView, type ClockInConfig } from "@/components/ClockInView";
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

const config: ClockInConfig = {
  companyDept: "대림산업",
  selfLines: ["포장2라인"],
  defaultSupportTarget: "포장2라인",
  pageTitle: "대림산업 · 현장 대시보드",
  lineGrid: LINE_GRID,
  slotFor,
  classifyGroup,
  displayLineName: (l) => (l === "자동포장라인" ? "자동포장" : l),
};

export function DaerimClockInView() {
  return <ClockInView config={config} />;
}
