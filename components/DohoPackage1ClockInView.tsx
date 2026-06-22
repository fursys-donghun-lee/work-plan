"use client";

import { useMemo, useCallback } from "react";
import {
  ClockInView,
  type ClockInConfig,
  type GuideMove,
} from "@/components/ClockInView";
import { useDataStore } from "@/lib/store/useDataStore";
import { useDohoPackage1Realloc } from "@/components/useDohoPackage1Realloc";
import {
  computeReallocation,
  wallToWorkTime,
  plannedWorkDoneAt,
} from "@/lib/calc/reallocation";
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
  const manualClockIns = useDataStore((s) => s.manualClockIns);
  const currentLineOverrides = useDataStore((s) => s.currentLineOverrides);
  const supportTargetMap = useDataStore((s) => s.supportTargetMap);
  const { groups, extraFree, lineWorkers } = useDohoPackage1Realloc();

  // 재배치 가이드 — 지원 보낸/받은 인원 반영한 minimum-churn 배치
  const computeAutoPlaceGuide = useCallback((): GuideMove[] => {
    const SELF_LINE = "포장1라인";
    const nameToEmp = new Map<string, Employee>();
    for (const e of employees) nameToEmp.set(e.name, e);

    // 우리 회사 직원 중 지원 보낸 사람 (작업가능에서 제외)
    const sendingAwayNames = new Set<string>();
    for (const e of employees) {
      if (!e.department.includes("다호산업")) continue;
      const target = supportTargetMap[e.empCode];
      if (
        currentLineOverrides[e.empCode] === "지원" &&
        target &&
        target !== SELF_LINE
      ) {
        sendingAwayNames.add(e.name);
      }
    }

    // 다른 회사에서 우리 라인 지원 온 사람
    //   override 가 우리 슬롯(raw — 포장1(CR1) 등)이면 그 슬롯에 배치, '지원' 이면 풀
    const receivedSlot: Array<{ name: string; rawSlot: string }> = [];
    const receivedPool: string[] = [];
    const REALLOC_GROUPS_SET = new Set<string>(groups.map((g) => g.name));
    for (const e of employees) {
      if (e.department.includes("다호산업")) continue;
      if (!manualClockIns[e.empCode]) continue;
      const target = supportTargetMap[e.empCode];
      if (target !== SELF_LINE) continue;
      const override = currentLineOverrides[e.empCode];
      if (override && override !== "지원") {
        // 현장 슬롯명을 raw 그룹명으로 역변환
        const entry = Object.entries(POSITION_TO_SLOT).find(
          ([, slot]) => slot === override
        );
        const rawSlot = entry ? entry[0] : override;
        if (REALLOC_GROUPS_SET.has(rawSlot)) {
          receivedSlot.push({ name: e.name, rawSlot });
        } else {
          receivedPool.push(e.name);
        }
      } else {
        receivedPool.push(e.name);
      }
    }

    // effectiveLineWorkers
    const effectiveLineWorkers: Record<string, string[]> = {};
    const originLineOf = new Map<string, string>();
    for (const [line, workers] of Object.entries(lineWorkers)) {
      const kept: string[] = [];
      for (const w of workers) {
        if (sendingAwayNames.has(w)) continue;
        kept.push(w);
        originLineOf.set(w, line);
      }
      effectiveLineWorkers[line] = kept;
    }
    for (const r of receivedSlot) {
      if (!effectiveLineWorkers[r.rawSlot]) effectiveLineWorkers[r.rawSlot] = [];
      effectiveLineWorkers[r.rawSlot].push(r.name);
      originLineOf.set(r.name, r.rawSlot);
    }
    for (const name of receivedPool) {
      originLineOf.set(name, "지원");
    }

    const adjustedGroups = groups.map((g) => ({
      ...g,
      headcount: (effectiveLineWorkers[g.name] ?? []).length,
    }));
    const now = new Date();
    const wall = now.getHours() + now.getMinutes() / 60;
    const currentWt = wallToWorkTime(wall);

    // 1차 — 아침 기준 풀데이 계획
    const firstPass = computeReallocation(
      adjustedGroups,
      0,
      8,
      extraFree,
      false,
      true
    );
    // 라인별 남은 부하 / 긴급 처리 여부
    const remainingGroups = adjustedGroups.map((g) => {
      const t = firstPass.timelines.find((tl) => tl.name === g.name);
      if (!t) return g;
      const done = plannedWorkDoneAt(t, currentWt);
      const remaining = Math.max(0, g.loadHours - done);
      return {
        ...g,
        loadHours: remaining,
        urgent: g.urgent && remaining > 0.5,
      };
    });
    // 2차 — 남은 부하 기준 재계획
    const result = computeReallocation(
      remainingGroups,
      0,
      8,
      extraFree,
      false,
      true
    );

    const targets = new Map<string, number>();
    for (const t of result.timelines) {
      let target = 0;
      for (const seg of t.segments) {
        if (seg.start <= 1e-6 && 0 < seg.end + 1e-6) {
          target = seg.base + seg.added;
          break;
        }
      }
      targets.set(t.name, target);
    }

    const allocation = new Map<string, string[]>();
    for (const [line, workers] of Object.entries(effectiveLineWorkers)) {
      allocation.set(line, [...workers]);
    }
    const excess: string[] = [...receivedPool];
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
    for (const [line, target] of targets) {
      if (!allocation.has(line) && target > 0) {
        needs.set(line, target);
        allocation.set(line, []);
      }
    }

    for (const [line, count] of needs) {
      for (let i = 0; i < count; i++) {
        const worker = excess.shift();
        if (!worker) break;
        allocation.get(line)!.push(worker);
      }
    }

    const guides: GuideMove[] = [];
    for (const [rawLine, workers] of allocation) {
      for (const w of workers) {
        const rawOrigin = originLineOf.get(w);
        if (!rawOrigin || rawOrigin === rawLine) continue;
        const emp = nameToEmp.get(w);
        if (!emp) continue;
        const fromLine =
          rawOrigin === "지원" ? "지원" : REALLOC_GROUP_TO_SLOT[rawOrigin] ?? rawOrigin;
        const toLine = REALLOC_GROUP_TO_SLOT[rawLine] ?? rawLine;
        guides.push({ empCode: emp.empCode, name: w, fromLine, toLine });
      }
    }
    return guides;
  }, [
    groups,
    extraFree,
    lineWorkers,
    employees,
    manualClockIns,
    currentLineOverrides,
    supportTargetMap,
  ]);

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
      computeAutoPlaceGuide,
    }),
    [computeAutoPlaceGuide]
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
