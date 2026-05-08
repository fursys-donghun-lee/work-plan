import type { LoadPlanRow } from "@/lib/types";
import { clean, loadWorkbook, pickSheet, sheetToAOA, toFloat } from "./helpers";

export async function parseLoadPlan(file: File): Promise<LoadPlanRow[]> {
  const wb = await loadWorkbook(file);
  const sheet = pickSheet(wb, "라인별 부하 공정");
  const rows = sheetToAOA(sheet);

  const result: LoadPlanRow[] = [];
  // 헤더 2행 (1·2행), 데이터 3행~ (인덱스 2~)
  // G열(인덱스 6) = 당일 계획량 (사용자 확정: G열은 항상 당일)
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const equipmentName = clean(r[3]);
    if (!equipmentName) continue;

    result.push({
      no: clean(r[0]),
      source: clean(r[1]),
      process: clean(r[2]),
      equipmentName,
      carryQty: toFloat(r[4]),
      carryHours: toFloat(r[5]),
      todayQty: toFloat(r[6]),
      todayHours: toFloat(r[7]),
    });
  }
  return result;
}
