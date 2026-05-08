"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { computeCompanySummary } from "@/lib/calc/companySummary";
import { computeDohoPaintLoad } from "@/lib/calc/dohoPaintLoad";
import { computePackage1Load } from "@/lib/calc/package1Load";
import { computeAll } from "@/lib/calc";
import { cn, formatDecimal } from "@/lib/utils";
import type { SupportAssignment } from "@/lib/types";
import { ArrowRight } from "lucide-react";
import {
  AlertCircle,
  ArrowRightLeft,
  Clock,
  Users,
  UserCheck,
  UserX,
} from "lucide-react";

export function DahoMainDashboard() {
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
      }),
    [packagePosition, packageLoad, attendance, overrides]
  );

  // 우성 작업그룹 supportablePeople 계산
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

  if (!hydrated) return null;

  const missing: string[] = [];
  if (employees.length === 0) missing.push("근무기준");
  if (attendance.length === 0) missing.push("근태");

  if (missing.length > 0) {
    return (
      <EmptyState
        title="데이터를 먼저 업로드해주세요"
        description={`현재 미업로드: ${missing.join(", ")}\n\n다호산업 대시보드는 근무기준(기준자료)과 근태(일일자료)가 기본으로 필요합니다.`}
        ctaLabel={missing.includes("근무기준") ? "기준자료 업로드" : "일일자료 업로드"}
        ctaHref={missing.includes("근무기준") ? "/master-data" : "/upload"}
      />
    );
  }

  // 사용자 지정 소속 정렬: 다호 사장님 → 도장1 → 도장2 → 포장1 → 물류 → 자재 → 그 외
  const DAHO_CATEGORY_ORDER = [
    "다호 사장님",
    "도장1라인",
    "도장2라인",
    "포장1라인",
    "물류",
    "자재",
  ];
  const summariesRaw = computeCompanySummary(employees, attendance, "다호산업");
  const summaries = [...summariesRaw].sort((a, b) => {
    const ai = DAHO_CATEGORY_ORDER.indexOf(a.category);
    const bi = DAHO_CATEGORY_ORDER.indexOf(b.category);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.category.localeCompare(b.category, "ko");
  });

  if (summaries.length === 0 || summaries.every((s) => s.baseCount === 0)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">다호산업 메인 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자: <span className="font-semibold">{workDate || "(미지정)"}</span>
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-600">
            현재 근무기준에 다호산업 소속 직원이 없습니다. 부서명에 "다호산업"이 포함된 직원만 집계됩니다.
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

  // === 그룹별 supportablePeople 맵 (확정인원 계산용) ===
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

  // 어떤 그룹이 어느 회사 소속인지 식별 (UI 표기용)
  const dohoGroupNames = new Set<string>([
    ...dohoLoad.groups.map((g) => g.group),
    ...package1.groups.map((g) => g.group),
  ]);
  const woosungGroupNames = new Set<string>(
    woosungAll.groupLoad.map((g) => g.group)
  );

  // 확정인원 계산: MIN(그룹 supportablePeople, 사용자 선택 인원)
  const confirmedFor = (a: SupportAssignment): number => {
    if (!a.targetLine || a.selectedCount <= 0) return 0;
    const sup = supportableMap.get(a.group) ?? 0;
    return Math.max(0, Math.min(sup, a.selectedCount));
  };

  // 확정인원 기반 sent / received
  const sentByGroup = (group: string) =>
    supportAssignments
      .filter((a) => a.group === group)
      .reduce((s, a) => s + confirmedFor(a), 0);

  const receivedByLine = (line: string) =>
    supportAssignments
      .filter((a) => a.targetLine === line)
      .reduce((s, a) => s + confirmedFor(a), 0);

  // 다호로 들어온 흐름 (다호 라인 = 도장1/도장2/포장1/포장2 — 메인 대시보드 소속 일치)
  const DOHO_RECEIVING_LINES = new Set<string>([
    "도장1라인",
    "도장2라인",
    "포장1라인",
    "포장2라인",
  ]);

  const inflows = supportAssignments
    .filter(
      (a) =>
        a.targetLine &&
        DOHO_RECEIVING_LINES.has(a.targetLine) &&
        confirmedFor(a) > 0
    )
    .map((a) => ({ ...a, confirmed: confirmedFor(a) }));

  // 다호에서 나간 흐름 (다호 그룹이 보낸 것)
  const outflows = supportAssignments
    .filter(
      (a) =>
        a.targetLine &&
        dohoGroupNames.has(a.group) &&
        confirmedFor(a) > 0
    )
    .map((a) => ({ ...a, confirmed: confirmedFor(a) }));

  const groupCompanyLabel = (group: string): string => {
    if (dohoGroupNames.has(group)) return "다호";
    if (woosungGroupNames.has(group)) return "우성";
    return "기타";
  };

  const getCategoryStats = (category: string) => {
    if (category === "도장1라인") {
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
    if (category === "도장2라인") {
      const line2 = dohoLoad.groups.find((g) => g.group === "도장2라인");
      return {
        overtime: line2?.overtimePeople ?? 0,
        supportable: line2?.supportablePeople ?? 0,
        sent: sentByGroup("도장2라인"),
        received: receivedByLine("도장2라인"),
      };
    }
    if (category === "포장1라인") {
      // 포장1라인 직접그룹 통합 잔업필요 (Package1LineView 상단 요약과 동일)
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
        shortage > 0
          ? Math.min(Math.ceil(shortage / 3), directPresent)
          : 0;
      const supportable =
        diff > 0 ? Math.min(Math.floor(diff / 8), directPresent) : 0;
      return {
        overtime,
        supportable,
        sent: directGroups.reduce((s, g) => s + sentByGroup(g.group), 0),
        received: receivedByLine("포장1라인"),
      };
    }
    if (category === "포장2라인") {
      return {
        overtime: 0,
        supportable: 0,
        sent: 0,
        received: receivedByLine("포장2라인"),
      };
    }
    return { overtime: 0, supportable: 0, sent: 0, received: 0 };
  };

  const enriched = summaries.map((s) => {
    const stats = getCategoryStats(s.category);
    const finalAvailable =
      s.attendanceCount + stats.received - stats.sent;
    return { ...s, ...stats, finalAvailable };
  });

  // 합계
  const totalBase = enriched.reduce((s, r) => s + r.baseCount, 0);
  const totalPresent = enriched.reduce((s, r) => s + r.attendanceCount, 0);
  const totalAbsent = enriched.reduce((s, r) => s + r.absentCount, 0);
  const totalOvertime = enriched.reduce((s, r) => s + r.overtime, 0);
  const totalSupportable = enriched.reduce((s, r) => s + r.supportable, 0);
  const totalReceived = enriched.reduce((s, r) => s + r.received, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">다호산업 메인 대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자: <span className="font-semibold">{workDate || "(미지정)"}</span>
          </p>
        </div>
      </div>

      {/* 상단 6개 합계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
          label="잔업필요"
          value={totalOvertime}
          tone={totalOvertime > 0 ? "red" : "gray"}
        />
        <SummaryCard
          icon={<ArrowRightLeft />}
          label="지원가능"
          value={totalSupportable}
          tone={totalSupportable > 0 ? "blue" : "gray"}
        />
        <SummaryCard
          icon={<AlertCircle />}
          label="지원받은인원"
          value={totalReceived}
          tone={totalReceived > 0 ? "blue" : "gray"}
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
                <th>지원가능</th>
                <th>지원보낸</th>
                <th>지원받은</th>
                <th>최종가용</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((row) => (
                <tr key={row.category}>
                  <td className="font-semibold">{row.category}</td>
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
                    className={cn(
                      "text-center",
                      row.overtime > 0 && "red-cell"
                    )}
                  >
                    {row.overtime || "-"}
                  </td>
                  <td className="text-center">
                    {row.supportable > 0 ? (
                      <span className="text-blue-700 font-semibold">{row.supportable}</span>
                    ) : (
                      "-"
                    )}
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
                      row.finalAvailable < row.attendanceCount && "text-amber-700"
                    )}
                  >
                    {row.finalAvailable}
                  </td>
                </tr>
              ))}
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
                <td className="text-center">{totalSupportable || "-"}</td>
                <td className="text-center">
                  {enriched.reduce((s, r) => s + r.sent, 0) || 0}
                </td>
                <td className="text-center">{totalReceived || 0}</td>
                <td className="text-center">
                  {enriched.reduce((s, r) => s + r.finalAvailable, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 지원 흐름 — 받은 / 보낸 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-blue-600" />
            지원 받은 인원 ({inflows.reduce((s, r) => s + r.confirmed, 0)}명)
          </h2>
          {inflows.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              현재 다호산업으로 들어온 지원이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>보낸 그룹</th>
                    <th></th>
                    <th>받은 라인</th>
                    <th className="text-right">확정인원</th>
                  </tr>
                </thead>
                <tbody>
                  {inflows.map((r) => (
                    <tr key={`${r.group}-${r.targetLine}`}>
                      <td>
                        <span className="text-xs text-slate-500 mr-1">
                          {groupCompanyLabel(r.group)}
                        </span>
                        <span className="font-semibold">{r.group}</span>
                      </td>
                      <td className="text-center text-slate-400">→</td>
                      <td>
                        <span className="badge badge-blue">{r.targetLine}</span>
                      </td>
                      <td className="text-right font-semibold text-blue-700">
                        +{r.confirmed}명
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-amber-600 -rotate-180" />
            지원 보낸 인원 ({outflows.reduce((s, r) => s + r.confirmed, 0)}명)
          </h2>
          {outflows.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              현재 다호산업에서 보낸 지원이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>보낸 그룹</th>
                    <th></th>
                    <th>받은 라인</th>
                    <th className="text-right">확정인원</th>
                  </tr>
                </thead>
                <tbody>
                  {outflows.map((r) => (
                    <tr key={`${r.group}-${r.targetLine}`}>
                      <td>
                        <span className="text-xs text-slate-500 mr-1">
                          {groupCompanyLabel(r.group)}
                        </span>
                        <span className="font-semibold">{r.group}</span>
                      </td>
                      <td className="text-center text-slate-400">→</td>
                      <td>
                        <span className="badge badge-amber">{r.targetLine}</span>
                      </td>
                      <td className="text-right font-semibold text-amber-700">
                        -{r.confirmed}명
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
