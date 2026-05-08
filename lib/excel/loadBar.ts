import type { LoadBarInfo } from "@/lib/types";
import { clean, loadWorkbook, pickSheet, sheetToAOA, toFloat } from "./helpers";

// 시트: "로드바 정보"
// 컬럼: A=조합, B=ITEMCD, C=ITEMCOL, D=로드바당품목수
export async function parseLoadBar(file: File): Promise<LoadBarInfo[]> {
  const wb = await loadWorkbook(file);
  const sheet = pickSheet(wb, "로드바 정보");
  const rows = sheetToAOA(sheet);

  const result: LoadBarInfo[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const combo = clean(r[0]);
    if (!combo) continue;
    result.push({
      combo,
      itemCd: clean(r[1]),
      itemCol: clean(r[2]),
      qtyPerBar: toFloat(r[3]),
    });
  }
  return result;
}
