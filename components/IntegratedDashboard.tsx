"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
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
import type { Company, Employee, SupportAssignment } from "@/lib/types";
import {
  ArrowRight,
  Banknote,
  Clock,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";

const DEPT_COMPANY_KEYWORDS: { keyword: string; company: Company | "퍼시스" | "기타" }[] = [
  { keyword: "우성산업", company: "우성산업" },
  { keyword: "다호산업", company: "다호산업" },
  { keyword: "대림산업", company: "대림산업" },
  { keyword: "퍼시스", company: "퍼시스" },
];

function inferCompany(department: string): Company | "퍼시스" | "기타" {
  for (const { keyword, company } of DEPT_COMPANY_KEYWORDS) {
    if (department.includes(keyword)) return company;
  }
  return "기타";
}

// 시간 (천단위 콤마, 반올림)
function fmtHours(h: number): string {
  return `${Math.round(h).toLocaleString("ko-KR")}h`;
}
// 생산액 (백만원 단위, 반올림)
function fmtRevenueMM(won: number): string {
  return `${Math.round(won / 1_000_000).toLocaleString("ko-KR")}백만원`;
}

export function IntegratedDashboard() {
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
  const package2Overrides = useDataStore((s) => s.package2WorkerOverrides);
  const workGroups = useDataStore((s) => s.workGroups);
  const lineBase = useDataStore((s) => s.lineBase);
  const workDate = useDataStore((s) => s.workDate);
  const setSelectedCompany = useDataStore((s) => s.setSelectedCompany);

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

  if (employees.length === 0) {
    return (
      <EmptyState
        title="근무기준 자료를 먼저 업로드해주세요"
        description={"통합 대시보드는 근무기준의 부서명을 기준으로 표시됩니다.\n기준자료에서 근무기준 엑셀을 업로드해주세요."}
        ctaLabel="기준자료 업로드"
        ctaHref="/master-data"
      />
    );
  }

  // 출근 집합 (퍼시스 자동 포함)
  const presentCodes = buildPresentEmpCodes(attendance, employees);

  // 카테고리별 stats 미리 계산 (회사별 분기 로직 일치)
  const categoryStatsMap = new Map<
    string, // "company|category"
    { overtime: number; supportable: number; sent: number; received: number }
  >();

  // 그룹별 supportable 통합 맵
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
  package2.groups.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );

  const confirmedMap = calcConfirmedByGroup(supportAssignments, supportableMap);

  const confirmedFor = (a: SupportAssignment) => {
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

  // 라인 단위 잔업 (직접그룹 통합) 헬퍼
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

  const presentCountInCategory = (cat: string, companyKey: string) =>
    employees.filter(
      (e) =>
        e.department.includes(companyKey) &&
        e.category === cat &&
        presentCodes.has(e.empCode)
    ).length;

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

  // 회사·카테고리별 매핑 정의
  function statsForCompanyCategory(
    company: Company | "퍼시스" | "기타",
    category: string
  ) {
    if (company === "우성산업" && category === "가공라인") {
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
    if (company === "다호산업" && category === "도장1라인") {
      const line1 = dohoLoad.groups.find((g) => g.group === "도장1라인");
      const shot = dohoLoad.groups.find((g) => g.group === "쇼트");
      return {
        overtime: (line1?.overtimePeople ?? 0) + (shot?.overtimePeople ?? 0),
        supportable:
          (line1?.supportablePeople ?? 0) + (shot?.supportablePeople ?? 0),
        sent: sentByGroup("도장1라인") + sentByGroup("쇼트"),
        received: receivedByLine("도장1라인"),
      };
    }
    if (company === "다호산업" && category === "도장2라인") {
      const line2 = dohoLoad.groups.find((g) => g.group === "도장2라인");
      return {
        overtime: line2?.overtimePeople ?? 0,
        supportable: line2?.supportablePeople ?? 0,
        sent: sentByGroup("도장2라인"),
        received: receivedByLine("도장2라인"),
      };
    }
    // 다호 물류·자재 — 포장1+포장2 잔업 합 > 20 시 출근자 전체 잔업
    if (
      company === "다호산업" &&
      (category === "물류" || category === "자재")
    ) {
      const triggered = package1Overtime + package2Overtime > 20;
      const present = triggered
        ? presentCountInCategory(category, "다호산업")
        : 0;
      return { overtime: present, supportable: 0, sent: 0, received: 0 };
    }
    // 대림 포장철물 — 포장2 잔업 > 10 시 출근자 전체 잔업
    if (company === "대림산업" && category.includes("포장철물")) {
      const triggered = package2Overtime > 10;
      const present = triggered
        ? presentCountForKeyword("포장철물", "대림산업")
        : 0;
      return { overtime: present, supportable: 0, sent: 0, received: 0 };
    }
    if (company === "다호산업" && category === "포장1라인") {
      const directGroups = package1.groups.filter((g) => g.group !== "피더");
      const directPresent = directGroups.reduce(
        (s, g) => s + g.presentMembers.length,
        0
      );
      const totalLoad = directGroups.reduce((s, g) => s + g.loadHours, 0);
      const avail = directPresent * 8;
      const diff = Math.round((avail - totalLoad) * 10) / 10;
      const shortage = diff < 0 ? Math.abs(diff) : 0;
      const overtime =
        shortage > 0 ? Math.min(Math.ceil(shortage / 3), directPresent) : 0;
      const supportable =
        diff > 0 ? Math.min(Math.floor(diff / 8), directPresent) : 0;
      return {
        overtime,
        supportable,
        sent: directGroups.reduce((s, g) => s + sentByGroup(g.group), 0),
        received: receivedByLine("포장1라인"),
      };
    }
    if (company === "대림산업" && category === "포장2라인") {
      const directGroups = package2.groups.filter((g) => g.group !== "피더");
      const directPresent = directGroups.reduce(
        (s, g) => s + g.presentMembers.length,
        0
      );
      const totalLoad = directGroups.reduce((s, g) => s + g.loadHours, 0);
      const avail = directPresent * 8;
      const diff = Math.round((avail - totalLoad) * 10) / 10;
      const shortage = diff < 0 ? Math.abs(diff) : 0;
      const overtime =
        shortage > 0 ? Math.min(Math.ceil(shortage / 3), directPresent) : 0;
      const supportable =
        diff > 0 ? Math.min(Math.floor(diff / 8), directPresent) : 0;
      return {
        overtime,
        supportable,
        sent: directGroups.reduce((s, g) => s + sentByGroup(g.group), 0),
        received: receivedByLine("포장2라인"),
      };
    }
    return { overtime: 0, supportable: 0, sent: 0, received: 0 };
  }

  // 부서명별 그룹핑
  const deptMap = new Map<
    string,
    {
      employees: Employee[];
      categories: Set<string>;
      company: Company | "퍼시스" | "기타";
    }
  >();
  for (const e of employees) {
    const dept = e.department || "(미지정)";
    if (!deptMap.has(dept)) {
      deptMap.set(dept, {
        employees: [],
        categories: new Set(),
        company: inferCompany(dept),
      });
    }
    const d = deptMap.get(dept)!;
    d.employees.push(e);
    if (e.category) d.categories.add(e.category);
  }

  // 카테고리(라인) 단위 잔업/지원보낸 + 그 라인 출근자의 D/I 비율
  // 직접/간접 분배는 부서 전체가 아니라 그 라인 자체 출근자 비율로 계산
  const lineRatios: {
    dept: string;
    category: string;
    overtime: number;
    sent: number;
    d: number;
    i: number;
  }[] = [];
  for (const [dept, info] of deptMap.entries()) {
    for (const cat of info.categories) {
      const s = statsForCompanyCategory(info.company, cat);
      if (s.overtime === 0 && s.sent === 0) continue;

      let dCount = 0;
      let iCount = 0;

      if (info.company === "다호산업" && cat === "포장1라인") {
        // 포장1라인 라인 통합 잔업 기여자 = 피더 제외 직접그룹 출근자
        const empCodes = new Set(
          package1.groups
            .filter((g) => g.group !== "피더")
            .flatMap((g) => g.presentMembers)
            .map((m) => m.empCode)
        );
        const present = info.employees.filter((e) => empCodes.has(e.empCode));
        dCount = present.filter((e) => e.workType === "직접").length;
        iCount = present.filter((e) => e.workType === "간접").length;
      } else if (info.company === "대림산업" && cat === "포장2라인") {
        const empCodes = new Set(
          package2.groups
            .filter((g) => g.group !== "피더")
            .flatMap((g) => g.presentMembers)
            .map((m) => m.empCode)
        );
        const present = info.employees.filter((e) => empCodes.has(e.empCode));
        dCount = present.filter((e) => e.workType === "직접").length;
        iCount = present.filter((e) => e.workType === "간접").length;
      } else if (info.company === "대림산업" && cat.includes("포장철물")) {
        const present = info.employees.filter(
          (e) =>
            (e.category.includes("포장철물") ||
              e.department.includes("포장철물") ||
              e.baseLocation.includes("포장철물") ||
              e.position.includes("포장철물")) &&
            presentCodes.has(e.empCode)
        );
        dCount = present.filter((e) => e.workType === "직접").length;
        iCount = present.filter((e) => e.workType === "간접").length;
      } else {
        // 기본: 그 부서×카테고리 출근자
        const present = info.employees.filter(
          (e) => e.category === cat && presentCodes.has(e.empCode)
        );
        dCount = present.filter((e) => e.workType === "직접").length;
        iCount = present.filter((e) => e.workType === "간접").length;
      }

      if (dCount + iCount === 0) continue;
      lineRatios.push({
        dept,
        category: cat,
        overtime: s.overtime,
        sent: s.sent,
        d: dCount,
        i: iCount,
      });
    }
  }

  const deptRows = Array.from(deptMap.entries()).map(([dept, info]) => {
    const base = info.employees.length;
    const presentEmps = info.employees.filter((e) => presentCodes.has(e.empCode));
    const present = presentEmps.length;
    const absent = base - present;
    const absentNames = info.employees
      .filter((e) => !presentCodes.has(e.empCode))
      .map((e) => e.name);

    let overtime = 0,
      supportable = 0,
      sent = 0,
      received = 0;
    for (const cat of info.categories) {
      const s = statsForCompanyCategory(info.company, cat);
      overtime += s.overtime;
      supportable += s.supportable;
      sent += s.sent;
      received += s.received;
    }
    const finalAvailable = present + received - sent;
    return {
      dept,
      company: info.company,
      base,
      present,
      absent,
      absentNames,
      overtime,
      supportable,
      sent,
      received,
      finalAvailable,
      isPersis: info.company === "퍼시스",
    };
  });

  // 정렬: 회사 → 가나다
  const COMPANY_ORDER: (Company | "퍼시스" | "기타")[] = [
    "우성산업",
    "다호산업",
    "대림산업",
    "퍼시스",
    "기타",
  ];
  deptRows.sort((a, b) => {
    const ai = COMPANY_ORDER.indexOf(a.company);
    const bi = COMPANY_ORDER.indexOf(b.company);
    if (ai !== bi) return ai - bi;
    return a.dept.localeCompare(b.dept, "ko");
  });

  // 합계
  const totalBase = deptRows.reduce((s, r) => s + r.base, 0);
  const totalPresent = deptRows.reduce((s, r) => s + r.present, 0);
  const totalAbsent = deptRows.reduce((s, r) => s + r.absent, 0);
  const totalOvertime = deptRows.reduce((s, r) => s + r.overtime, 0);
  const totalSent = deptRows.reduce((s, r) => s + r.sent, 0);
  const totalReceived = deptRows.reduce((s, r) => s + r.received, 0);
  const totalFinalAvailable = deptRows.reduce((s, r) => s + r.finalAvailable, 0);

  // 직접/간접 분배 (예상 근무시간/생산액 카드용 — DirectIndirectSummary 와 동일 로직)
  let _dirPresent = 0;
  let _indPresent = 0;
  for (const e of employees) {
    if (!presentCodes.has(e.empCode)) continue;
    if (e.workType === "직접") _dirPresent += 1;
    else if (e.workType === "간접") _indPresent += 1;
  }
  let _dOT = 0, _iOT = 0, _dSent = 0, _iSent = 0;
  for (const r of lineRatios) {
    const t = r.d + r.i;
    if (t === 0) continue;
    _dOT += (r.overtime * r.d) / t;
    _iOT += (r.overtime * r.i) / t;
    _dSent += (r.sent * r.d) / t;
    _iSent += (r.sent * r.i) / t;
  }
  const _dirOT = Math.round(_dOT);
  const _indOT = Math.round(_iOT);
  const _dirSentRound = Math.round(_dSent);
  const _indSentRound = Math.round(_iSent);

  const DIRECT_RECEIVING_LINES = new Set(["포장1라인", "포장2라인"]);
  let _dirRecv = 0;
  let _indRecv = 0;
  supportAssignments.forEach((a, idx) => {
    if (!a.targetLine) return;
    const c = getConfirmedFor(a, idx, confirmedMap);
    if (DIRECT_RECEIVING_LINES.has(a.targetLine)) _dirRecv += c;
    else _indRecv += c;
  });

  const _dirFinal = _dirPresent + _dirRecv - _dirSentRound;
  const _indFinal = _indPresent + _indRecv - _indSentRound;
  const _dirExpHours = _dirFinal * 8 + _dirOT * 4.5;
  const _indExpHours = _indFinal * 8 + _indOT * 4.5;
  const totalExpectedHours = _dirExpHours + _indExpHours;
  const expectedRevenue = _dirFinal * 4_000_000 + _dirOT * 1_400_000;
  const totalRevenuePerHour =
    totalExpectedHours > 0 ? expectedRevenue / totalExpectedHours : 0;

  // 전체 지원 흐름 (FROM → TO)
  const flows = supportAssignments
    .filter((a) => a.targetLine && confirmedFor(a) > 0)
    .map((a) => ({
      ...a,
      confirmed: confirmedFor(a),
      fromCompany: groupCompanyOf(a.group, woosungAll, dohoLoad, package1, package2),
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">통합 대시보드</h1>
        <p className="text-sm text-slate-500 mt-1">
          근무일자: <span className="font-semibold">{workDate || "(미지정)"}</span>
          <span className="ml-3 text-slate-400">
            전 회사 부서명 기준. 부서명에 "퍼시스" 가 포함된 직원은 자동 출근 처리됩니다.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={<Users />} label="기준" value={totalBase} />
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
          label="잔업인원"
          value={totalOvertime}
          tone={totalOvertime > 0 ? "red" : "gray"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard
          icon={<Clock />}
          label="예상 근무시간"
          value={fmtHours(totalExpectedHours)}
          tone="blue"
        />
        <SummaryCard
          icon={<Banknote />}
          label="예상 생산액"
          value={fmtRevenueMM(expectedRevenue)}
          tone="blue"
        />
        <SummaryCard
          icon={<TrendingUp />}
          label="예상 시간당 생산액"
          value={
            totalRevenuePerHour > 0
              ? `${Math.round(totalRevenuePerHour).toLocaleString()}원/h`
              : "-"
          }
          tone="blue"
        />
      </div>

      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-3">부서별 출근요약</h2>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>부서명</th>
                <th>기준</th>
                <th>출근</th>
                <th>미출근</th>
                <th>미출근자</th>
                <th>잔업필요</th>
                <th>지원보낸</th>
                <th>지원받은</th>
                <th>최종가용</th>
              </tr>
            </thead>
            <tbody>
              {deptRows.map((row) => {
                const isCompanyClickable =
                  row.company === "우성산업" ||
                  row.company === "다호산업" ||
                  row.company === "대림산업";
                return (
                <tr key={row.dept} className={row.isPersis ? "bg-emerald-50/30" : ""}>
                  <td
                    className={cn(
                      "font-semibold",
                      isCompanyClickable &&
                        "cursor-pointer text-blue-700 hover:bg-blue-50 hover:underline"
                    )}
                    onClick={
                      isCompanyClickable
                        ? () =>
                            setSelectedCompany(
                              row.company as "우성산업" | "다호산업" | "대림산업"
                            )
                        : undefined
                    }
                    title={
                      isCompanyClickable
                        ? `${row.company} 메인 대시보드로 이동`
                        : undefined
                    }
                  >
                    {row.dept}
                  </td>
                  <td className="text-center">{row.base}</td>
                  <td className="text-center">
                    <span className="badge badge-green">{row.present}</span>
                  </td>
                  <td
                    className={cn("text-center", row.absent > 0 && "red-cell")}
                  >
                    {row.absent}
                  </td>
                  <td className="text-xs text-slate-600 max-w-xs">
                    {row.absentNames.join(", ")}
                  </td>
                  <td
                    className={cn("text-center", row.overtime > 0 && "red-cell")}
                  >
                    {row.overtime || "-"}
                  </td>
                  <td className="text-center">
                    {row.sent > 0 ? (
                      <span className="badge badge-amber">-{row.sent}</span>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="text-center">
                    {row.received > 0 ? (
                      <span className="badge badge-blue">+{row.received}</span>
                    ) : (
                      0
                    )}
                  </td>
                  <td
                    className={cn(
                      "text-center font-semibold",
                      row.finalAvailable < row.present && "text-amber-700"
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
                <td className={cn("text-center", totalAbsent > 0 && "red-cell")}>
                  {totalAbsent}
                </td>
                <td></td>
                <td className={cn("text-center", totalOvertime > 0 && "red-cell")}>
                  {totalOvertime || "-"}
                </td>
                <td className="text-center">{totalSent || 0}</td>
                <td className="text-center">{totalReceived || 0}</td>
                <td className="text-center">{totalFinalAvailable}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 직접 / 간접 인원 출근 요약 */}
      <DirectIndirectSummary
        employees={employees}
        lineRatios={lineRatios}
        presentCodes={presentCodes}
        supportAssignments={supportAssignments}
        confirmedMap={confirmedMap}
      />

      {/* 전체 지원 인원 배정 FROM → TO */}
      <div className="card">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-blue-600" />
          전체 지원 인원 배정 ({flows.reduce((s, r) => s + r.confirmed, 0)}명)
        </h2>
        {flows.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">
            현재 배정된 지원 흐름이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>FROM (보낸 그룹)</th>
                  <th></th>
                  <th>TO (받은 라인)</th>
                  <th className="text-right">확정인원</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((r) => (
                  <tr key={`${r.group}-${r.targetLine}`}>
                    <td>
                      <span className="text-xs text-slate-500 mr-1">{r.fromCompany}</span>
                      <span className="font-semibold">{r.group}</span>
                    </td>
                    <td className="text-center text-slate-400">→</td>
                    <td>
                      <span className="badge badge-blue">{r.targetLine}</span>
                    </td>
                    <td className="text-right font-semibold text-blue-700">
                      {r.confirmed}명
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function groupCompanyOf(
  group: string,
  woosungAll: { groupLoad: { group: string }[] },
  dohoLoad: { groups: { group: string }[] },
  package1: { groups: { group: string }[] },
  package2: { groups: { group: string }[] }
): string {
  if (woosungAll.groupLoad.some((g) => g.group === group)) return "우성";
  if (dohoLoad.groups.some((g) => g.group === group)) return "다호";
  if (package1.groups.some((g) => g.group === group)) return "다호";
  if (package2.groups.some((g) => g.group === group)) return "대림";
  return "기타";
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

// === 직접/간접 출근 요약 ===
// 근무기준 D열(workType) "직접" / "간접" 으로 분류.
// 잔업/지원보낸 → 카테고리(라인) 단위 출근자 D/I 비율로 분배.
function DirectIndirectSummary({
  employees,
  lineRatios,
  presentCodes,
  supportAssignments,
  confirmedMap,
}: {
  employees: Employee[];
  lineRatios: {
    dept: string;
    category: string;
    overtime: number;
    sent: number;
    d: number;
    i: number;
  }[];
  presentCodes: Set<string>;
  supportAssignments: SupportAssignment[];
  confirmedMap: Map<string, number>;
}) {
  // 1) 인원 카운트(기준/출근/잔업) — 근무기준 D열(업무구분) 기준
  const init = () => ({
    base: 0,
    present: 0,
    overtime: 0,
    sent: 0,
    received: 0,
    finalAvailable: 0,
  });
  const direct = init();
  const indirect = init();

  for (const e of employees) {
    if (e.workType === "직접") {
      direct.base += 1;
      if (presentCodes.has(e.empCode)) direct.present += 1;
    } else if (e.workType === "간접") {
      indirect.base += 1;
      if (presentCodes.has(e.empCode)) indirect.present += 1;
    }
  }

  // 2) 잔업/보낸 지원 — 카테고리(라인) 단위 출근자 D/I 비율로 비례 분배
  // 예: 다호 포장1라인 잔업 15명 → 그 라인 직접그룹 출근자 D비율로 곱해 직접 잔업필요만 추출
  for (const r of lineRatios) {
    const total = r.d + r.i;
    if (total === 0) continue;
    direct.overtime += (r.overtime * r.d) / total;
    indirect.overtime += (r.overtime * r.i) / total;
    direct.sent += (r.sent * r.d) / total;
    indirect.sent += (r.sent * r.i) / total;
  }
  direct.overtime = Math.round(direct.overtime);
  indirect.overtime = Math.round(indirect.overtime);
  direct.sent = Math.round(direct.sent);
  indirect.sent = Math.round(indirect.sent);

  // 3) 받은 지원 — 포장1·포장2 라인이 받은 인원은 직접에 추가, 그 외(도장 등)는 간접
  const DIRECT_RECEIVING_LINES = new Set(["포장1라인", "포장2라인"]);
  direct.received = supportAssignments.reduce((s, a, idx) => {
    if (a.targetLine && DIRECT_RECEIVING_LINES.has(a.targetLine)) {
      return s + getConfirmedFor(a, idx, confirmedMap);
    }
    return s;
  }, 0);
  indirect.received = supportAssignments.reduce((s, a, idx) => {
    if (a.targetLine && !DIRECT_RECEIVING_LINES.has(a.targetLine)) {
      return s + getConfirmedFor(a, idx, confirmedMap);
    }
    return s;
  }, 0);

  // 최종가용 = 출근 + 받은 지원 - 보낸 지원
  direct.finalAvailable = direct.present + direct.received - direct.sent;
  indirect.finalAvailable = indirect.present + indirect.received - indirect.sent;

  // 예상 근무시간 = 최종가용 × 8h + 잔업필요 × 4.5h
  const directExpectedHours = direct.finalAvailable * 8 + direct.overtime * 4.5;
  const indirectExpectedHours =
    indirect.finalAvailable * 8 + indirect.overtime * 4.5;
  const totalExpectedHours = directExpectedHours + indirectExpectedHours;

  // 예상 생산액 = 직접 최종가용 × 4,000,000 + 직접 잔업필요 × 1,400,000
  const REVENUE_PER_DIRECT_AVAILABLE = 4_000_000;
  const REVENUE_PER_DIRECT_OVERTIME = 1_400_000;
  const expectedRevenue =
    direct.finalAvailable * REVENUE_PER_DIRECT_AVAILABLE +
    direct.overtime * REVENUE_PER_DIRECT_OVERTIME;

  // 예상 시간당 생산액 = 예상 생산액 / 예상 근무시간 (행별 분모 다름)
  const directRevenuePerHour =
    directExpectedHours > 0 ? expectedRevenue / directExpectedHours : 0;
  const indirectRevenuePerHour =
    indirectExpectedHours > 0 ? expectedRevenue / indirectExpectedHours : 0;
  const totalRevenuePerHour =
    totalExpectedHours > 0 ? expectedRevenue / totalExpectedHours : 0;

  const totalBase = direct.base + indirect.base;
  const totalPresent = direct.present + indirect.present;
  const totalOvertime = direct.overtime + indirect.overtime;
  const totalSent = direct.sent + indirect.sent;
  const totalReceived = direct.received + indirect.received;
  const totalFinalAvailable = direct.finalAvailable + indirect.finalAvailable;

  return (
    <div className="card">
      <h2 className="font-semibold text-slate-900 mb-3">
        직접 / 간접 인원 출근 요약
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        직접인원은 포장 직접생산인원
        <br />
        간접인원은 그 외 가공·도장·피더·퍼시스 인원 등.
      </p>

      {/* 1) 직접 / 간접 출근 요약 */}
      <div className="overflow-x-auto mb-5">
        <table className="table-base">
          <thead>
            <tr>
              <th>구분</th>
              <th>기준</th>
              <th>출근</th>
              <th>잔업필요</th>
              <th>지원보낸</th>
              <th>지원받은</th>
              <th>최종가용</th>
              <th>예상 근무시간</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-semibold">직접</td>
              <td className="text-center">{direct.base}</td>
              <td className="text-center">
                <span className="badge badge-green">{direct.present}</span>
              </td>
              <td
                className={cn(
                  "text-center",
                  direct.overtime > 0 && "red-cell"
                )}
              >
                {direct.overtime || "-"}
              </td>
              <td className="text-center">
                {direct.sent > 0 ? (
                  <span className="badge badge-amber">-{direct.sent}</span>
                ) : (
                  0
                )}
              </td>
              <td className="text-center">
                {direct.received > 0 ? (
                  <span className="badge badge-blue">+{direct.received}</span>
                ) : (
                  0
                )}
              </td>
              <td className="text-center font-semibold">
                {direct.finalAvailable}
              </td>
              <td className="text-center">{fmtHours(directExpectedHours)}</td>
            </tr>
            <tr>
              <td className="font-semibold">간접</td>
              <td className="text-center">{indirect.base}</td>
              <td className="text-center">
                <span className="badge badge-green">{indirect.present}</span>
              </td>
              <td
                className={cn(
                  "text-center",
                  indirect.overtime > 0 && "red-cell"
                )}
              >
                {indirect.overtime || "-"}
              </td>
              <td className="text-center">
                {indirect.sent > 0 ? (
                  <span className="badge badge-amber">-{indirect.sent}</span>
                ) : (
                  0
                )}
              </td>
              <td className="text-center">
                {indirect.received > 0 ? (
                  <span className="badge badge-blue">+{indirect.received}</span>
                ) : (
                  0
                )}
              </td>
              <td className="text-center font-semibold">
                {indirect.finalAvailable}
              </td>
              <td className="text-center">{fmtHours(indirectExpectedHours)}</td>
            </tr>
            <tr className="bg-slate-50 font-semibold">
              <td>합계</td>
              <td className="text-center">{totalBase}</td>
              <td className="text-center">{totalPresent}</td>
              <td
                className={cn("text-center", totalOvertime > 0 && "red-cell")}
              >
                {totalOvertime || "-"}
              </td>
              <td className="text-center">{totalSent || 0}</td>
              <td className="text-center">{totalReceived || 0}</td>
              <td className="text-center">{totalFinalAvailable}</td>
              <td className="text-center">{fmtHours(totalExpectedHours)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 2) 예상 근무시간 / 예상 생산액 / 예상 시간당 생산액 */}
      <h3 className="font-semibold text-slate-700 text-sm mb-2">
        예상 근무시간 / 예상 생산액
      </h3>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>구분</th>
              <th>예상 근무시간</th>
              <th>예상 생산액</th>
              <th>예상 시간당 생산액</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-semibold">직접</td>
              <td className="text-center">{fmtHours(directExpectedHours)}</td>
              <td className="text-center">{fmtRevenueMM(expectedRevenue)}</td>
              <td className="text-center">
                {directRevenuePerHour > 0
                  ? `${Math.round(directRevenuePerHour).toLocaleString()}원/h`
                  : "-"}
              </td>
            </tr>
            <tr>
              <td className="font-semibold">간접</td>
              <td className="text-center">{fmtHours(indirectExpectedHours)}</td>
              <td className="text-center">{fmtRevenueMM(expectedRevenue)}</td>
              <td className="text-center">
                {indirectRevenuePerHour > 0
                  ? `${Math.round(indirectRevenuePerHour).toLocaleString()}원/h`
                  : "-"}
              </td>
            </tr>
            <tr className="bg-slate-50 font-semibold">
              <td>합계</td>
              <td className="text-center">{fmtHours(totalExpectedHours)}</td>
              <td className="text-center">{fmtRevenueMM(expectedRevenue)}</td>
              <td className="text-center">
                {totalRevenuePerHour > 0
                  ? `${Math.round(totalRevenuePerHour).toLocaleString()}원/h`
                  : "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        ※ 예상 근무시간 = 최종가용 × 8H + 잔업필요 × 4.5H (가중반영)
        <br />
        ※ 예상 생산액 = 직접 인당 생산액 4,000,000원 기준
      </p>
    </div>
  );
}
