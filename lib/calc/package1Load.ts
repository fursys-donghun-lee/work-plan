import type {
  AttendanceRecord,
  Employee,
  LineBaseHeadcount,
  Package1Group,
  Package1GroupLoad,
  PackageLoadRow,
  PackagePosition,
  PackageWorkerOverrides,
} from "@/lib/types";
import { PACKAGE1_GROUPS } from "@/lib/types";
import { buildPresentEmpCodes } from "./groupLoad";

const OVERTIME_HOURS_PER_PERSON = 3;
const SUPPORT_HOURS_PER_PERSON = 8;
const STANDARD_WORK_HOURS = 8;

interface Args {
  packagePosition: PackagePosition[];
  packageLoad: PackageLoadRow[];
  attendance: AttendanceRecord[];
  overrides: PackageWorkerOverrides;
  // 부서명 "퍼시스" 자동 출근 처리용 (옵셔널)
  employees?: Employee[];
  // 다른 라인에서 받은 지원인원의 그룹 배치 (인덱스 기반, "" = 미배치)
  supportPlacements?: string[];
  // 실제로 인식해야 하는 슬롯 수 (받은 confirmed 합)
  totalSupportCount?: number;
  // 라인 기준인원: 부하시간 × 인원 으로 환산
  lineBase?: LineBaseHeadcount[];
}

export interface Package1LoadResult {
  groups: Package1GroupLoad[];
  unassignedMembers: PackagePosition[]; // 그룹 매핑 안 되는 직원
  unmatchedGroups: { line: string; todayHours: number; todayQty: number }[]; // 부하는 있으나 그룹 정의에 없는 라인
}

export function computePackage1Load(args: Args): Package1LoadResult {
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

  // 그룹별 지원인원 수 계산 (placements 슬롯 중 totalSupportCount까지만 인정)
  const supportCountByGroup = new Map<string, number>();
  const slots = supportPlacements.slice(0, totalSupportCount);
  for (const placedGroup of slots) {
    if (!placedGroup) continue;
    supportCountByGroup.set(
      placedGroup,
      (supportCountByGroup.get(placedGroup) ?? 0) + 1
    );
  }

  // 1) 포장1라인 직원 추리기 (D열 = "포장1라인")
  const workers = packagePosition.filter((p) => p.category === "포장1라인");

  // 2) 그룹별 인원 배치 (overrides 우선, 없으면 기본근무위치)
  const groupMembers = new Map<Package1Group, PackagePosition[]>();
  for (const g of PACKAGE1_GROUPS) {
    groupMembers.set(g as Package1Group, []);
  }
  const unassignedMembers: PackagePosition[] = [];

  for (const w of workers) {
    const overridden = overrides[w.empCode];
    const target = overridden ?? w.position;
    if ((PACKAGE1_GROUPS as readonly string[]).includes(target)) {
      groupMembers.get(target as Package1Group)!.push(w);
    } else {
      unassignedMembers.push(w);
    }
  }

  // 3) 그룹별 부하 (라인별 포장 부하 line 매칭)
  // 부하시간(인시) = (당일 계획시간 H + 이월 계획시간 F) × 라인 기준인원
  //   - 라인 기준인원에 라인이 없으면 1배 (원본 그대로)
  // 계획수량 = 당일 계획량(G열) + 이월 계획량(E열)
  const loadByLine = new Map<string, { hours: number; qty: number }>();
  for (const r of packageLoad) {
    if (!r.line) continue;
    const headcount = headcountMap.get(r.line) ?? 1;
    const cur = loadByLine.get(r.line) ?? { hours: 0, qty: 0 };
    cur.hours += (r.todayHours + r.carryHours) * headcount;
    cur.qty += r.todayQty + r.carryQty;
    loadByLine.set(r.line, cur);
  }

  // 그룹 정의에 없는 라인은 unmatched로
  const unmatchedGroups: { line: string; todayHours: number; todayQty: number }[] = [];
  for (const [line, info] of loadByLine.entries()) {
    if (!(PACKAGE1_GROUPS as readonly string[]).includes(line) && info.hours > 0) {
      unmatchedGroups.push({ line, todayHours: round1(info.hours), todayQty: info.qty });
    }
  }

  // 4) 그룹별 결과 계산
  const groups: Package1GroupLoad[] = PACKAGE1_GROUPS.map((g) => {
    const members = groupMembers.get(g as Package1Group) ?? [];
    const presentMembers = members.filter((m) => presentCodes.has(m.empCode));
    const absentMembers = members.filter((m) => !presentCodes.has(m.empCode));
    const loadInfo = loadByLine.get(g) ?? { hours: 0, qty: 0 };
    const loadHours = round1(loadInfo.hours);
    const todayQty = loadInfo.qty;
    const supportCount = supportCountByGroup.get(g) ?? 0;
    const presentCount = presentMembers.length;
    const effectivePeople = presentCount + supportCount;
    // 가용시간 = (직접 출근 + 받은 지원) × 8
    const availableHours = effectivePeople * STANDARD_WORK_HOURS;
    const diffHours = round1(availableHours - loadHours);
    const shortageHours = diffHours < 0 ? Math.abs(diffHours) : 0;

    // 잔업 우선 → 잔여만 지원. 잔업 가능 인원은 출근작업자 수까지로 제한.
    const overtimePeople =
      shortageHours > 0
        ? Math.min(Math.ceil(shortageHours / OVERTIME_HOURS_PER_PERSON), presentCount)
        : 0;
    const overtimeCovered = overtimePeople * OVERTIME_HOURS_PER_PERSON;
    const remaining = Math.max(0, round1(shortageHours - overtimeCovered));
    const supportNeededPeople =
      remaining > 0 ? Math.ceil(remaining / SUPPORT_HOURS_PER_PERSON) : 0;
    // 지원가능: 본인 직원에서만 보낼 수 있도록 presentCount 한도
    const supportablePeople =
      diffHours > 0 ? Math.min(Math.floor(diffHours / 8), presentCount) : 0;

    return {
      group: g as Package1Group,
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
