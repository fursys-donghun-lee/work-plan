"use client";

import { useMemo, useCallback } from "react";
import {
  ClockInView,
  type ClockInConfig,
  type GuideMove,
} from "@/components/ClockInView";
import { useDataStore } from "@/lib/store/useDataStore";
import { useDaerimRealloc } from "@/components/useDaerimRealloc";
import {
  computeReallocation,
  wallToWorkTime,
  plannedWorkDoneAt,
} from "@/lib/calc/reallocation";
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
  const manualClockIns = useDataStore((s) => s.manualClockIns);
  const currentLineOverrides = useDataStore((s) => s.currentLineOverrides);
  const supportTargetMap = useDataStore((s) => s.supportTargetMap);
  const { groups, extraFree, lineWorkers } = useDaerimRealloc();

  // 재배치 가이드 — 지원 보낸/받은 인원 반영한 minimum-churn 배치
  const computeAutoPlaceGuide = useCallback((): GuideMove[] => {
    const SELF_LINE = "포장2라인";
    const nameToEmp = new Map<string, Employee>();
    for (const e of employees) nameToEmp.set(e.name, e);

    // 0) 우리 회사 직원 중 지원 보낸 사람 (작업가능에서 제외)
    const sendingAwayNames = new Set<string>();
    for (const e of employees) {
      if (!e.department.includes("대림산업")) continue;
      const target = supportTargetMap[e.empCode];
      if (
        currentLineOverrides[e.empCode] === "지원" &&
        target &&
        target !== SELF_LINE
      ) {
        sendingAwayNames.add(e.name);
      }
    }

    // 0-B) 다른 회사에서 우리 라인 지원 온 사람 (작업가능에 추가)
    //   currentLineOverrides 가 우리 슬롯이면 그 슬롯에 배치, '지원' 이면 풀
    const receivedSlot: Array<{ name: string; slot: string }> = [];
    const receivedPool: string[] = []; // 슬롯 없이 풀에 있음
    for (const e of employees) {
      if (e.department.includes("대림산업")) continue;
      if (!manualClockIns[e.empCode]) continue;
      const target = supportTargetMap[e.empCode];
      if (target !== SELF_LINE) continue;
      const override = currentLineOverrides[e.empCode];
      if (override && override !== "지원" && GRID_LINES.has(override)) {
        receivedSlot.push({ name: e.name, slot: override });
      } else {
        receivedPool.push(e.name);
      }
    }

    // 1) effectiveLineWorkers — 지원 보낸 제외 + 받은 지원(슬롯 배치) 포함
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
      if (!effectiveLineWorkers[r.slot]) effectiveLineWorkers[r.slot] = [];
      effectiveLineWorkers[r.slot].push(r.name);
      originLineOf.set(r.name, r.slot);
    }
    // 풀 인원은 어디 출발인지 없음 — '지원' 으로 표시
    for (const name of receivedPool) {
      originLineOf.set(name, "지원");
    }

    // 2) groups 의 headcount 를 effective 기준으로 보정 → 알고리즘에 정확한 입력
    const adjustedGroups = groups.map((g) => ({
      ...g,
      headcount: (effectiveLineWorkers[g.name] ?? []).length,
    }));
    const now = new Date();
    const wall = now.getHours() + now.getMinutes() / 60;
    const currentWt = wallToWorkTime(wall);

    // 2-A) 1차 — 아침 기준 풀데이 계획 (남은 부하 추정용)
    const firstPass = computeReallocation(
      adjustedGroups,
      0,
      8,
      extraFree,
      false,
      true
    );

    // 2-B) 라인별 남은 부하 + 긴급 처리 여부 추정 (현재 시각까지의 계획 처리량 기준)
    const remainingGroups = adjustedGroups.map((g) => {
      const t = firstPass.timelines.find((tl) => tl.name === g.name);
      if (!t) return g;
      const done = plannedWorkDoneAt(t, currentWt);
      const remaining = Math.max(0, g.loadHours - done);
      return {
        ...g,
        loadHours: remaining,
        // 긴급건이 처리됐다면(남은 부하가 거의 없으면) urgent 해제
        urgent: g.urgent && remaining > 0.5,
      };
    });

    // 2-C) 2차 — 남은 부하 기준 재계획 (지금 이 시각의 권장 분포)
    const result = computeReallocation(
      remainingGroups,
      0,
      8,
      extraFree,
      false,
      true
    );

    // 3) 현재 시각(=재계획의 wt=0)의 라인별 목표 인원
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

    // 4) 초과 추출 + 부족 식별
    const allocation = new Map<string, string[]>();
    for (const [line, workers] of Object.entries(effectiveLineWorkers)) {
      allocation.set(line, [...workers]);
    }
    const excess: string[] = [...receivedPool]; // 풀 인원은 처음부터 excess
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

    // 5) 초과 인원을 부족 라인에 배정
    for (const [line, count] of needs) {
      for (let i = 0; i < count; i++) {
        const worker = excess.shift();
        if (!worker) break;
        allocation.get(line)!.push(worker);
      }
    }

    // 6) 가이드 생성 (사유 태그 포함)
    const remainingGroupsMap = new Map(
      remainingGroups.map((g) => [g.name, g])
    );
    const guides: GuideMove[] = [];
    for (const [line, workers] of allocation) {
      for (const w of workers) {
        const origin = originLineOf.get(w);
        if (!origin || origin === line) continue;
        const emp = nameToEmp.get(w);
        if (!emp) continue;
        const target = remainingGroupsMap.get(line);
        const reason: "urgent" | "overtime" | "load" = target?.urgent
          ? "urgent"
          : currentWt >= 8
            ? "overtime"
            : "load";
        guides.push({
          empCode: emp.empCode,
          name: w,
          fromLine: origin,
          toLine: line,
          reason,
        });
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

  // 알고리즘 기준 잔업 예정 인원 (현재 출근 인원 기준)
  const plannedOvertime = useMemo(() => {
    const result = computeReallocation(groups, 0, 8, extraFree, false, true);
    return result.overtimePeople;
  }, [groups, extraFree]);

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
      plannedOvertimePeople: plannedOvertime,
    }),
    [computeAutoPlaceGuide, plannedOvertime]
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
