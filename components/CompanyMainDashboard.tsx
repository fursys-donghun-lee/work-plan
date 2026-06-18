"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { computeCompanySummary } from "@/lib/calc/companySummary";
import { computeDohoPaintLoad } from "@/lib/calc/dohoPaintLoad";
import { computePackage1Load } from "@/lib/calc/package1Load";
import { computePackage2Load } from "@/lib/calc/package2Load";
import { computeAll } from "@/lib/calc";
import { buildPresentEmpCodes } from "@/lib/calc/groupLoad";
import {
  calcConfirmedByGroup,
  getConfirmedFor,
} from "@/lib/calc/supportConfirm";
import { cn } from "@/lib/utils";
import type { Company, SupportAssignment } from "@/lib/types";
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";

// 회사별 설정 (전체 제외 — 메인 페이지에서 "전체" 차단)
type RealCompany = Exclude<Company, "전체">;
const CATEGORY_ORDER: Record<RealCompany, string[]> = {
  우성산업: ["소사장", "가공라인", "사무업무대행"],
  다호산업: ["소사장", "도장1라인", "도장2라인", "포장1라인", "물류", "자재"],
  대림산업: ["소사장", "포장2라인", "포장철물"],
};

// 그 회사가 실제로 받는 라인.
// 라인 이름(targetLine)이 회사간 동일할 수 있어 회사별 명시적으로 분리한다.
//  - 우성: 가공라인이 "보내는" 쪽 → 받는 라인 없음
//  - 다호: 도장1/2 + 포장1 (포장2는 대림 소관)
//  - 대림: 포장2
const COMPANY_RECEIVING_LINES: Record<RealCompany, Set<string>> = {
  우성산업: new Set([]),
  다호산업: new Set(["도장1라인", "도장2라인", "포장1라인"]),
  대림산업: new Set(["포장2라인"]),
};

interface Props {
  company: RealCompany;
}

