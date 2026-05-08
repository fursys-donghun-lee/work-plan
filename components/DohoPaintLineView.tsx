"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { AlertBanner, type AlertItem } from "@/components/Alerts";
import { computeDohoPaintLoad, type ReceivingLineSummary } from "@/lib/calc/dohoPaintLoad";
import { cn, formatDecimal } from "@/lib/utils";
import {
  SUPPORT_LINES,
  type DohoGroupLoad,
  type DohoGroupName,
  type SupportTargetLine,
} from "@/lib/types";
import { AlertCircle, ArrowRight } from "lucide-react";

const DOHO_GROUP_OPTIONS: DohoGroupName[] = ["쇼트", "도장1라인", "도장2라인"];

export function DohoPaintLineView() {
  const hydrated = useHydrated();
  const paintPlan = useDataStore((s) => s.paintPlan);
  const loadPlan = useDataStore((s) => s.loadPlan);
  const loadBar = useDataStore((s) => s.loadBar);
  const employees = useDataStore((s) => s.employees);
  const attendance = useDataStore((s) => s.attendance);
  const workDate = useDataStore((s) => s.workDate);
  const supportAssignments = useDataStore((s) => s.supportAssignments);
  const setSupportAssignment = useDataStore((s) => s.setSupportAssignment);
  const supportRedirects = useDataStore((s) => s.supportRedirects);
  const setSupportRedirect = useDataStore((s) => s.setSupportRedirect);

  const result = useMemo(() => {
    return computeDohoPaintLoad({
      paintPlan,
      loadPlan,
      loadBar,
      employees,
      attendance,
      supportAssignments,
      supportRedirects,
    });
  }, [
    paintPlan,
    loadPlan,
    loadBar,
    employees,
    attendance,
    supportAssignments,
    supportRedirects,
  ]);

  if (!hydrated) return null;

  const missing: string[] = [];
  if (employees.length === 0) missing.push("근무기준");
  if (attendance.length === 0) missing.push("근태");
  if (paintPlan.length === 0) missing.push("도장계획");

  if (missing.length > 0) {
    return (
      <EmptyState
        title="데이터를 먼저 업로드해주세요"
        description={`현재 미업로드: ${missing.join(", ")}\n\n도장 부하는 근무기준·근태·도장계획이 모두 있어야 계산됩니다.\n쇼트 부하는 추가로 라인별 공정 부하의 #쇼트 항목을 사용합니다.`}
        ctaLabel={missing.includes("근무기준") ? "기준자료 업로드" : "일일자료 업로드"}
        ctaHref={missing.includes("근무기준") ? "/master-data" : "/upload"}
      />
    );
  }

  const { groups, unmatchedItems, receivingLines } = result;
  const totalReceived = receivingLines.reduce((s, r) => s + r.receivedCount, 0);

  const alerts: AlertItem[] = [];
  if (loadBar.length === 0) {
    alerts.push({
      level: "warning",
      message: "로드바 정보가 업로드되지 않았습니다",
      detail: "모든 품목이 기본값(로드바당 품목수=2)으로 계산됩니다. 정확한 부하를 위해 기준자료에서 로드바 정보를 업로드해주세요.",
    });
  }
  if (unmatchedItems.length > 0) {
    const top = unmatchedItems
      .slice(0, 8)
      .map((u) => `${u.partCode}/${u.partColor}(계획 ${u.totalQty})`)
      .join(", ");
    alerts.push({
      level: "error",
      message: `로드바 정보에 매칭되지 않은 품목 ${unmatchedItems.length}건 (기본 2개로 계산됨)`,
      detail: top + (unmatchedItems.length > 8 ? ` ... 외 ${unmatchedItems.length - 8}건` : ""),
    });
  }
  if (loadPlan.filter((r) => r.equipmentName === "#쇼트" || r.equipmentName === "#쇼트공정").length === 0) {
    alerts.push({
      level: "info",
      message: "라인별 공정 부하에 #쇼트 설비가 없어 쇼트 부하시간이 0으로 계산됩니다.",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">도장라인 부하</h1>
        <p className="text-sm text-slate-500 mt-1">
          근무일자: <span className="font-semibold">{workDate || "(미지정)"}</span>
          <span className="ml-3 text-slate-400">
            쇼트 / 도장1라인(WW·TS) / 도장2라인(그 외 색상)
          </span>
        </p>
      </div>

      <AlertBanner items={alerts} />

      {totalReceived > 0 && (
        <div className="card border-blue-200 bg-blue-50/50">
          <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            다른 라인에서 받은 지원 인원 배정 ({totalReceived}명)
          </h3>
          <p className="text-xs text-blue-700 mb-3">
            받은 인원을 어느 작업그룹에 배치할지 선택하세요. 선택한 그룹의 가용시간이 인원수만큼 증가합니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {receivingLines
              .filter((rl) => rl.receivedCount > 0)
              .map((rl) => (
                <ReceivingLineCard
                  key={rl.line}
                  rl={rl}
                  onChange={(group) => setSupportRedirect(rl.line, group)}
                />
              ))}
          </div>
        </div>
      )}

      {unmatchedItems.length > 0 && (
        <div className="card border-rose-200 bg-rose-50/50">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-rose-900">
                로드바 정보 미매칭 품목 ({unmatchedItems.length}건)
              </h3>
              <p className="text-sm text-rose-700 mt-1 mb-3">
                아래 품목의 로드바당 품목수를 알 수 없어 기본값 2로 계산됩니다.
                정확한 부하를 위해{" "}
                <Link href="/master-data" className="underline font-medium">
                  기준자료의 로드바 정보
                </Link>
                에 항목을 추가해주세요.
              </p>
              <div className="overflow-x-auto max-h-56">
                <table className="table-base text-xs">
                  <thead className="sticky top-0">
                    <tr>
                      <th>부품코드</th>
                      <th>색상</th>
                      <th className="text-right">누적 계획량</th>
                      <th className="text-right">행수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedItems.map((u, i) => (
                      <tr key={`${u.partCode}-${u.partColor}-${i}`}>
                        <td className="font-mono">{u.partCode}</td>
                        <td>
                          <span className="badge badge-gray">{u.partColor}</span>
                        </td>
                        <td className="text-right">{u.totalQty.toLocaleString()}</td>
                        <td className="text-right">{u.rowCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {groups.map((g) => {
          const assignment = supportAssignments.find((a) => a.group === g.group) ?? {
            group: g.group,
            targetLine: "" as SupportTargetLine,
            selectedCount: 0,
          };
          const confirmed =
            assignment.targetLine === ""
              ? 0
              : Math.max(0, Math.min(g.supportablePeople, assignment.selectedCount));
          return (
            <GroupCard
              key={g.group}
              row={g}
              targetLine={assignment.targetLine}
              selectedCount={assignment.selectedCount}
              confirmed={confirmed}
              onChangeTarget={(v) =>
                setSupportAssignment(g.group, { targetLine: v as SupportTargetLine })
              }
              onChangeCount={(v) =>
                setSupportAssignment(g.group, { selectedCount: v })
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function GroupCard({
  row,
  targetLine,
  selectedCount,
  confirmed,
  onChangeTarget,
  onChangeCount,
}: {
  row: DohoGroupLoad;
  targetLine: string;
  selectedCount: number;
  confirmed: number;
  onChangeTarget: (v: string) => void;
  onChangeCount: (v: number) => void;
}) {
  const judgement: "정상" | "잔업필요" | "지원가능" =
    row.diffHours < 0 ? "잔업필요" : row.supportablePeople > 0 ? "지원가능" : "정상";
  const judgementClass =
    judgement === "잔업필요"
      ? "badge-red"
      : judgement === "지원가능"
        ? "badge-blue"
        : "badge-green";
  const cardClass =
    judgement === "잔업필요"
      ? "border-rose-300 bg-rose-50/40"
      : judgement === "지원가능"
        ? "border-emerald-300 bg-emerald-50/40"
        : "";

  const supportDisabled = row.supportablePeople === 0;

  return (
    <div className={cn("card", cardClass)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{row.group}</h3>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <span className={cn("badge", judgementClass)}>{judgement}</span>
            {row.capa && (
              <span className="badge badge-gray">
                {row.group === "도장1라인" ? "13명" : row.group === "도장2라인" ? "8명" : ""} 8h 기준 {row.capa.toLocaleString()}로드바
              </span>
            )}
            {row.receivedSupportCount > 0 && (
              <span className="badge badge-blue">+{row.receivedSupportCount}명 지원</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">출근 / 기준</div>
          <div className="text-lg font-bold">
            {row.presentWorkers.length}
            {row.receivedSupportCount > 0 && (
              <span className="text-blue-600 text-sm">+{row.receivedSupportCount}</span>
            )}{" "}
            / {row.workers.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
        <Row label="출근작업자" value={row.presentWorkers.join(", ") || "-"} />
        <Row
          label="미출근자"
          value={row.absentWorkers.join(", ") || "-"}
          valueClass={row.absentWorkers.length > 0 ? "text-rose-700" : ""}
        />
      </div>

      {/* 도장1, 도장2 라인 전용: 로드바 분해 */}
      {row.totalLoadbarQty !== undefined && (
        <div className="rounded-md bg-slate-50 p-3 mb-3 text-sm">
          <div className="text-xs font-semibold text-slate-600 mb-2">로드바 수량</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <span className="text-slate-500">기본 (Σ ⌈계획량/품목수⌉)</span>
            <span className="text-right font-medium">
              {row.baseLoadbarQty?.toLocaleString()}개
            </span>
            <span className="text-slate-500">색상 변경 추가</span>
            <span className="text-right font-medium">
              +{row.colorChangeBars?.toLocaleString()}개
            </span>
            <span className="text-slate-500">품목 변경 추가</span>
            <span className="text-right font-medium">
              +{row.itemChangeBars?.toLocaleString()}개
            </span>
            <span className="text-slate-700 font-semibold border-t pt-1 mt-1">총 로드바</span>
            <span className="text-right font-bold text-blue-700 border-t pt-1 mt-1">
              {row.totalLoadbarQty.toLocaleString()}개
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
        <Row label="총부하시간" value={`${formatDecimal(row.totalLoadHours)}h`} />
        <Row label="가용시간" value={`${formatDecimal(row.availableHours)}h`} />
        <Row
          label="여유/부족"
          value={
            row.diffHours >= 0
              ? `+${formatDecimal(row.diffHours)}h`
              : `${formatDecimal(row.diffHours)}h`
          }
          valueClass={
            row.diffHours < 0
              ? "text-rose-700 font-semibold"
              : "text-emerald-700 font-semibold"
          }
        />
        <Row
          label="잔업필요인원 (3h)"
          value={
            row.overtimePeople > 0
              ? `${row.overtimePeople}명 (+${row.overtimePeople * 3}h)`
              : "0명"
          }
          valueClass={row.overtimePeople > 0 ? "text-rose-700 font-semibold" : ""}
        />
        <Row
          label="지원필요인원 (8h)"
          value={`${row.supportNeededPeople}명`}
          valueClass={row.supportNeededPeople > 0 ? "text-amber-700 font-semibold" : ""}
        />
        <Row
          label="지원가능인원"
          value={`${row.supportablePeople}명`}
          valueClass={row.supportablePeople > 0 ? "text-blue-700 font-semibold" : ""}
        />
      </div>

      {/* 색상별 분해 (도장1, 도장2) */}
      {row.colorBreakdown && row.colorBreakdown.length > 0 && (
        <div className="border-t border-slate-200 pt-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">색상별 분해</span>
            <span className="text-[10px] text-slate-400">생산수량 많은순</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base text-xs">
              <thead>
                <tr>
                  <th>색상</th>
                  {row.colorBreakdown.some((c) => c.isAuto !== undefined) && (
                    <th>분류</th>
                  )}
                  <th className="text-right">생산수량</th>
                  <th className="text-right">로드바수량</th>
                  <th className="text-right">품목수</th>
                </tr>
              </thead>
              <tbody>
                {row.colorBreakdown.map((c, idx) => {
                  const prev = idx > 0 ? row.colorBreakdown![idx - 1] : null;
                  // 자동 → 수동으로 넘어가는 첫 행에 구분선
                  const isFirstManual =
                    prev?.isAuto === true && c.isAuto === false;
                  return (
                    <tr
                      key={c.color}
                      className={cn(
                        isFirstManual && "border-t-2 border-t-slate-300",
                        c.isAuto === false && "bg-amber-50/40"
                      )}
                    >
                      <td>
                        <span className="badge badge-gray">{c.color}</span>
                      </td>
                      {row.colorBreakdown!.some((x) => x.isAuto !== undefined) && (
                        <td>
                          {c.isAuto === true && (
                            <span className="badge badge-blue">자동</span>
                          )}
                          {c.isAuto === false && (
                            <span className="badge badge-amber">수동</span>
                          )}
                          {c.isAuto === undefined && (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      )}
                      <td className="text-right">{c.productionQty.toLocaleString()}</td>
                      <td className="text-right font-medium">
                        {c.loadbarQty.toLocaleString()}
                      </td>
                      <td className="text-right">{c.itemCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 지원 배정 */}
      <div className="border-t border-slate-200 pt-3 grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-slate-500 block mb-1">지원대상라인</label>
          <select
            className="select"
            disabled={supportDisabled}
            value={targetLine}
            onChange={(e) => onChangeTarget(e.target.value)}
          >
            <option value="">선택 안 함</option>
            {SUPPORT_LINES.map((line) => (
              <option key={line} value={line}>
                {line}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">지원인원</label>
          <select
            className="select"
            disabled={supportDisabled || !targetLine}
            value={selectedCount}
            onChange={(e) => onChangeCount(Number(e.target.value))}
          >
            {Array.from({ length: row.supportablePeople + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i}명
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">확정지원인원</label>
          <div
            className={cn(
              "input bg-slate-50 text-slate-700 font-semibold",
              confirmed > 0 && "text-blue-700 bg-blue-50"
            )}
          >
            {confirmed}명
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceivingLineCard({
  rl,
  onChange,
}: {
  rl: ReceivingLineSummary;
  onChange: (group: string) => void;
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="badge badge-blue">{rl.line}</span>
        <span className="text-sm text-slate-700">에서 받은</span>
        <span className="font-bold text-blue-700">{rl.receivedCount}명</span>
        <ArrowRight className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-500">배치 그룹</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {DOHO_GROUP_OPTIONS.map((g) => {
          const active = rl.redirectGroup === g;
          return (
            <button
              key={g}
              onClick={() => onChange(g)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                active
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              )}
            >
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="contents">
      <div className="text-slate-500">{label}</div>
      <div className={cn("text-right font-medium text-slate-800", valueClass)}>
        {value}
      </div>
    </div>
  );
}
