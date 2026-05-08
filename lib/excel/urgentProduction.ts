import type { UrgentProductionRow } from "@/lib/types";
import {
  clean,
  forwardFill,
  loadWorkbook,
  sheetToAOA,
  toFloat,
} from "./helpers";

// 긴급생산리스트 파서
// 컬럼: A=번호, B=상태, C=출고일, D=단품코드, E=색상, F=포장계획일,
//       G=포장라인, H=계획량, I=출고수량, J=최초포장일, K=자재코드, L=자재색상
// C열(출고일) 공백은 위 행에서 forward-fill (위→아래만, 아래→위 금지).
// 헤더 행은 1행이라고 가정. "Total"/"반제품" 같은 비날짜 행은 제외.
// G열(포장라인)이 비어있는 자재 sub-row는 카운트 대상 아님 (제외).
export async function parseUrgentProduction(
  file: File
): Promise<UrgentProductionRow[]> {
  const wb = await loadWorkbook(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToAOA(sheet);

  // 1행은 헤더로 가정 → 데이터는 2행부터
  const dataRows = rows.slice(1);

  // C열(index 2)만 위→아래로 forward-fill
  const filled = forwardFill(dataRows, [2]);

  const result: UrgentProductionRow[] = [];
  for (const r of filled) {
    const packageLine = clean(r[6]);
    if (!packageLine) continue; // 자재 sub-row 제외

    const productCode = clean(r[3]);
    if (!productCode) continue; // 빈 행 제외

    const shipDate = normalizeDate(r[2]);
    if (!shipDate) continue; // "Total"/"반제품" 등 비날짜 제외

    result.push({
      no: clean(r[0]),
      shipDate,
      productCode,
      color: clean(r[4]),
      packagePlanDate: normalizeDate(r[5]) || clean(r[5]),
      packageLine,
      planQty: toFloat(r[7]),
      shipQty: toFloat(r[8]),
    });
  }
  return result;
}

// 엑셀 셀 값을 YYYY-MM-DD 로 정규화. 날짜로 인식 안 되면 빈 문자열 반환.
function normalizeDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim();
  if (!text) return "";

  // 이미 YYYY-MM-DD 또는 YYYY-M-D 형식
  const m1 = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m1) {
    const [, y, mo, d] = m1;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY/MM/DD 또는 YYYY.MM.DD 등
  const m2 = text.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (m2) {
    const [, y, mo, d] = m2;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 엑셀 날짜 시리얼 (숫자)
  if (typeof value === "number" && Number.isFinite(value) && value > 25569) {
    // Excel epoch: 1899-12-30 (1 = 1900-01-01)
    const ms = (value - 25569) * 86400 * 1000;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      return `${y}-${mo}-${d}`;
    }
  }

  return "";
}
