import type { PaintPlanRow } from "@/lib/types";

export interface LineGroupSummary {
  lineName: string;
  itemCount: number;       // 건수
  totalPlanQty: number;    // 총 계획량
  totalPlanMinutes: number; // 총 계획시간 (분)
  totalPlanHours: number;  // 총 계획시간 (시간)
  inputQty: number;        // 총 투입량
  prodQty: number;         // 총 생산수량
  rows: PaintPlanRow[];    // 상세 행
}

// 도장라인 부하: AJ열(작업설비) "#도장 1라인" / "#도장 2라인" 기준 그룹핑
export function summarizeByPaintLine(rows: PaintPlanRow[]): LineGroupSummary[] {
  const grouped = new Map<string, PaintPlanRow[]>();
  for (const r of rows) {
    const line = r.paintLine || "(미지정)";
    if (!grouped.has(line)) grouped.set(line, []);
    grouped.get(line)!.push(r);
  }
  return Array.from(grouped.entries())
    .map(([line, items]) => buildSummary(line, items))
    .sort((a, b) => a.lineName.localeCompare(b.lineName, "ko"));
}

// 포장1라인 부하: AZ열(포장라인) 중 "포장1"로 시작하는 것만 필터해서 세부 그룹핑
export function summarizeByPackage1(rows: PaintPlanRow[]): {
  total: LineGroupSummary;
  groups: LineGroupSummary[];
} {
  const filtered = rows.filter((r) => r.packageLine.startsWith("포장1"));
  const grouped = new Map<string, PaintPlanRow[]>();
  for (const r of filtered) {
    const key = r.packageLine || "(미지정)";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  const groups = Array.from(grouped.entries())
    .map(([line, items]) => buildSummary(line, items))
    .sort((a, b) => a.lineName.localeCompare(b.lineName, "ko"));

  const total = buildSummary("포장1라인 전체", filtered);
  return { total, groups };
}

function buildSummary(lineName: string, items: PaintPlanRow[]): LineGroupSummary {
  const totalPlanQty = items.reduce((s, r) => s + r.planQty, 0);
  const totalPlanMinutes = items.reduce((s, r) => s + r.planMinutes, 0);
  const inputQty = items.reduce((s, r) => s + r.inputQty, 0);
  const prodQty = items.reduce((s, r) => s + r.prodQty, 0);
  return {
    lineName,
    itemCount: items.length,
    totalPlanQty,
    totalPlanMinutes,
    totalPlanHours: Math.round((totalPlanMinutes / 60) * 10) / 10,
    inputQty,
    prodQty,
    rows: items,
  };
}
