import type {
  AttendanceRecord,
  Employee,
  LineBaseHeadcount,
  Package2Group,
  Package2GroupLoad,
  PackageLoadRow,
  PackagePosition,
  PackageWorkerOverrides,
} from "@/lib/types";
import { PACKAGE2_FEEDER_WORKERS, PACKAGE2_GROUPS } from "@/lib/types";
import { buildPresentEmpCodes } from "./groupLoad";

const OVERTIME_HOURS_PER_PERSON = 3;
const SUPPORT_HOURS_PER_PERSON = 8;
const STANDARD_WORK_HOURS = 8;

interface Args {
  packagePosition: PackagePosition[];
  packageLoad: PackageLoadRow[];
  attendance: AttendanceRecord[];
  overrides: PackageWorkerOverrides;
  employees?: Employee[];
  supportPlacements?: string[];
  totalSupportCount?: number;
  lineBase?: LineBaseHeadcount[];
}

export interface Package2LoadResult {
  groups: Package2GroupLoad[];
  unassignedMembers: PackagePosition[];
  unmatchedGroups: { line: string; todayHours: number; todayQty: number }[];
}

export function computePackage2Load(args: Args): Package2LoadResult {
  const {
    packagePosition,
    packageLoad,
    attendance,
    overrides,
    employees,
    supportPlacements = [],
    totalSupportCount = 0,
    lineBase = [],
  } = args;
  const presentCodes = buildPresentEmpCodes(attendance, employees);

  // 라인별 인원수 맵 (없으면 1배)
  const headcountMap = new Map<string, number>();
  for (const lb of lineBase) {
    if (lb.line) headcountMap.set(lb.line, lb.headcount);
  }

  // 그룹별 받은 지원인원 수
  const supportCountByGroup = new Map<string, number>();
  const slots = supportPlacements.slice(0, totalSupportCount);
  for (const placedGroup of slots) {
    if (!placedGroup) continue;
    supportCountByGroup.set(
      placedGroup,
      (supportCountByGroup.get(placedGroup) ?? 0) + 1
    );
  }

  // 1) 포장2라인 직원만 추리기 (D열 = "포장2라인")
  const workers = packagePosition.filter((p) => p.category === "포장2라인");

  // 2) 그룹별 인원 배치
  const groupMembers = new Map<Package2Group, PackagePosition[]>();
  for (const g of PACKAGE2_GROUPS) {
    groupMembers.set(g as Package2Group, []);
  }
  const unassignedMembers: PackagePosition[] = [];

  const feederSet = new Set(PACKAGE2_FEEDER_WORKERS);

  for (const w of workers) {
    const overridden = overrides[w.empCode];
    // 사용자 override 가 있으면 그게 1순위
    if (overridden && (PACKAGE2_GROUPS as readonly string[]).includes(overridden)) {
      groupMembers.get(overridden as Package2Group)!.push(w);
      continue;
    }
    // 지정된 작업자는 자동으로 피더 그룹에 배치 (간접인원)
    if (feederSet.has(w.name)) {
      groupMembers.get("피더" as Package2Group)!.push(w);
      continue;
    }
    // 그 외에는 기본근무위치 그대로
    const target = w.position;
    if ((PACKAGE2_GROUPS as readonly string[]).includes(target)) {
      groupMembers.get(target as Package2Group)!.push(w);
    } else {
      unassignedMembers.push(w);
    }
  }

  // 3) 그룹별 부하 (라인별 포장 부하 line 매칭, 이월+당일 합산)
  // 부하시간(인시) = (이월 + 당일 계획시간) × 라인 기준인원
  const loadByLine = new Map<string, { hours: number; qty: number }>();
  for (const r of packageLoad) {
    if (!r.line) continue;
    const headcount = headcountMap.get(r.line) ?? 1;
    const cur = loadByLine.get(r.line) ?? { hours: 0, qty: 0 };
    cur.hours += (r.todayHours + r.carryHours) * headcount;
    cur.qty += r.todayQty + r.carryQty;
    loadByLine.set(r.line, cur);
  }

  const unmatchedGroups: { line: string; todayHours: number; todayQty: number }[] = [];
  for (const [line, info] of loadByLine.entries()) {
    if (!(PACKAGE2_GROUPS as readonly string[]).includes(line) && info.hours > 0) {
      unmatchedGroups.push({ line, todayHours: round1(info.hours), todayQty: info.qty });
    }
  }

  // 4) 그룹별 결과 계산
  const groups: Package2GroupLoad[] = PACKAGE2_GROUPS.map((g) => {
    const members = groupMembers.get(g as Package2Group) ?? [];
    const presentMembers = members.filter((m) => presentCodes.has(m.empCode));
    const absentMembers = members.filter((m) => !presentCodes.has(m.empCode));
    const loadInfo = loadByLine.get(g) ?? { hours: 0, qty: 0 };
    const loadHours = round1(loadInfo.hours);
    const todayQty = loadInfo.qty;
    const supportCount = supportCountByGroup.get(g) ?? 0;
    const presentCount = presentMembers.length;
    const effectivePeople = presentCount + supportCount;
    const availableHours = effectivePeople * STANDARD_WORK_HOURS;
    const diffHours = round1(availableHours - loadHours);
    const shortageHours = diffHours < 0 ? Math.abs(diffHours) : 0;
    // 잔업 한도: 그룹 출근자 수 (받은 지원 제외)
    const overtimePeople =
      shortageHours > 0
        ? Math.min(Math.ceil(shortageHours / OVERTIME_HOURS_PER_PERSON), presentCount)
        : 0;
    const overtimeCovered = overtimePeople * OVERTIME_HOURS_PER_PERSON;
    const remaining = Math.max(0, round1(shortageHours - overtimeCovered));
    const supportNeededPeople =
      remaining > 0 ? Math.ceil(remaining / SUPPORT_HOURS_PER_PERSON) : 0;
    const supportablePeople =
      diffHours > 0 ? Math.min(Math.floor(diffHours / 8), presentCount) : 0;

    return {
      group: g as Package2Group,
      members,
      presentMembers,
      absentMembers,
      loadHours,
      todayQty,
      availableHours,
      diffHours,
      overtimePeople,
      supportNeededPeople,
      supportablePeople,
      supportCount,
    };
  });

  return {
    groups,
    unassignedMembers,
    unmatchedGroups: unmatchedGroups.sort((a, b) => b.todayHours - a.todayHours),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
