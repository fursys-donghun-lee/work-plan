import * as XLSX from "xlsx";

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function loadWorkbook(file: File): Promise<XLSX.WorkBook> {
  const buf = await readFileAsArrayBuffer(file);
  return XLSX.read(buf, { type: "array", cellDates: false });
}

export function pickSheet(
  wb: XLSX.WorkBook,
  preferredName: string | string[]
): XLSX.WorkSheet {
  const candidates = Array.isArray(preferredName) ? preferredName : [preferredName];
  for (const name of candidates) {
    if (wb.SheetNames.includes(name)) return wb.Sheets[name];
  }
  // Fallback to first sheet
  return wb.Sheets[wb.SheetNames[0]];
}

export function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function toFloat(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value).trim().replace(/,/g, "");
  if (!text || ["#NAME?", "#VALUE!", "#N/A", "-", "—"].includes(text)) return 0;
  const num = Number(text);
  if (!Number.isNaN(num)) return num;
  const m = text.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

// Remove (지원) suffix and trim
export function normalizeName(value: unknown): string {
  return clean(value)
    .replace(/\s*\(\s*지원\s*\)\s*/g, "")
    .trim();
}

// Convert sheet to AOA (array of arrays). Default cells empty string.
export function sheetToAOA(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
}

// Forward-fill values down a column when cell is blank.
// Used for 설비기준 A/B/C columns which are merged per group.
export function forwardFill(
  rows: unknown[][],
  colIndices: number[]
): unknown[][] {
  const last: Record<number, unknown> = {};
  return rows.map((row) => {
    const r = [...row];
    for (const c of colIndices) {
      const v = r[c];
      if (v === null || v === undefined || v === "") {
        if (last[c] !== undefined) r[c] = last[c];
      } else {
        last[c] = v;
      }
    }
    return r;
  });
}
