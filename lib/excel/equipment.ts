import type { Equipment } from "@/lib/types";
import {
  clean,
  forwardFill,
  loadWorkbook,
  normalizeName,
  pickSheet,
  sheetToAOA,
  toFloat,
} from "./helpers";

export async function parseEquipment(file: File): Promise<Equipment[]> {
  const wb = await loadWorkbook(file);
  const sheet = pickSheet(wb, "설비");
  const rows = sheetToAOA(sheet);

  // A/B/C 열은 작업그룹 단위로 병합되어 있어 forward-fill 필요
  const filled = forwardFill(rows, [0, 1, 2]);

  const result: Equipment[] = [];
  // 헤더 1행, 데이터 2행~
  for (let i = 1; i < filled.length; i++) {
    const r = filled[i];
    const equipmentName = clean(r[3]);
    if (!equipmentName) continue;

    const workersRaw = clean(r[2]);
    const workers = workersRaw
      .split(/[\n,;/]+/)
      .map(normalizeName)
      .filter((w) => w);

    result.push({
      groupName: clean(r[0]),
      basePeople: toFloat(r[1]),
      workersRaw,
      workers,
      equipmentName,
      affiliation: clean(r[4]),
      capa8h: toFloat(r[5]),
      capaOvertime: toFloat(r[6]),
    });
  }
  return result;
}