export function CompanyMainDashboard({ company }: Props) {
  const hydrated = useHydrated();
  const employees = useDataStore((s) => s.employees);
  const equipment = useDataStore((s) => s.equipment);
  const loadPlan = useDataStore((s) => s.loadPlan);
  const loadBar = useDataStore((s) => s.loadBar);
  const paintPlan = useDataStore((s) => s.paintPlan);
  const packagePosition = useDataStore((s) => s.packagePosition);
  const packageLoad = useDataStore((s) => s.packageLoad);
  const attendance = useDataStore((s) => s.attendance);
  const supportAssignments = useDataStore((s) => s.supportAssignments);
  const supportRedirects = useDataStore((s) => s.supportRedirects);
  const overrides = useDataStore((s) => s.packageWorkerOverrides);
  const workDate = useDataStore((s) => s.workDate);
  const workGroups = useDataStore((s) => s.workGroups);
  const lineBase = useDataStore((s) => s.lineBase);
  const overtimeConfirmed = useDataStore((s) => s.overtimeConfirmed);
  // 수동 배치 잔업 인원 — 대림 포장2라인
  const manualPlanOvertimeConfirmed = useDataStore(
    (s) => s.manualPlanOvertimeConfirmed
  );
  const manualPlanFeederOvertimeBasic = useDataStore(
    (s) => s.manualPlanFeederOvertimeBasic
  );
  const manualPlanFeederOvertimeConfirmed = useDataStore(
    (s) => s.manualPlanFeederOvertimeConfirmed
  );
  const manualPlanPCMOvertimeConfirmed = useDataStore(
    (s) => s.manualPlanPCMOvertimeConfirmed
  );
  // 수동 배치 잔업 인원 — 다호 포장1라인
  const dohoPlanOvertimeConfirmed = useDataStore(
    (s) => s.dohoPlanOvertimeConfirmed
  );
  const dohoPlanFeederOvertimeBasic = useDataStore(
    (s) => s.dohoPlanFeederOvertimeBasic
  );
  const dohoPlanFeederOvertimeConfirmed = useDataStore(
    (s) => s.dohoPlanFeederOvertimeConfirmed
  );

  const woosungAll = useMemo(
    () =>
      computeAll({
        employees,
        equipment,
        loadPlan,
        attendance,
        workGroups,
        supportAssignments,
      }),
    [employees, equipment, loadPlan, attendance, workGroups, supportAssignments]
  );

  const dohoLoad = useMemo(
    () =>
      computeDohoPaintLoad({
        paintPlan,
        loadPlan,
        loadBar,
        employees,
        attendance,
        supportAssignments,
        supportRedirects,
      }),
    [paintPlan, loadPlan, loadBar, employees, attendance, supportAssignments, supportRedirects]
  );

  const package1 = useMemo(
    () =>
      computePackage1Load({
        packagePosition,
        packageLoad,
        attendance,
        overrides,
        employees,
        lineBase,
      }),
    [packagePosition, packageLoad, attendance, overrides, employees, lineBase]
  );

  const package2Overrides = useDataStore((s) => s.package2WorkerOverrides);
  const package2 = useMemo(
    () =>
      computePackage2Load({
        packagePosition,
        packageLoad,
        attendance,
        overrides: package2Overrides,
        employees,
        lineBase,
      }),
    [packagePosition, packageLoad, attendance, package2Overrides, employees, lineBase]
  );

  if (!hydrated) return null;

  const missing: string[] = [];
  if (employees.length === 0) missing.push("근무기준");
  if (attendance.length === 0) missing.push("근태");

  if (missing.length > 0) {
    return (
      <EmptyState
        title="데이터를 먼저 업로드해주세요"
        description={`현재 미업로드: ${missing.join(", ")}\n\n${company} 메인 대시보드는 근무기준(기준자료)과 근태(일일자료)가 기본으로 필요합니다.`}
        ctaLabel={missing.includes("근무기준") ? "기준자료 업로드" : "일일자료 업로드"}
        ctaHref={missing.includes("근무기준") ? "/master-data" : "/upload"}
      />
    );
  }

  // 1) 회사별 직원 카테고리 집계 + 정렬
  const order = CATEGORY_ORDER[company];

  // 회사별 카테고리 분류: 대림산업의 "포장철물" 키워드 매칭은 별도 카테고리로 분리
  const presentCodesForSummary = buildPresentEmpCodes(attendance, employees);
  const summaryMap = new Map<
    string,
    { base: number; present: number; absent: string[] }
  >();
  for (const e of employees) {
    if (!e.department.includes(company)) continue;
    let cat: string;
    if (
      company === "대림산업" &&
      (e.category.includes("포장철물") ||
        e.department.includes("포장철물") ||
        e.baseLocation.includes("포장철물") ||
        e.position.includes("포장철물"))
    ) {
      cat = "포장철물";
    } else {
      cat = e.category || "미지정";
    }
    if (!summaryMap.has(cat)) {
      summaryMap.set(cat, { base: 0, present: 0, absent: [] });
    }
    const s = summaryMap.get(cat)!;
    s.base += 1;
    if (presentCodesForSummary.has(e.empCode)) s.present += 1;
    else s.absent.push(e.name);
  }
  const summariesRaw = Array.from(summaryMap.entries()).map(([cat, s]) => ({
    category: cat,
    baseCount: s.base,
    attendanceCount: s.present,
    absentCount: s.base - s.present,
    absentNames: s.absent,
  }));
  // computeCompanySummary 는 더 이상 사용 안 함 (포장철물 분리 로직 직접 처리)

  // 카테고리 → 정렬 순위
  // 1) 사장님 키워드는 무조건 가장 먼저
  // 2) order 배열에 정확 일치 → 그 인덱스
  // 3) order 배열에 부분 일치 (포함) → 그 인덱스
  // 4) 그 외 → 맨 뒤
  const categoryRank = (cat: string): number => {
    // "소사장" / "사장" / "사장님" 어느 형태든 무조건 최상위
    if (cat.includes("소사장") || cat.includes("사장")) return -1;
    const exact = order.indexOf(cat);
    if (exact !== -1) return exact;
    for (let i = 0; i < order.length; i++) {
      if (cat.includes(order[i]) || order[i].includes(cat)) return i;
    }
    return Number.MAX_SAFE_INTEGER;
  };
  const summaries = [...summariesRaw].sort((a, b) => {
    const ar = categoryRank(a.category);
    const br = categoryRank(b.category);
    if (ar !== br) return ar - br;
    return a.category.localeCompare(b.category, "ko");
  });

  if (summaries.length === 0 || summaries.every((s) => s.baseCount === 0)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{company} 메인 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자: <span className="font-semibold">{workDate || "(미지정)"}</span>
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600">
            현재 근무기준에 {company} 소속 직원이 없습니다. 부서명에 "{company}"이(가) 포함된 직원만 집계됩니다.
            <br />
            <Link href="/master-data" className="text-blue-600 hover:underline">
              기준자료 페이지
            </Link>
            에서 근무기준 파일을 다시 확인해주세요.
          </p>
        </div>
      </div>
    );
  }

  // 2) 그룹별 supportablePeople 통합 맵
  const supportableMap = new Map<string, number>();
  woosungAll.groupLoad.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );
  dohoLoad.groups.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );
  package1.groups.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );

  // 회사별 그룹명 집합 (각 회사 그룹 식별)
  const woosungGroupNames = new Set<string>(
    woosungAll.groupLoad.map((g) => g.group)
  );
  const dohoGroupNames = new Set<string>([
    ...dohoLoad.groups.map((g) => g.group),
    ...package1.groups.map((g) => g.group),
  ]);
  const daerimGroupNames = new Set<string>(
    package2.groups.map((g) => g.group)
  );

  // package2 그룹 supportable도 통합 맵에 추가
  package2.groups.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );

  const groupCompany = (group: string): Company | "기타" => {
    if (woosungGroupNames.has(group)) return "우성산업";
    if (dohoGroupNames.has(group)) return "다호산업";
    if (daerimGroupNames.has(group)) return "대림산업";
    return "기타";
  };

  // 3) 그룹별 supportable 을 행 순서대로 분배해서 confirmed 계산 (분할 지원 지원)
  const confirmedMap = calcConfirmedByGroup(supportAssignments, supportableMap);

  const confirmedFor = (a: SupportAssignment): number => {
    const idx = supportAssignments.indexOf(a);
    return getConfirmedFor(a, idx, confirmedMap);
  };

  const sentByGroup = (group: string) => {
    let total = 0;
    supportAssignments.forEach((a, idx) => {
      if (a.group === group) total += getConfirmedFor(a, idx, confirmedMap);
    });
    return total;
  };

  const receivedByLine = (line: string) => {
    let total = 0;
    supportAssignments.forEach((a, idx) => {
      if (a.targetLine === line) total += getConfirmedFor(a, idx, confirmedMap);
    });
    return total;
  };

  const receivingLines = COMPANY_RECEIVING_LINES[company];

  // 출근 집합 (퍼시스 자동 출근 포함)
  const presentCodes = buildPresentEmpCodes(attendance, employees);

  // 라인 단위(직접그룹 통합) 잔업필요 계산 헬퍼 — package1 / package2 같은 라인용
  const lineLevelOvertime = (
    directGroups: { presentMembers: unknown[]; loadHours: number }[]
  ): number => {
    const directPresent = directGroups.reduce(
      (s, g) => s + g.presentMembers.length,
      0
    );
    const totalLoad = directGroups.reduce((s, g) => s + g.loadHours, 0);
    const avail = directPresent * 8;
    const diff = Math.round((avail - totalLoad) * 10) / 10;
    const shortage = diff < 0 ? Math.abs(diff) : 0;
    return shortage > 0
      ? Math.min(Math.ceil(shortage / 3), directPresent)
      : 0;
  };

  const package1Overtime = lineLevelOvertime(
    package1.groups.filter((g) => g.group !== "피더")
  );
  const package2Overtime = lineLevelOvertime(
    package2.groups.filter((g) => g.group !== "피더")
  );

  // 임계값 초과 시 그 카테고리 회사 직원의 출근자 수
  const presentCountInCategory = (cat: string, companyKey: string) =>
    employees.filter(
      (e) =>
        e.department.includes(companyKey) &&
        e.category === cat &&
        presentCodes.has(e.empCode)
    ).length;

  // 부서명/위치/카테고리 어느 곳이든 "포장철물" 포함된 직원의 출근자 수 (대림산업 한정)
  const presentCountForKeyword = (keyword: string, companyKey: string) =>
    employees.filter(
      (e) =>
        e.department.includes(companyKey) &&
        (e.category.includes(keyword) ||
          e.department.includes(keyword) ||
          e.baseLocation.includes(keyword) ||
          e.position.includes(keyword)) &&
        presentCodes.has(e.empCode)
    ).length;

  // 4) 카테고리 → 잔업/지원가능/지원보낸/지원받은 매핑
  // received는 그 회사가 실제로 받는 라인일 때만 카운트 (회사별 라인 이름 충돌 방지)
  const receiveOrZero = (category: string) =>
    receivingLines.has(category) ? receivedByLine(category) : 0;

  const getCategoryStats = (category: string) => {
    if (company === "우성산업") {
      // 가공라인 = 우성 8개 작업그룹 + 간접인원 김진규 (보내는 쪽)
      if (category === "가공라인") {
        const overtime =
          woosungAll.groupLoad.reduce((s, g) => s + g.overtimePeople, 0) +
          woosungAll.indirectOvertimePeople;
        const supportable = woosungAll.groupLoad.reduce(
          (s, g) => s + g.supportablePeople,
          0
        );
        const sent = woosungAll.groupLoad.reduce(
          (s, g) => s + sentByGroup(g.group),
          0
        );
        return { overtime, supportable, sent, received: 0 };
      }
      // 우성에는 받는 라인이 없음 (포장/도장 직원은 다호/대림 소관)
      return { overtime: 0, supportable: 0, sent: 0, received: 0 };
    }

    if (company === "다호산업") {
      if (category === "도장1라인") {
        // 도장1라인 그룹 + 쇼트 그룹 (김상균 포함)
        const line1 = dohoLoad.groups.find((g) => g.group === "도장1라인");
        const shot = dohoLoad.groups.find((g) => g.group === "쇼트");
        return {
          overtime: (line1?.overtimePeople ?? 0) + (shot?.overtimePeople ?? 0),
          supportable:
            (line1?.supportablePeople ?? 0) + (shot?.supportablePeople ?? 0),
          sent: sentByGroup("도장1라인") + sentByGroup("쇼트"),
          received: receiveOrZero("도장1라인"),
        };
      }
      if (category === "도장2라인") {
        const line2 = dohoLoad.groups.find((g) => g.group === "도장2라인");
        return {
          overtime: line2?.overtimePeople ?? 0,
          supportable: line2?.supportablePeople ?? 0,
          sent: sentByGroup("도장2라인"),
          received: receiveOrZero("도장2라인"),
        };
      }
      if (category === "포장1라인") {
        // 포장1라인 잔업필요 = 수동 배치(/plan 다호) 의 확정 배치 잔업 인원
        const directGroups = package1.groups.filter((g) => g.group !== "피더");
        const directPresent = directGroups.reduce(
          (s, g) => s + g.presentMembers.length,
          0
        );
        const totalLoad = directGroups.reduce((s, g) => s + g.loadHours, 0);
        const avail = directPresent * 8;
        const diff = Math.round((avail - totalLoad) * 10) / 10;
        const supportable =
          diff > 0 ? Math.min(Math.floor(diff / 8), directPresent) : 0;
        return {
          overtime: dohoPlanOvertimeConfirmed,
          supportable,
          sent: directGroups.reduce((s, g) => s + sentByGroup(g.group), 0),
          received: receiveOrZero("포장1라인"),
        };
      }
      // 물류·자재: 포장1+포장2 잔업필요 합 > 20 시 출근자 전체 잔업
      if (category === "물류" || category === "자재") {
        const triggered = package1Overtime + package2Overtime > 20;
        const present = triggered
          ? presentCountInCategory(category, "다호산업")
          : 0;
        return {
          overtime: present,
          supportable: 0,
          sent: 0,
          received: 0,
        };
      }
      // 다호 사장님 / 그 외
      return { overtime: 0, supportable: 0, sent: 0, received: 0 };
    }

    // 대림산업
    if (company === "대림산업") {
      // 포장철물 잔업필요 = 포장2라인 직접 잔업확정 ≥ 1명 → 포장철물 전원 잔업
      // (manualPlanPCMOvertimeConfirmed 와 동일 트리거)
      if (category.includes("포장철물")) {
        return {
          overtime: manualPlanPCMOvertimeConfirmed,
          supportable: 0,
          sent: 0,
          received: 0,
        };
      }
      if (category === "포장2라인") {
        // 포장2라인 잔업필요 = 수동 배치(/plan) 의 '확정된 배치' 잔업 인원
        // (임시셀 등으로 잔업이 늘 수 있어 확정 기준이 가장 실제와 가까움)
        const directGroups = package2.groups.filter((g) => g.group !== "피더");
        const directPresent = directGroups.reduce(
          (s, g) => s + g.presentMembers.length,
          0
        );
        const totalLoad = directGroups.reduce((s, g) => s + g.loadHours, 0);
        const avail = directPresent * 8;
        const diff = Math.round((avail - totalLoad) * 10) / 10;
        const supportable =
          diff > 0 ? Math.min(Math.floor(diff / 8), directPresent) : 0;
        return {
          overtime: manualPlanOvertimeConfirmed,
          supportable,
          sent: directGroups.reduce((s, g) => s + sentByGroup(g.group), 0),
          received: receiveOrZero("포장2라인"),
        };
      }
      // 대림 사장님 / 그 외: 받은 것만
      return {
        overtime: 0,
        supportable: 0,
        sent: 0,
        received: receiveOrZero(category),
      };
    }

    return {
      overtime: 0,
      supportable: 0,
      sent: 0,
      received: receiveOrZero(category),
    };
  };

  // 잔업확정: 각 카테고리 소속 직원 중 overtimeConfirmed 에 등록된 수
  const overtimeConfirmedSet = new Set(overtimeConfirmed);
  const overtimeConfirmedByCat = new Map<string, number>();
  for (const e of employees) {
    if (!e.department.includes(company)) continue;
    if (!overtimeConfirmedSet.has(e.empCode)) continue;
    let cat: string;
    if (
      company === "대림산업" &&
      (e.category.includes("포장철물") ||
        e.department.includes("포장철물") ||
        e.baseLocation.includes("포장철물") ||
        e.position.includes("포장철물"))
    ) {
      cat = "포장철물";
    } else {
      cat = e.category || "미지정";
    }
    overtimeConfirmedByCat.set(cat, (overtimeConfirmedByCat.get(cat) ?? 0) + 1);
  }

  // 다호 잔업확정 규칙 — 다호 포장1 + 대림 포장2 확정 상태에 따라 파생
  //  · 피더(3명): 다호 포장1 확정 ≥ 1 → 출근 피더 전원
  //  · 물류:      0/1/2 라인 확정 → 0/1/2명
  //  · 자재:      0/1/2 라인 확정 → 0/2/3명
  const dohoP1OT = dohoPlanOvertimeConfirmed;
  const daerimP2OT = manualPlanOvertimeConfirmed;
  const dohoLinesWithOT =
    (dohoP1OT >= 1 ? 1 : 0) + (daerimP2OT >= 1 ? 1 : 0);
  const dohoFeederPresent =
    package1.groups.find((g) => g.group === "피더")?.presentMembers.length ?? 0;
  const dohoFeederOTConfirmed = dohoP1OT >= 1 ? dohoFeederPresent : 0;
  const dohoLogisticsOTConfirmed = dohoLinesWithOT; // 0/1/2
  const dohoMaterialsOTConfirmed =
    dohoLinesWithOT === 0 ? 0 : dohoLinesWithOT === 1 ? 2 : 3;

  const enriched = summaries.map((s) => {
    const stats = getCategoryStats(s.category);
    const finalAvailable = s.attendanceCount + stats.received - stats.sent;
    // 잔업확정 = 수동 배치(/plan) 의 확정된 배치 잔업 인원
    // 그 외 카테고리: 사원코드 기반 카운트
    let overtimeConfirmedCount: number;
    if (company === "대림산업" && s.category === "포장2라인") {
      overtimeConfirmedCount = manualPlanOvertimeConfirmed;
    } else if (company === "대림산업" && s.category === "포장철물") {
      overtimeConfirmedCount = manualPlanPCMOvertimeConfirmed;
    } else if (company === "다호산업" && s.category === "포장1라인") {
      overtimeConfirmedCount = dohoPlanOvertimeConfirmed;
    } else if (company === "다호산업" && s.category === "물류") {
      overtimeConfirmedCount = dohoLogisticsOTConfirmed;
    } else if (company === "다호산업" && s.category === "자재") {
      overtimeConfirmedCount = dohoMaterialsOTConfirmed;
    } else {
      overtimeConfirmedCount = overtimeConfirmedByCat.get(s.category) ?? 0;
    }
    return { ...s, ...stats, finalAvailable, overtimeConfirmedCount };
  });

  // 피더 행 분리 + 모회사 라인 인원에서 피더 차감
  // - 대림산업: 포장2라인 → 피더 (package2)
  // - 다호산업: 포장1라인 → 피더 (package1)
  let displayRows = enriched;
  const buildFeederRow = (
    feederGroup:
      | {
          members: { name: string }[];
          presentMembers: { name: string }[];
          absentMembers: { name: string }[];
        }
      | undefined,
    overtimeBasic: number,
    overtimeConfirmed: number
  ) => {
    const feederBase = feederGroup?.members.length ?? 0;
    const feederPresent = feederGroup?.presentMembers.length ?? 0;
    const feederAbsent = feederBase - feederPresent;
    const feederAbsentNames =
      feederGroup?.absentMembers.map((m) => m.name) ?? [];
    return {
      base: feederBase,
      present: feederPresent,
      absent: feederAbsent,
      absentNames: feederAbsentNames,
      row: {
        category: "피더",
        baseCount: feederBase,
        attendanceCount: feederPresent,
        absentCount: feederAbsent,
        absentNames: feederAbsentNames,
        overtime: overtimeBasic,
        supportable: 0,
        sent: 0,
        received: 0,
        finalAvailable: feederPresent,
        overtimeConfirmedCount: overtimeConfirmed,
      } as (typeof enriched)[number],
    };
  };

  if (company === "대림산업") {
    const f = buildFeederRow(
      package2.groups.find((g) => g.group === "피더"),
      manualPlanFeederOvertimeBasic,
      manualPlanFeederOvertimeConfirmed
    );
    displayRows = [];
    for (const row of enriched) {
      if (row.category === "포장2라인") {
        displayRows.push({
          ...row,
          baseCount: Math.max(0, row.baseCount - f.base),
          attendanceCount: Math.max(0, row.attendanceCount - f.present),
          absentCount: Math.max(0, row.absentCount - f.absent),
          absentNames: row.absentNames.filter(
            (n) => !f.absentNames.includes(n)
          ),
          finalAvailable: Math.max(0, row.finalAvailable - f.present),
        });
        displayRows.push(f.row);
      } else {
        displayRows.push(row);
      }
    }
  } else if (company === "다호산업") {
    // 다호 피더 잔업확정: 다호 포장1 확정 ≥ 1 → 출근 피더 전원 (위에서 계산)
    const f = buildFeederRow(
      package1.groups.find((g) => g.group === "피더"),
      dohoPlanFeederOvertimeBasic,
      dohoFeederOTConfirmed
    );
    displayRows = [];
    for (const row of enriched) {
      if (row.category === "포장1라인") {
        displayRows.push({
          ...row,
          baseCount: Math.max(0, row.baseCount - f.base),
          attendanceCount: Math.max(0, row.attendanceCount - f.present),
          absentCount: Math.max(0, row.absentCount - f.absent),
          absentNames: row.absentNames.filter(
            (n) => !f.absentNames.includes(n)
          ),
          finalAvailable: Math.max(0, row.finalAvailable - f.present),
        });
        displayRows.push(f.row);
      } else {
        displayRows.push(row);
      }
    }
  }

  // 5) 합계
  const totalBase = displayRows.reduce((s, r) => s + r.baseCount, 0);
  const totalPresent = displayRows.reduce(
    (s, r) => s + r.attendanceCount,
    0
  );
  const totalAbsent = displayRows.reduce((s, r) => s + r.absentCount, 0);
  const totalOvertime = displayRows.reduce((s, r) => s + r.overtime, 0);
  const totalOvertimeConfirmed = displayRows.reduce(
    (s, r) => s + r.overtimeConfirmedCount,
    0
  );
  const totalReceived = displayRows.reduce((s, r) => s + r.received, 0);
  const totalSent = displayRows.reduce((s, r) => s + r.sent, 0);
  const totalSupportNet = totalReceived - totalSent;
  const totalFinalAvailable = displayRows.reduce(
    (s, r) => s + r.finalAvailable,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{company} 메인 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자: <span className="font-semibold">{workDate || "(미지정)"}</span>
          </p>
        </div>
      </div>

      {/* 상단 6개 합계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard icon={<Users />} label="총인원" value={totalBase} />
        <SummaryCard
          icon={<UserCheck />}
          label="출근"
          value={totalPresent}
          tone="green"
        />
        <SummaryCard
          icon={<UserX />}
          label="미출근"
          value={totalAbsent}
          tone={totalAbsent > 0 ? "red" : "gray"}
        />
        <SummaryCard
          icon={<Clock />}
          label="잔업필요"
          value={totalOvertime}
          tone={totalOvertime > 0 ? "red" : "gray"}
        />
        <SummaryCard
          icon={<CheckCircle2 />}
          label="잔업확정"
          value={totalOvertimeConfirmed}
          tone={totalOvertimeConfirmed > 0 ? "blue" : "gray"}
        />
        <SummaryCard
          icon={<ArrowRightLeft />}
          label="지원"
          value={
            totalSupportNet > 0
              ? `+${totalSupportNet}`
              : totalSupportNet < 0
                ? `${totalSupportNet}`
                : "0"
          }
          tone={totalSupportNet !== 0 ? "blue" : "gray"}
        />
      </div>

      {/* 하단 소속별 테이블 */}
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-3">소속별 출근요약</h2>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>소속</th>
                <th>기준</th>
                <th>출근</th>
                <th>미출근</th>
                <th>미출근자</th>
                <th>잔업필요</th>
                <th>잔업확정</th>
                <th>지원</th>
                <th>최종가용</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const supportNet = row.received - row.sent;
                return (
                  <tr key={row.category}>
                    <td className="font-semibold">
                      {row.category.includes("사장님") ? "소사장" : row.category}
                    </td>
                    <td className="text-center">{row.baseCount}</td>
                    <td className="text-center">
                      <span className="badge badge-green">{row.attendanceCount}</span>
                    </td>
                    <td
                      className={cn("text-center", row.absentCount > 0 && "red-cell")}
                    >
                      {row.absentCount}
                    </td>
                    <td className="text-xs text-slate-600 max-w-xs">
                      {row.absentNames.join(", ")}
                    </td>
                    <td
                      className={cn("text-center", row.overtime > 0 && "red-cell")}
                    >
                      {row.overtime || "-"}
                    </td>
                    <td
                      className={cn(
                        "text-center",
                        row.overtimeConfirmedCount > 0 && "text-amber-700 font-semibold"
                      )}
                    >
                      {row.overtimeConfirmedCount || "-"}
                    </td>
                    <td className="text-center">
                      {supportNet > 0 ? (
                        <span className="badge badge-blue">+{supportNet}</span>
                      ) : supportNet < 0 ? (
                        <span className="badge badge-amber">{supportNet}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td
                      className={cn(
                        "text-center font-semibold",
                        row.finalAvailable < row.attendanceCount && "text-amber-700"
                      )}
                    >
                      {row.finalAvailable}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold">
                <td>합계</td>
                <td className="text-center">{totalBase}</td>
                <td className="text-center">{totalPresent}</td>
                <td
                  className={cn("text-center", totalAbsent > 0 && "red-cell")}
                >
                  {totalAbsent}
                </td>
                <td></td>
                <td
                  className={cn("text-center", totalOvertime > 0 && "red-cell")}
                >
                  {totalOvertime || "-"}
                </td>
                <td className="text-center">{totalOvertimeConfirmed || "-"}</td>
                <td className="text-center">
                  {totalSupportNet > 0
                    ? `+${totalSupportNet}`
                    : totalSupportNet < 0
                      ? `${totalSupportNet}`
                      : 0}
                </td>
                <td className="text-center">{totalFinalAvailable}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "default" | "red" | "green" | "blue" | "gray";
}) {
  const toneClass: Record<typeof tone & string, string> = {
    default: "bg-white text-slate-900",
    red: "bg-rose-50 text-rose-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    gray: "bg-slate-50 text-slate-700",
  };
  return (
    <div className={cn("card flex items-center gap-3 p-4", toneClass[tone])}>
      <div className="opacity-70">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}
