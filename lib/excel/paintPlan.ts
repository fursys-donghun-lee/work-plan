import type { PaintPlanRow } from "@/lib/types";
import { clean, loadWorkbook, sheetToAOA, toFloat } from "./helpers";

// 0430 도장계획.xls 형식 (Sheet1, 헤더 1행, 데이터 2행~)
// 핵심 컬럼:
//  O(14)=계획량, S(18)=생산계획시간(분),
//  AJ(35)=작업설비(#도장 1·2라인), AZ(51)=포장라인(포장1(CR1) 등)
export async function parsePaintPlan(file: File): Promise<PaintPlanRow[]> {
  const wb = await loadWorkbook(file);
  // 시트가 보통 "Sheet1"이지만 다른 이름일 수도 있어 첫 번째 시트도 fallback
  const sheetName = wb.SheetNames.find((n) => n === "Sheet1") ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = sheetToAOA(sheet);

  const result: PaintPlanRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const cardNo = clean(r[5]);
    const partCode = clean(r[11]);
    if (!cardNo && !partCode) continue;

    result.push({
      no: clean(r[0]),
      shiftPaint: clean(r[2]),
      available: clean(r[3]),
      priority: toFloat(r[4]),
      cardNo,
      inputType: clean(r[7]),
      inputDate: clean(r[8]),
      partCode,
      partColor: clean(r[12]),
      partName: clean(r[13]),
      planQty: toFloat(r[14]),
      inputQty: toFloat(r[15]),
      prodQty: toFloat(r[16]),
      defectQty: toFloat(r[17]),
      planMinutes: toFloat(r[18]),
      manager: clean(r[29]),
      ticketNo: clean(r[30]),
      paintLine: clean(r[35]),
      productCode: clean(r[39]),
      productName: clean(r[41]),
      currentProcess: clean(r[45]),
      workStatus: clean(r[46]),
      packageLine: clean(r[51]),
    });
  }
  return result;
}
