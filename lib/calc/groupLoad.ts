import type {
  AttendanceRecord,
  Employee,
  EquipmentLoadRow,
  GroupLoadRow,
  WorkGroup,
} from "@/lib/types";

interface Args {
  workGroups: WorkGroup[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  equipmentLoad: EquipmentLoadRow[];
}

// 출근한 사원코드 집합 (사원코드 기반 매칭)
// employees가 같이 넘어오면 부서명에 "퍼시스"가 포함된 직원은 자동 출근 처리.
export function buildPresentEmpCodes(
  attendance: AttendanceRecord[],
  employees?: Employee[]
): Set<string> {
  const set = new Set<string>();
  for (const a of attendance) {
    if (a.isPresent && a.empCode) set.add(a.empCode);
  }
  if (employees) {
    for (const e of employees) {
      if (e.department.includes("퍼시스") && e.empCode) {
        set.add(e.empCode);
      }
    }
  }
  return set;
}

// 이름 → 사원코드 매핑 (근무기준 기준)
export function buildNameToEmpCode(employees: Employee[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of employees) {
    if (e.name && e.empCode) {
      // 동명이인 시 첫 번째만 유지 (스펙: 사원코드로 식별이 원칙)
      if (!map.has(e.name)) map.set(e.name, e.empCode);
    }
  }
  return map;
}

export function computeGroupLoad(args: Args): GroupLoadRow[] {
  const { workGroups, employees, attendance, equipmentLoad } = args;
  const presentCodes = buildPresentEmpCodes(attendance, employees);
  const nameToCode = buildNameToEmpCode(employees);

  return workGroups.map((g) => {
    const presentWorkers: string[] = [];
    const absentWorkers: string[] = [];
    for (const name of g.workers) {
      const code = nameToCode.get(name);
      const present = code ? presentCodes.has(code) : false;
      if (present) presentWorkers.push(name);
      else absentWorkers.push(name);
    }

    const totalLoad = round1(
      equipmentLoad
        .filter((r) => r.groupName === g.name)
        .reduce((sum, r) => sum + r.appliedHours, 0)
    );

    const availableHours = presentWorkers.length * 8;
    const diffHours = round1(availableHours - totalLoad);

    // 잔업필요인원: 반올림(부족시간 / 3) — 단, 출근작업자 수를 초과할 수 없음
    const overtimePeople =
      diffHours < 0
        ? Math.min(
            Math.round(Math.abs(diffHours) / 3),
            presentWorkers.length
          )
        : 0;

    // 시간기준 지원가능인원 = 내림(여유시간 / 8)
    const supportByTime = diffHours > 0 ? Math.floor(diffHours / 8) : 0;
    // 남는인원 기준 지원가능인원 = 출근인원 - 최소인원
    const surplus = Math.max(presentWorkers.length - g.minPeople, 0);
    // 둘 중 작은 값, 음수면 0
    const supportablePeople = Math.max(0, Math.min(supportByTime, surplus));

    let judgement: GroupLoadRow["judgement"] = "정상";
    if (diffHours < 0) judgement = "잔업필요";
    else if (supportablePeople > 0) judgement = "지원가능";

    return {
      group: g.name,
      workers: g.workers,
      presentWorkers,
      absentWorkers,
      totalLoadHours: totalLoad,
      availableHours,
      diffHours,
      judgement,
      minPeople: g.minPeople,
      overtimePeople,
      supportablePeople,
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
