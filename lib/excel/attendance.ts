import type { AttendanceRecord } from "@/lib/types";
import { clean, loadWorkbook, pickSheet, sheetToAOA } from "./helpers";

// 출근시간이 입력되어 있으면 무조건 출근으로 판단
function isPresent(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") {
    // 엑셀 decimal 시간 (0~1)
    return Number.isFinite(value) && value >= 0 && value < 1;
  }
  const text = String(value).trim();
  if (!text) return false;
  // HH:MM 형식
  if (/^\d{1,2}:\d{2}/.test(text)) return true;
  const num = Number(text);
  return !Number.isNaN(num) && num >= 0 && num < 1;
}

export async function parseAttendance(file: File): Promise<{
  records: AttendanceRecord[];
  workDate: string;
}> {
  const wb = await loadWorkbook(file);
  const sheet = pickSheet(wb, ["a", "근태", "Sheet1"]);
  const rows = sheetToAOA(sheet);

  const records: AttendanceRecord[] = [];
  let workDate = "";

  // 헤더 1행, 데이터 2행~ (3행 간격으로 데이터, 빈 행 무시)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const empCode = clean(r[0]);
    if (!empCode) continue;

    const name = clean(r[1]);
    const dateStr = clean(r[2]);
    if (!workDate && dateStr) workDate = dateStr;

    const startTime = r[3] ?? null;
    records.push({
      empCode,
      name,
      workDate: dateStr,
      startTime: startTime as number | string | null,
      isPresent: isPresent(startTime),
    });
  }

  return { records, workDate };
}
