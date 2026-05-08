import type { UrgentProductionRow } from "@/lib/types";

export interface UrgentGroupCount {
  dMinus1: number; // 출고일 < 근무일자 (이미 출고일이 지난, 더 급함)
  dMinus2: number; // 출고일 == 근무일자 (오늘 출고)
}

// "2026.05.08", "2026-05-08", "2026/5/8" 등 → "2026-05-08" 로 통일.
// 변환 실패 시 빈 문자열 반환.
function normalizeDate(raw: string): string {
  if (!raw) return "";
  const text = raw.trim();
  const m = text.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 그룹(포장라인 G열)별 D-1 / D-2 긴급건 카운트
// - 출고일 < 근무일자 → D-1
// - 출고일 == 근무일자 → D-2
// - 출고일 > 근무일자 → 미래건 (제외)
// - 빈 근무일자 → 모두 제외
export function computeUrgentByGroup(
  urgent: UrgentProductionRow[],
  workDate: string
): Map<string, UrgentGroupCount> {
  const map = new Map<string, UrgentGroupCount>();
  const wd = normalizeDate(workDate);
  if (!wd) return map;

  for (const row of urgent) {
    const key = row.packageLine;
    if (!key) continue;
    const sd = normalizeDate(row.shipDate);
    if (!sd) continue;
    if (!map.has(key)) map.set(key, { dMinus1: 0, dMinus2: 0 });
    const cur = map.get(key)!;
    if (sd < wd) cur.dMinus1 += 1;
    else if (sd === wd) cur.dMinus2 += 1;
  }
  return map;
}

// 헬퍼: 특정 그룹의 카운트 (없으면 0)
export function getUrgentFor(
  map: Map<string, UrgentGroupCount>,
  group: string
): UrgentGroupCount {
  return map.get(group) ?? { dMinus1: 0, dMinus2: 0 };
}
