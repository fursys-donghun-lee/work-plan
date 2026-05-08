import type { LineBaseHeadcount } from "@/lib/types";
import { clean, loadWorkbook, sheetToAOA, toFloat } from "./helpers";

// 시트: 첫 번째 시트 (보통 Sheet1)
// 컬럼: A=라인명, B=인원
export async function parseLineBase(file: File): Promise<LineBaseHeadcount[]> {
  const wb = await loadWorkbook(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToAOA(sheet);

  const result: LineBaseHeadcount[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const line = clean(r[0]);
    if (!line) continue;
    result.push({ line, headcount: toFloat(r[1]) });
  }
  return result;
}
