"use client";

import { useMemo } from "react";
import { ClockInView, type ClockInConfig } from "@/components/ClockInView";
import { useDataStore } from "@/lib/store/useDataStore";
import type { Employee, WorkGroup } from "@/lib/types";

// 사용자 지정 그리드 — 작업그룹명과 정확히 일치 (공백 포함)
const LINE_GRID: string[][] = [
  ["레이져", "타일 1호기", "타일 2호기"],
  ["자동판금", "전동침대", "쿠시노"],
  ["데스커 용접", "프레임 용접"],
];
const GRID_LINES = new Set<string>(LINE_GRID.flat());

// 화면에는 사용자가 입력한 "타일1호기"·"타일2호기" 로 표시 (그리드 키는 공백 유지)
const DISPLAY_NAME: Record<string, string> = {
  "타일 1호기": "타일1호기",
  "타일 2호기": "타일2호기",
};

export function WoosungClockInView() {
  const workGroups = useDataStore((s) => s.workGroups);

  const config = useMemo<ClockInConfig>(() => {
    // workerName → group 이름 매핑 빌드
    const workerToGroup = new Map<string, string>();
    for (const g of workGroups) {
      for (const w of g.workers) {
        if (w && GRID_LINES.has(g.name)) workerToGroup.set(w, g.name);
      }
    }

    const slotFor = (e: Employee): string => {
      const slot = workerToGroup.get(e.name);
      if (slot) return slot;
      return "기타";
    };

    const classifyGroup = (
      e: Employee
    ): "소사장" | "피더" | "작업자" | null => {
      if (e.category.includes("사장")) return "소사장";
      // 우성 가공라인에는 피더 개념 없음 — 항상 0
      if (e.category === "가공라인") return "작업자";
      return null;
    };

    return {
      companyDept: "우성산업",
      selfLines: ["가공라인"],
      defaultSupportTarget: "가공라인",
      pageTitle: "우성산업 · 가공라인 현장 대시보드",
      lineGrid: LINE_GRID,
      slotFor,
      classifyGroup,
      displayLineName: (l) => DISPLAY_NAME[l] ?? l,
    };
  }, [workGroups]);

  return <ClockInView config={config} />;
}
