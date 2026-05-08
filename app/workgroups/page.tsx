"use client";

import { useComputed, useHydrated } from "@/components/useComputed";
import { useDataStore } from "@/lib/store/useDataStore";
import { EmptyState } from "@/components/EmptyState";
import { CompanyGate, CompanyNotApplicable } from "@/components/CompanyGate";
import { cn, formatDecimal } from "@/lib/utils";
import { SUPPORT_LINES, type SupportTargetLine } from "@/lib/types";
import { Plus, X } from "lucide-react";

export default function WorkGroupsPage() {
  return (
    <CompanyGate>
      <WorkGroupsContent />
    </CompanyGate>
  );
}

function WorkGroupsContent() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);
  if (!hydrated) return null;
  if (company === "다호산업") {
    return (
      <CompanyNotApplicable
        company="다호산업"
        message={"다호산업은 작업그룹 부하 계산을 사용하지 않습니다.\n메인 대시보드에서 소속별 출근 현황을 확인하세요."}
      />
    );
  }
  return <WoosungWorkGroups />;
}

function WoosungWorkGroups() {
  const computed = useComputed();
  const supportAssignments = useDataStore((s) => s.supportAssignments);
  const addSupportRow = useDataStore((s) => s.addSupportRow);
  const updateSupportRow = useDataStore((s) => s.updateSupportRow);
  const deleteSupportRow = useDataStore((s) => s.deleteSupportRow);
  const employeesCount = useDataStore((s) => s.employees.length);
  const equipmentCount = useDataStore((s) => s.equipment.length);
  const attendanceCount = useDataStore((s) => s.attendance.length);
  const loadPlanCount = useDataStore((s) => s.loadPlan.length);

  if (!computed) return null;

  if (
    employeesCount === 0 ||
    equipmentCount === 0 ||
    attendanceCount === 0 ||
    loadPlanCount === 0
  ) {
    return (
      <EmptyState
        title="데이터를 먼저 업로드해주세요"
        description="기준자료(근무기준·설비기준)와 일일자료(근태·라인별 공정 부하)를 모두 업로드한 뒤 그룹별 부하를 확인할 수 있습니다."
        ctaLabel="업로드 페이지로"
        ctaHref="/upload"
      />
    );
  }

  const { groupLoad, indirectOvertimePeople, indirectIsPresent } = computed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">그룹별 부하 / 지원 배정</h1>
        <p className="text-sm text-slate-500 mt-1">
          작업그룹별 부하시간과 지원가능인원을 확인하고, 지원대상라인 / 지원인원을 선택하면 메인 대시보드에 즉시 반영됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {groupLoad.map((row) => {
          // 이 그룹의 모든 지원 행 (분할 지원)
          const groupRows = supportAssignments.filter((a) => a.group === row.group);
          // 빈 행이 하나도 없으면 기본 1개 보여주기 위한 기본값
          const displayRows =
            groupRows.length > 0
              ? groupRows
              : [
                  {
                    id: undefined,
                    group: row.group,
                    targetLine: "" as SupportTargetLine,
                    selectedCount: 0,
                  },
                ];
          // 각 행 confirmed 계산: 그룹 supportable 을 행 순서대로 분배
          let remainingSupportable = row.supportablePeople;
          const confirmedByRow = displayRows.map((r) => {
            if (!r.targetLine || r.selectedCount <= 0) return 0;
            const give = Math.min(r.selectedCount, remainingSupportable);
            remainingSupportable -= give;
            return Math.max(0, give);
          });
          const totalConfirmed = confirmedByRow.reduce((s, c) => s + c, 0);
          const canAddMore = totalConfirmed < row.supportablePeople;
          const supportDisabled = row.supportablePeople === 0;

          return (
            <div
              key={row.group}
              className={cn(
                "card",
                row.judgement === "잔업필요" && "border-rose-300 bg-rose-50/40",
                row.judgement === "지원가능" && "border-emerald-300 bg-emerald-50/40"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{row.group}</h3>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    <Badge tone={getToneForJudgement(row.judgement)}>{row.judgement}</Badge>
                    <Badge tone="gray">최소 {row.minPeople}명</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">출근 / 기준</div>
                  <div className="text-lg font-bold">
                    <span
                      className={cn(
                        row.presentWorkers.length < row.minPeople && "text-rose-700"
                      )}
                    >
                      {row.presentWorkers.length}
                    </span>{" "}
                    / {row.workers.length}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-4">
                <Row label="출근작업자" value={row.presentWorkers.join(", ") || "-"} />
                <Row
                  label="미출근자"
                  value={row.absentWorkers.join(", ") || "-"}
                  valueClass={row.absentWorkers.length > 0 ? "text-rose-700" : ""}
                />
                <Row label="총부하시간" value={`${formatDecimal(row.totalLoadHours)}h`} />
                <Row label="가용시간" value={`${formatDecimal(row.availableHours)}h`} />
                <Row
                  label="여유/부족"
                  value={
                    row.diffHours >= 0
                      ? `+${formatDecimal(row.diffHours)}h`
                      : `${formatDecimal(row.diffHours)}h`
                  }
                  valueClass={row.diffHours < 0 ? "text-rose-700 font-semibold" : "text-emerald-700 font-semibold"}
                />
                <Row
                  label="잔업필요인원"
                  value={`${row.overtimePeople}명`}
                  valueClass={row.overtimePeople > 0 ? "text-rose-700 font-semibold" : ""}
                />
                <Row
                  label="지원가능인원"
                  value={`${row.supportablePeople}명`}
                  valueClass={row.supportablePeople > 0 ? "text-blue-700 font-semibold" : ""}
                />
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-500">
                    지원 배정 (확정 {totalConfirmed} / 지원가능 {row.supportablePeople}명)
                  </label>
                  {canAddMore && !supportDisabled && (
                    <button
                      onClick={() => addSupportRow(row.group)}
                      className="btn btn-secondary text-xs"
                    >
                      <Plus className="w-3 h-3" />
                      라인 추가
                    </button>
                  )}
                </div>
                {displayRows.map((r, rIdx) => {
                  const conf = confirmedByRow[rIdx] ?? 0;
                  const isStored = !!r.id;
                  return (
                    <div
                      key={r.id ?? `default-${rIdx}`}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end"
                    >
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">
                          지원대상라인 {displayRows.length > 1 && `#${rIdx + 1}`}
                        </label>
                        <select
                          className="select"
                          disabled={supportDisabled}
                          value={r.targetLine}
                          onChange={(e) => {
                            const targetLine = e.target.value as SupportTargetLine;
                            if (isStored) {
                              updateSupportRow(r.id!, { targetLine });
                            } else {
                              // 첫 입력 — 기본 행을 store에 저장
                              addSupportRow(row.group);
                              // 마지막에 추가된 row 의 id 를 다음 렌더에서 받아 처리
                              setTimeout(() => {
                                const all = useDataStore.getState().supportAssignments;
                                const newest = [...all]
                                  .reverse()
                                  .find((x) => x.group === row.group && !x.targetLine);
                                if (newest?.id) {
                                  updateSupportRow(newest.id, { targetLine });
                                }
                              }, 0);
                            }
                          }}
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
                        <label className="text-[10px] text-slate-400 block mb-0.5">인원</label>
                        <select
                          className="select w-20"
                          disabled={supportDisabled || !r.targetLine}
                          value={r.selectedCount}
                          onChange={(e) => {
                            const cnt = Number(e.target.value);
                            if (isStored && r.id) {
                              updateSupportRow(r.id, { selectedCount: cnt });
                            }
                          }}
                        >
                          {Array.from(
                            { length: row.supportablePeople + 1 },
                            (_, i) => (
                              <option key={i} value={i}>
                                {i}명
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">확정</label>
                        <div
                          className={cn(
                            "input bg-slate-50 text-slate-700 font-semibold w-20 text-center",
                            conf > 0 && "text-blue-700 bg-blue-50"
                          )}
                        >
                          {conf}명
                        </div>
                      </div>
                      <div>
                        {displayRows.length > 1 && isStored && (
                          <button
                            onClick={() => deleteSupportRow(r.id!)}
                            className="btn btn-danger mb-0"
                            title="이 행 삭제"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 간접인원 카드 */}
      <div className="card">
        <h3 className="font-bold text-slate-900 mb-2">간접인원 (김진규)</h3>
        <p className="text-sm text-slate-600">
          {indirectIsPresent ? "출근" : "미출근"} —{" "}
          {indirectOvertimePeople > 0
            ? "작업그룹 잔업이 발생하여 간접 잔업 1명이 자동 반영됩니다."
            : "현재 작업그룹 잔업이 없어 간접 잔업 인원이 없습니다."}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="contents">
      <div className="text-slate-500">{label}</div>
      <div className={cn("text-right font-medium text-slate-800", valueClass)}>{value}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  const map: Record<string, string> = {
    red: "badge badge-red",
    blue: "badge badge-blue",
    green: "badge badge-green",
    gray: "badge badge-gray",
    amber: "badge badge-amber",
  };
  return <span className={map[tone] ?? map.gray}>{children}</span>;
}

function getToneForJudgement(j: string): string {
  if (j === "잔업필요") return "red";
  if (j === "지원가능") return "blue";
  return "green";
}
