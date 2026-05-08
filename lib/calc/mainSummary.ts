import type {
  AttendanceRecord,
  Employee,
  GroupLoadRow,
  LineSummary,
  MainLine,
  SupportAssignment,
} from "@/lib/types";
import { MAIN_LINES, SUPPORT_LINES } from "@/lib/types";
import { buildPresentEmpCodes } from "./groupLoad";

// 우성산업 직원 식별 (부서명에 "우성산업" 포함)
function isWoosung(employee: Employee): boolean {
  return employee.department.includes("우성산업");
}

// 메인페이지 소속 7개로 매핑
// 근무기준 G열(category) 값을 바로 사용. 단, 매핑 외 값이면 null
function categoryToMainLine(category: string): MainLine | null {
  if (MAIN_LINES.includes(category as MainLine)) return category as MainLine;
  return null;
}

interface Args {
  employees: Employee[];
  attendance: AttendanceRecord[];
  groupLoad: GroupLoadRow[];
  supportAssignments: SupportAssignment[];
  indirectOvertimePeople: number; // 간접인원(김진규) 잔업
}

export function computeLineSummaries(args: Args): LineSummary[] {
  const { employees, attendance, groupLoad, supportAssignments } = args;
  const presentCodes = buildPresentEmpCodes(attendance, employees);

  // 라인별 base / present / absent 집계 (우성산업만)
  const stats = new Map<MainLine, { base: number; present: number; absentNames: string[] }>();
  for (const line of MAIN_LINES) {
    stats.set(line, { base: 0, present: 0, absentNames: [] });
  }

  for (const emp of employees) {
    if (!isWoosung(emp)) continue;
    const line = categoryToMainLine(emp.category);
    if (!line) continue;

    const s = stats.get(line)!;
    s.base += 1;
    if (presentCodes.has(emp.empCode)) {
      s.present += 1;
    } else {
      s.absentNames.push(emp.name);
    }
  }

  // 지원받은 인원 (4개 라인별 합계)
  const receivedByLine = new Map<MainLine, number>();
  for (const line of SUPPORT_LINES) {
    if (line) receivedByLine.set(line as MainLine, 0);
  }
  let sentFromProcessing = 0;
  for (const sa of supportAssignments) {
    if (!sa.targetLine) continue;
    const target = sa.targetLine as MainLine;
    if (!receivedByLine.has(target)) continue;
    // 확정 인원 = 그룹의 supportablePeople와 selectedCount의 MIN
    const groupRow = groupLoad.find((g) => g.group === sa.group);
    const confirmed = groupRow
      ? Math.max(0, Math.min(groupRow.supportablePeople, sa.selectedCount))
      : 0;
    receivedByLine.set(target, (receivedByLine.get(target) ?? 0) + confirmed);
    sentFromProcessing += confirmed;
  }

  // 가공라인 잔업/지원가능 합계 = 모든 작업그룹 + 간접인원
  const totalGroupOvertime =
    groupLoad.reduce((sum, g) => sum + g.overtimePeople, 0) +
    args.indirectOvertimePeople;
  const totalGroupSupportable = groupLoad.reduce(
    (sum, g) => sum + g.supportablePeople,
    0
  );

  return MAIN_LINES.map<LineSummary>((line) => {
    const s = stats.get(line)!;
    const received = receivedByLine.get(line) ?? 0;
    const sent = line === "가공라인" ? sentFromProcessing : 0;
    const overtimePeople = line === "가공라인" ? totalGroupOvertime : 0;
    const supportablePeople = line === "가공라인" ? totalGroupSupportable : 0;

    return {
      lineName: line,
      baseCount: s.base,
      attendanceCount: s.present,
      absentCount: s.base - s.present,
      absentNames: s.absentNames,
      overtimePeople,
      supportablePeople,
      receivedSupportCount: received,
      sentSupportCount: sent,
      finalAvailableCount: s.present + received - sent,
    };
  });
}

// 간접인원(김진규) 잔업 처리: 작업그룹 잔업필요인원 합계 > 0 AND 김진규 출근 시 1
export function computeIndirectOvertime(
  groupLoad: GroupLoadRow[],
  attendance: AttendanceRecord[],
  employees: Employee[],
  indirectName: string
): { overtimePeople: number; isPresent: boolean } {
  const totalOvertime = groupLoad.reduce((sum, g) => sum + g.overtimePeople, 0);
  if (totalOvertime <= 0) return { overtimePeople: 0, isPresent: false };

  const emp = employees.find((e) => e.name === indirectName);
  if (!emp) return { overtimePeople: 0, isPresent: false };

  const presentCodes = buildPresentEmpCodes(attendance, employees);
  const present = presentCodes.has(emp.empCode);
  return { overtimePeople: present ? 1 : 0, isPresent: present };
}
