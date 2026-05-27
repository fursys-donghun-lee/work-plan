"use client";

// 대림산업 현장 관리자 단순화 화면 (포장2라인 핵심 결정만)
// 1) 잔업 몇 명 (자동 계산 결과 — 라인통합)
// 2) 작업자 그룹 배치 (칩 클릭 → 드롭다운으로 이동)
// 3) 받은 지원 인원을 어느 그룹에 둘지 (드롭다운)
//
// 상세 분석은 [상세 보기]로 기존 /package2-line 으로 이동.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { computePackage2Load } from "@/lib/calc/package2Load";
import { computeDohoPaintLoad } from "@/lib/calc/dohoPaintLoad";
import { computeAll } from "@/lib/calc";
import { computeUrgentByGroup, getUrgentFor } from "@/lib/calc/urgentLoad";
import { ReallocationPlan } from "@/components/ReallocationPlan";
import { cn } from "@/lib/utils";
import {
  PACKAGE2_GROUPS,
  type PackagePosition,
  type SupportAssignment,
} from "@/lib/types";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  RotateCcw,
  UserCheck,
} from "lucide-react";

const DRAG_TYPE_EMP = "application/x-empcode";
const DRAG_TYPE_SUPPORT = "application/x-supportslot";

export function DaerimFloorView() {
  const hydrated = useHydrated();
  const packagePosition = useDataStore((s) => s.packagePosition);
  const packageLoad = useDataStore((s) => s.packageLoad);
  const attendance = useDataStore((s) => s.attendance);
  const overrides = useDataStore((s) => s.package2WorkerOverrides);
  const setOverride = useDataStore((s) => s.setPackage2WorkerOverride);
  const clearOverride = useDataStore((s) => s.clearPackage2WorkerOverride);
  const supportPlacements = useDataStore((s) => s.package2SupportPlacements);
  const setSupportPlacement = useDataStore((s) => s.setPackage2SupportPlacement);
  const clearSupportPlacement = useDataStore(
    (s) => s.clearPackage2SupportPlacement
  );
  const workDate = useDataStore((s) => s.workDate);
  const overtimeConfirmed = useDataStore((s) => s.overtimeConfirmed);
  const toggleOvertimeConfirmed = useDataStore((s) => s.toggleOvertimeConfirmed);
  const resetOverrides = useDataStore((s) => s.resetPackage2WorkerOverrides);
  const resetSupportPlacements = useDataStore(
    (s) => s.resetPackage2SupportPlacements
  );

  const employees = useDataStore((s) => s.employees);
  const equipment = useDataStore((s) => s.equipment);
  const loadPlan = useDataStore((s) => s.loadPlan);
  const loadBar = useDataStore((s) => s.loadBar);
  const paintPlan = useDataStore((s) => s.paintPlan);
  const supportAssignments = useDataStore((s) => s.supportAssignments);
  const supportRedirects = useDataStore((s) => s.supportRedirects);
  const workGroups = useDataStore((s) => s.workGroups);
  const lineBase = useDataStore((s) => s.lineBase);
  const urgentProduction = useDataStore((s) => s.urgentProduction);

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
    [
      paintPlan,
      loadPlan,
      loadBar,
      employees,
      attendance,
      supportAssignments,
      supportRedirects,
    ]
  );

  // 다른 회사 그룹들의 supportablePeople 통합 (포장2라인 받기 confirmed 계산)
  const supportableMap = new Map<string, number>();
  woosungAll.groupLoad.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );
  dohoLoad.groups.forEach((g) =>
    supportableMap.set(g.group, g.supportablePeople)
  );

  const confirmedFor = (a: SupportAssignment): number => {
    if (!a.targetLine || a.selectedCount <= 0) return 0;
    const sup = supportableMap.get(a.group) ?? 0;
    return Math.max(0, Math.min(sup, a.selectedCount));
  };

  // 받은 지원 슬롯
  const receivedSlots: { fromGroup: string }[] = [];
  for (const a of supportAssignments) {
    if (a.targetLine !== "포장2라인") continue;
    const cnt = confirmedFor(a);
    for (let i = 0; i < cnt; i++) {
      receivedSlots.push({ fromGroup: a.group });
    }
  }
  const totalSupportCount = receivedSlots.length;

  const result = useMemo(
    () =>
      computePackage2Load({
        packagePosition,
        packageLoad,
        attendance,
        overrides,
        supportPlacements,
        totalSupportCount,
        employees,
        lineBase,
      }),
    [
      packagePosition,
      packageLoad,
      attendance,
      overrides,
      supportPlacements,
      totalSupportCount,
      employees,
      lineBase,
    ]
  );

  const urgentMap = useMemo(
    () => computeUrgentByGroup(urgentProduction, workDate),
    [urgentProduction, workDate]
  );

  // 드래그 앤 드롭 상태
  const [draggingEmp, setDraggingEmp] = useState<string | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);

  if (!hydrated) return null;

  const missing: string[] = [];
  if (packagePosition.length === 0) missing.push("포장라인 기본근무위치");
  if (attendance.length === 0) missing.push("근태");
  if (packageLoad.length === 0) missing.push("라인별 포장 부하");

  if (missing.length > 0) {
    return (
      <EmptyState
        title="자료가 부족합니다"
        description={`다음 자료를 먼저 업로드해주세요: ${missing.join(" / ")}`}
        ctaLabel="일일자료 업로드"
        ctaHref="/upload"
      />
    );
  }

  const { groups, unassignedMembers } = result;

  // 라인 전체(피더 포함) 출근 합계
  const allPresent = groups.reduce((s, g) => s + g.presentMembers.length, 0);

  // 직접그룹(피더 제외) 라인통합 잔업 계산
  const directGroups = groups.filter((g) => g.group !== "피더");
  const totalPresentDirect = directGroups.reduce(
    (s, g) => s + g.presentMembers.length,
    0
  );
  const totalLoad = directGroups.reduce((s, g) => s + g.loadHours, 0);
  const lineAvail = totalPresentDirect * 8;
  const lineDiff = Math.round((lineAvail - totalLoad) * 10) / 10;
  const lineShortage = lineDiff < 0 ? Math.abs(lineDiff) : 0;
  const totalOvertime =
    lineShortage > 0
      ? Math.min(Math.ceil(lineShortage / 3), totalPresentDirect)
      : 0;

  // 잔업확정 = 이 라인 직원 중 overtimeConfirmed 에 등록된 사원 수
  const visibleEmpCodes = new Set(
    groups.flatMap((g) => g.members.map((m) => m.empCode))
  );
  const overtimeConfirmedSet = new Set(overtimeConfirmed);
  const totalOvertimeConfirmed = overtimeConfirmed.filter((c) =>
    visibleEmpCodes.has(c)
  ).length;

  // 지원인원 = 받은 - 보낸 (대림 그룹에서 보낸 인원은 보통 0)
  const sentFromThisLine = supportAssignments.reduce((s, a) => {
    if ((PACKAGE2_GROUPS as readonly string[]).includes(a.group)) {
      return s + confirmedFor(a);
    }
    return s;
  }, 0);
  const supportNet = totalSupportCount - sentFromThisLine;

  const totalUrgentD1 = directGroups.reduce(
    (s, g) => s + getUrgentFor(urgentMap, g.group).dMinus1,
    0
  );
  const totalUrgentD2 = directGroups.reduce(
    (s, g) => s + getUrgentFor(urgentMap, g.group).dMinus2,
    0
  );

  // 그룹 선택 옵션 (받은 지원 슬롯 드롭다운용 — 피더 포함 전체)
  const groupOptions = PACKAGE2_GROUPS as readonly string[];

  // 지원 슬롯 → 그룹 배치 변경
  const handleSlotChange = (slotIdx: number, target: string) => {
    if (target === "") clearSupportPlacement(slotIdx);
    else setSupportPlacement(slotIdx, target);
  };

  // 드래그 핸들러 (직원 + 지원 슬롯)
  const handleDragStart = (e: React.DragEvent, empCode: string) => {
    e.dataTransfer.setData(DRAG_TYPE_EMP, empCode);
    e.dataTransfer.effectAllowed = "move";
    setDraggingEmp(empCode);
  };
  const handleDragEnd = () => {
    setDraggingEmp(null);
    setHoverGroup(null);
  };
  const handleSlotDragStart = (e: React.DragEvent, slotIdx: number) => {
    e.dataTransfer.setData(DRAG_TYPE_SUPPORT, String(slotIdx));
    e.dataTransfer.effectAllowed = "move";
    setDraggingSlot(slotIdx);
  };
  const handleSlotDragEnd = () => {
    setDraggingSlot(null);
    setHoverGroup(null);
  };
  const handleDragOver = (e: React.DragEvent, group: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverGroup !== group) setHoverGroup(group);
  };
  const handleDragLeave = (group: string) => {
    if (hoverGroup === group) setHoverGroup(null);
  };
  const handleDrop = (e: React.DragEvent, targetGroup: string) => {
    e.preventDefault();
    const slotIdxStr = e.dataTransfer.getData(DRAG_TYPE_SUPPORT);
    if (slotIdxStr) {
      const idx = Number(slotIdxStr);
      if (Number.isInteger(idx) && idx >= 0 && idx < totalSupportCount) {
        setSupportPlacement(idx, targetGroup);
      }
      setDraggingSlot(null);
      setHoverGroup(null);
      return;
    }
    const empCode = e.dataTransfer.getData(DRAG_TYPE_EMP);
    if (!empCode) return;
    const emp = packagePosition.find((p) => p.empCode === empCode);
    if (!emp) return;
    if (emp.position === targetGroup) clearOverride(empCode);
    else setOverride(empCode, targetGroup);
    setDraggingEmp(null);
    setHoverGroup(null);
  };

  // 기본 배치로 새로고침
  const handleResetAll = () => {
    if (
      window.confirm(
        "모든 인원을 기본 근무위치로 되돌리고 받은 지원 배치도 초기화합니다. 계속할까요?"
      )
    ) {
      resetOverrides();
      resetSupportPlacements();
    }
  };
  const overrideCount = Object.keys(overrides).length;
  const placementCount = supportPlacements.filter((p) => p).length;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            대림산업 · 포장2라인
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자{" "}
            <span className="font-semibold">{workDate || "(미지정)"}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetAll}
            disabled={overrideCount === 0 && placementCount === 0}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
              overrideCount === 0 && placementCount === 0
                ? "border-slate-200 text-slate-400 cursor-not-allowed"
                : "border-slate-300 text-slate-700 hover:bg-slate-100"
            )}
            title="모든 인원을 기본근무위치로, 받은 지원 배치 초기화"
          >
            <RotateCcw className="w-4 h-4" />
            기본 배치로 새로고침
            {(overrideCount > 0 || placementCount > 0) && (
              <span className="text-xs text-slate-500">
                (이동 {overrideCount}, 지원 {placementCount})
              </span>
            )}
          </button>
          <Link
            href="/package2-line"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
          >
            상세 보기
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* 핵심 5 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        <BigStat
          icon={<UserCheck />}
          label="출근인원"
          value={`${allPresent}명`}
          tone="green"
        />
        <BigStat
          icon={<Clock />}
          label="잔업필요"
          value={totalOvertime > 0 ? `${totalOvertime}명` : "없음"}
          tone={totalOvertime > 0 ? "red" : "gray"}
        />
        <BigStat
          icon={<CheckCircle2 />}
          label="잔업확정"
          value={`${totalOvertimeConfirmed}명`}
          tone={totalOvertimeConfirmed > 0 ? "amber" : "gray"}
        />
        <BigStat
          icon={<ArrowRightLeft />}
          label="지원인원"
          value={
            supportNet > 0
              ? `+${supportNet}명`
              : supportNet < 0
                ? `${supportNet}명`
                : "0명"
          }
          tone={supportNet !== 0 ? "blue" : "gray"}
        />
        <BigStat
          icon={<AlertCircle />}
          label="긴급건"
          value={
            totalUrgentD1 + totalUrgentD2 > 0
              ? `D-1 ${totalUrgentD1}건 / D-2 ${totalUrgentD2}건`
              : "없음"
          }
          tone={totalUrgentD1 + totalUrgentD2 > 0 ? "amber" : "gray"}
        />
      </div>

      {/* 받은 지원 배치 패널 */}
      {totalSupportCount > 0 && (
        <div className="card border-blue-200 bg-blue-50/30">
          <h2 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
            받은 지원 {totalSupportCount}명 — 어느 그룹으로?
            <span className="text-xs font-normal text-slate-500">
              (드래그 또는 드롭다운)
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {receivedSlots.map((slot, idx) => {
              const placed = supportPlacements[idx] ?? "";
              const isDragging = draggingSlot === idx;
              return (
                <div
                  key={idx}
                  draggable={!placed}
                  onDragStart={(e) => handleSlotDragStart(e, idx)}
                  onDragEnd={handleSlotDragEnd}
                  className={cn(
                    "bg-white border border-blue-200 rounded-md p-2 flex items-center gap-2 shadow-sm",
                    !placed && "cursor-grab active:cursor-grabbing",
                    isDragging && "opacity-40"
                  )}
                  title={!placed ? "드래그해서 그룹에 배치" : undefined}
                >
                  <span className="text-xs text-slate-500">
                    {slot.fromGroup}
                  </span>
                  <span className="text-slate-300">→</span>
                  <select
                    className="select py-1 text-sm font-medium"
                    value={placed}
                    onChange={(e) => handleSlotChange(idx, e.target.value)}
                  >
                    <option value="">미배치</option>
                    {groupOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 그룹별 카드 (간소화 — 출근 / 부하 / 잔업 / 작업자) */}
      <div>
        <h2 className="font-semibold text-slate-900 mb-2">그룹별 배치</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((g) => {
            const urgent = getUrgentFor(urgentMap, g.group);
            const overtime = g.diffHours < 0 ? g.overtimePeople : 0;
            const placedSlots = supportPlacements
              .map((target, idx) => ({ target, idx }))
              .filter(
                ({ target, idx }) =>
                  target === g.group && idx < totalSupportCount
              );
            const isHover = hoverGroup === g.group;
            return (
              <div
                key={g.group}
                onDragOver={(e) => handleDragOver(e, g.group)}
                onDragLeave={() => handleDragLeave(g.group)}
                onDrop={(e) => handleDrop(e, g.group)}
                className={cn(
                  "card transition-colors",
                  isHover && "border-blue-400 ring-2 ring-blue-200 bg-blue-50/30",
                  !isHover && overtime > 0 && "border-rose-200 bg-rose-50/30",
                  !isHover &&
                    urgent.dMinus1 > 0 &&
                    "border-rose-300 bg-rose-50/50"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-slate-900">{g.group}</h3>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {urgent.dMinus1 > 0 && (
                      <span className="badge badge-red">
                        D-1 {urgent.dMinus1}건
                      </span>
                    )}
                    {urgent.dMinus2 > 0 && (
                      <span className="badge badge-amber">
                        D-2 {urgent.dMinus2}건
                      </span>
                    )}
                    {placedSlots.length > 0 && (
                      <span className="badge badge-blue">
                        +{placedSlots.length} 지원
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                  <Metric
                    label="출근"
                    value={`${g.presentMembers.length}/${g.members.length}`}
                  />
                  <Metric
                    label="부하"
                    value={`${Math.round(g.loadHours * 10) / 10}h`}
                  />
                  <Metric
                    label="잔업"
                    value={overtime > 0 ? `+${overtime}명` : "-"}
                    danger={overtime > 0}
                  />
                </div>

                {/* 작업자 칩 */}
                <div className="border-t border-slate-200 pt-2 min-h-[2rem]">
                  {g.members.length === 0 && placedSlots.length === 0 ? (
                    <div className="text-xs text-slate-400 italic py-1 text-center">
                      배치 인원 없음
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {g.members.map((m) => (
                        <WorkerChipSimple
                          key={m.empCode}
                          worker={m}
                          isPresent={g.presentMembers.includes(m)}
                          isOverridden={!!overrides[m.empCode]}
                          overtimeOn={overtimeConfirmedSet.has(m.empCode)}
                          onToggleOvertime={() =>
                            toggleOvertimeConfirmed(m.empCode)
                          }
                          isDragging={draggingEmp === m.empCode}
                          onDragStart={(e) => handleDragStart(e, m.empCode)}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                      {placedSlots.map((slot) => (
                        <span
                          key={`slot-${slot.idx}`}
                          draggable
                          onDragStart={(e) => handleSlotDragStart(e, slot.idx)}
                          onDragEnd={handleSlotDragEnd}
                          className={cn(
                            "px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium cursor-grab active:cursor-grabbing select-none",
                            draggingSlot === slot.idx && "opacity-40"
                          )}
                          title="다른 그룹으로 드래그"
                        >
                          지원 {slot.idx + 1}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 시간대별 재배치 계획 */}
      <ReallocationPlan
        groups={directGroups.map((g) => ({
          name: g.group,
          loadHours: g.loadHours,
          headcount: g.presentMembers.length + g.supportCount,
        }))}
        startTime={8.5}
      />

      {/* 미배치 인원 (간단 안내) */}
      {unassignedMembers.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/40">
          <h3 className="font-semibold text-amber-900 mb-2 text-sm">
            미배치 직원 {unassignedMembers.length}명
          </h3>
          <div className="flex flex-wrap gap-1">
            {unassignedMembers.map((m) => (
              <WorkerChipSimple
                key={m.empCode}
                worker={m}
                isPresent={attendance.some(
                  (a) => a.empCode === m.empCode && a.isPresent
                )}
                isOverridden={false}
                overtimeOn={overtimeConfirmedSet.has(m.empCode)}
                onToggleOvertime={() => toggleOvertimeConfirmed(m.empCode)}
                isDragging={draggingEmp === m.empCode}
                onDragStart={(e) => handleDragStart(e, m.empCode)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BigStat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "red" | "green" | "blue" | "amber" | "gray";
}) {
  const toneClass: Record<string, string> = {
    default: "bg-white text-slate-900 border-slate-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    gray: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <div className={cn("card flex items-center gap-3 p-4", toneClass[tone])}>
      <div className="opacity-70">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide opacity-70">
          {label}
        </div>
        <div className="text-xl font-bold leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-400 tracking-wide">
        {label}
      </div>
      <div
        className={cn(
          "font-semibold",
          danger ? "text-rose-700" : "text-slate-800"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function WorkerChipSimple({
  worker,
  isPresent,
  isOverridden,
  overtimeOn,
  onToggleOvertime,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  worker: PackagePosition;
  isPresent: boolean;
  isOverridden: boolean;
  overtimeOn: boolean;
  onToggleOvertime: () => void;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs cursor-grab active:cursor-grabbing select-none",
        isDragging && "opacity-40",
        overtimeOn && isPresent
          ? "border-amber-400 bg-amber-50"
          : isPresent
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 bg-slate-50 text-slate-400 line-through"
      )}
      title={
        isOverridden
          ? `기본위치 ${worker.position} → 수동 배치 (드래그로 이동)`
          : `${worker.position} (드래그로 이동)`
      }
    >
      <span
        className={cn(
          "font-medium",
          isOverridden && "text-blue-700",
          !isPresent && "text-slate-400"
        )}
      >
        {worker.name}
      </span>
      {isPresent && (
        <button
          type="button"
          onClick={onToggleOvertime}
          className={cn(
            "text-[10px] px-1 rounded font-medium transition-colors",
            overtimeOn
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
          )}
          title={overtimeOn ? "잔업 확정 해제" : "잔업 확정"}
        >
          잔업{overtimeOn ? " ✓" : ""}
        </button>
      )}
    </div>
  );
}
