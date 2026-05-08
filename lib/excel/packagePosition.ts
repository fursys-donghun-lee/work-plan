import type { PackagePosition } from "@/lib/types";
import { clean, loadWorkbook, sheetToAOA } from "./helpers";

// 시트: 첫 번째 시트 (보통 Sheet1)
// 컬럼: A=사원코드, B=사원명, C=부서명, D=구분, E=기본근무위치, F=이동여부
export async function parsePackagePosition(file: File): Promise<PackagePosition[]> {
  const wb = await loadWorkbook(file);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = sheetToAOA(sheet);

  const result: PackagePosition[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const empCode = clean(r[0]);
    const name = clean(r[1]);
    if (!empCode && !name) continue;
    result.push({
      empCode,
      name,
      department: clean(r[2]),
      category: clean(r[3]),
      position: clean(r[4]),
      movement: clean(r[5]),
    });
  }
  return result;
}
