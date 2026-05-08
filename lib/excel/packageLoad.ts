import type { PackageLoadRow } from "@/lib/types";
import { clean, loadWorkbook, sheetToAOA, toFloat } from "./helpers";

// 시트: 첫 번째 시트 (보통 Sheet1)
// 컬럼: A=번호, B=생산처, C=라인, D=빈, E=이월계획량, F=이월계획시간, G=당일 계획량, H=당일 계획시간
// 합계 행("Sub Total" 등)은 무시
export async function parsePackageLoad(file: File): Promise<PackageLoadRow[]> {
  const wb = await loadWorkbook(file);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = sheetToAOA(sheet);

  const result: PackageLoadRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = clean(r[2]);
    const source = clean(r[1]);
    // 라인이 없으면 (빈 행, 또는 Sub Total 행 등) 스킵
    if (!line) continue;
    // "Sub Total"같은 합계 행 제외 (B열에 "Sub Total" 또는 "합계" 등이 들어옴)
    if (/sub\s*total|합계/i.test(source)) continue;

    result.push({
      no: clean(r[0]),
      source,
      line,
      carryQty: toFloat(r[4]),
      carryHours: toFloat(r[5]),
      todayQty: toFloat(r[6]),
      todayHours: toFloat(r[7]),
    });
  }
  return result;
}
