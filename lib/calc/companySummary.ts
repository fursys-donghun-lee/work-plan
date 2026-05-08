import type { AttendanceRecord, Company, Employee } from "@/lib/types";
import { buildPresentEmpCodes } from "./groupLoad";

export interface CategorySummary {
  category: string;       // 소속 (구분 G열 값)
  baseCount: number;
  attendanceCount: number;
  absentCount: number;
  absentNames: string[];
}

// 회사명으로 직원 필터 (부서명에 회사명 포함)
function isCompanyEmployee(employee: Employee, company: Company): boolean {
  return employee.department.includes(company);
}

// 사장님/사무업무대행 우선 정렬, 그 외는 등록 순
function sortCategories(categories: string[]): string[] {
  const priority = (cat: string): number => {
    if (cat.endsWith("사장님")) return 0;
    if (cat === "사무업무대행") return 1;
    return 2;
  };
  return [...categories].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b, "ko");
  });
}

export function computeCompanySummary(
  employees: Employee[],
  attendance: AttendanceRecord[],
  company: Company
): CategorySummary[] {
  const presentCodes = buildPresentEmpCodes(attendance, employees);
  const filtered = employees.filter((e) => isCompanyEmployee(e, company));

  const grouped = new Map<string, { base: number; present: number; absentNames: string[] }>();
  for (const e of filtered) {
    const cat = e.category || "미지정";
    if (!grouped.has(cat)) {
      grouped.set(cat, { base: 0, present: 0, absentNames: [] });
    }
    const g = grouped.get(cat)!;
    g.base += 1;
    if (presentCodes.has(e.empCode)) g.present += 1;
    else g.absentNames.push(e.name);
  }

  const sortedCats = sortCategories([...grouped.keys()]);
  return sortedCats.map((cat) => {
    const s = grouped.get(cat)!;
    return {
      category: cat,
      baseCount: s.base,
      attendanceCount: s.present,
      absentCount: s.base - s.present,
      absentNames: s.absentNames,
    };
  });
}
