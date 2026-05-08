import type { Employee } from "@/lib/types";
import { clean, loadWorkbook, pickSheet, sheetToAOA } from "./helpers";

export async function parseWorkStandard(file: File): Promise<Employee[]> {
  const wb = await loadWorkbook(file);
  const sheet = pickSheet(wb, "인원");
  const rows = sheetToAOA(sheet);

  const result: Employee[] = [];
  // 헤더 1행, 데이터 2행~
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const empCode = clean(r[0]);
    const name = clean(r[1]);
    if (!empCode && !name) continue;

    result.push({
      empCode,
      name,
      department: clean(r[2]),
      workType: clean(r[3]),
      position: clean(r[4]),
      payType: clean(r[5]),
      category: clean(r[6]) || "미지정",
      baseLocation: clean(r[7]),
      remark: clean(r[8]),
    });
  }
  return result;
}
