"use client";

import { ClockInView, type ClockInConfig } from "@/components/ClockInView";
import type { Employee } from "@/lib/types";

// 도장 그룹 — 쇼트 / 도장1라인 / 도장2라인 (3행)
const LINE_GRID: string[][] = [["쇼트"], ["도장1라인"], ["도장2라인"]];

// 쇼트 그룹 작업자 (도장1라인 소속이지만 실제 쇼트 작업) — dohoPaintLoad.ts 와 동일
const SHOT_WORKERS = new Set<string>(["김상균"]);

function slotFor(e: Employee): string {
  if (SHOT_WORKERS.has(e.name)) return "쇼트";
  if (e.category === "도장1라인") return "도장1라인";
  if (e.category === "도장2라인") return "도장2라인";
  return "기타";
}

function classifyGroup(
  e: Employee,
  packagePos: Map<string, string>
): "소사장" | "피더" | "작업자" | null {
  if (e.category.includes("사장")) return "소사장";
  if (packagePos.get(e.empCode) === "피더") return "피더";
  if (
    e.category === "도장1라인" ||
    e.category === "도장2라인" ||
    SHOT_WORKERS.has(e.name)
  ) {
    return "작업자";
  }
  return null;
}

const config: ClockInConfig = {
  companyDept: "다호산업",
  selfLines: ["도장1라인", "도장2라인"],
  defaultSupportTarget: "도장1라인",
  pageTitle: "다호산업 · 도장라인 현장 대시보드",
  lineGrid: LINE_GRID,
  slotFor,
  classifyGroup,
};

export function DohoPaintClockInView() {
  return <ClockInView config={config} />;
}
