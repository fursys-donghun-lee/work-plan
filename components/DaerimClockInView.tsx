"use client";

import { useMemo, useCallback } from "react";
import {
  ClockInView,
  type ClockInConfig,
  type GuideMove,
} from "@/components/ClockInView";
import { useDataStore } from "@/lib/store/useDataStore";
import { useDaerimRealloc } from "@/components/useDaerimRealloc";
import { computeReallocation, wallToWorkTime } from "@/lib/calc/reallocation";
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
  const { groups, extraFree, lineWorkers } = useDaerimRealloc();

  // 재배치 가이드 — 현재 시각의 라인별 목표 인원 기준 minimum-churn 배치
  //   원래 라인이 여전히 그 인원을 필요로 하면 그대로 유지 (불필요 이동 방지)
  const computeAutoPlaceGuide = useCallback((): GuideMove[] => {
    const result = computeReallocation(groups, 0, 8, extraFree, false, true);
    const now = new Date();
    const wall = now.getHours() + now.getMinutes() / 60;
    const currentWt = wallToWorkTime(wall);

    // 1) 현재 시각의 라인별 목표 인원 산출
    const targets = new Map<string, number>();
    for (const t of result.timelines) {
      let target = 0;
      for (const seg of t.segments) {
        if (seg.start <= currentWt + 1e-6 && currentWt < seg.end + 1e-6) {
          target = seg.base + seg.added;
          break;
        }
      }
      targets.set(t.name, target);
    }

    // 2) 워커 초기 배치 + 원래 라인 기억
    const allocation = new Map<string, string[]>();
    const originLineOf = new Map<string, string>();
    for (const [line, workers] of Object.entries(lineWorkers)) {
      allocation.set(line, [...workers]);
      for (const w of workers) originLineOf.set(w, line);
    }

    // 3) 초과 인원 추출 (원래 라인의 target 까지만 유지)
    const excess: string[] = [];
    const needs = new Map<string, number>();
    for (const [line, workers] of allocation) {
      const target = targets.get(line) ?? 0;
      if (workers.length > target) {
        const removed = workers.splice(target);
        excess.push(...removed);
      } else if (workers.length < target) {
        needs.set(line, target - workers.length);
      }
    }
    // lineWorkers 에 없던 라인이 target>0 이면 needs 에 추가
    for (const [line, target] of targets) {
      if (!allocation.has(line) && target > 0) {
        needs.set(line, target);
        allocation.set(line, []);
      }
    }

    // 4) 초과 인원을 부족 라인에 배정
    for (const [line, count] of needs) {
      for (let i = 0; i < count; i++) {
        const worker = excess.shift();
        if (!worker) break;
        allocation.get(line)!.push(worker);
      }
    }

    // 5) 가이드 생성 — 원래 라인과 다른 라인에 있는 워커만
    const nameToEmp = new Map<string, Employee>();
    for (const e of employees) {
      if (e.department.includes("대림산업")) nameToEmp.set(e.name, e);
    }
    const guides: GuideMove[] = [];
    for (const [line, workers] of allocation) {
      for (const w of workers) {
        const origin = originLineOf.get(w);
        if (!origin || origin === line) continue;
        const emp = nameToEmp.get(w);
        if (!emp) continue;
        guides.push({ empCode: emp.empCode, name: w, fromLine: origin, toLine: line });
      }
    }
    return guides;
  }, [groups, extraFree, lineWorkers, employees]);

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
      computeAutoPlaceGuide,
    }),
    [computeAutoPlaceGuide]
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
