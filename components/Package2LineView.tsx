"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { AlertBanner, type AlertItem } from "@/components/Alerts";
import { computePackage2Load } from "@/lib/calc/package2Load";
import { computeDohoPaintLoad } from "@/lib/calc/dohoPaintLoad";
import { computeAll } from "@/lib/calc";
import { computeUrgentByGroup, getUrgentFor } from "@/lib/calc/urgentLoad";
import { cn, formatDecimal } from "@/lib/utils";
import {
  PACKAGE2_GROUPS,
  type Package2Group,
  type Package2GroupLoad,
  type PackagePosition,
  type SupportAssignment,
} from "@/lib/types";
import {
  AlertCircle,
  ArrowRightLeft,
  Clock,
  GripVertical,
  Link2,
  Link2Off,
  Plus,
  RotateCcw,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";


// 드래그 데이터 타입
const DRAG_TYPE_EMP = "application/x-empcode";
const DRAG_TYPE_SUPPORT = "application/x-supportslot";

export function Package2LineView() {
  const hydrated = useHydrated();
  const packagePosition = useDataStore((s) => s.packagePosition);
  const packageLoad = useDataStore((s) => s.packageLoad);
  const attendance = useDataStore((s) => s.attendance);
  const overrides = useDataStore((s) => s.package2WorkerOverrides);
  const setOverride = useDataStore((s) => s.setPackage2WorkerOverride);
  const clearOverride = useDataStore((s) => s.clearPackage2WorkerOverride);
  const resetOverrides = useDataStore((s) => s.resetPackage2WorkerOverrides);
  const supportPlacements = useDataStore((s) => s.package2SupportPlacements);
  const setSupportPlacement = useDataStore((s) => s.setPackage2SupportPlacement);
  const clearSupportPlacement = useDataStore((s) => s.clearPackage2SupportPlacement);
  const groupMerges = useDataStore((s) => s.package2GroupMerges);
  const addGroupMerge = useDataStore((s) => s.addPackage2GroupMerge);
  const removeGroupMerge = useDataStore((s) => s.removePackage2GroupMerge);
  const workDate = useDataStore((s) => s.workDate);

  // 다른 라인에서 들어온 지원 인원 = supportAssignments 의 confirmed 합 (targetLine = 포장2라인)
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

  const urgentMap = useMemo(
    () => computeUrgentByGroup(urgentProduction, workDate),
    [urgentProduction, workDate]
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

  // 다른 회사 그룹들의 supportablePeople 통합 (포장2라인이 받는 confirmed 계산용)
  // 본인 package1 그룹은 굳이 포함 안 해도 됨 (포장2라인 → 포장2라인 받기는 없음)
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

  // 받은 지원 슬롯 목록 (각 슬롯이 어디서 왔는지 정보 포함)
  const receivedSlots: { fromGroup: string }[] = [];
  for (const a of supportAssignments) {
    if (a.targetLine !== "포장2라인") continue;
    const cnt = confirmedFor(a);
    for (let i = 0; i < cnt; i++) {
      receivedSlots.push({ fromGroup: a.group });
    }
  }
  const totalSupportCount = receivedSlots.length;

  const [draggingEmp, setDraggingEmp] = useState<string | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);

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
    [packagePosition, packageLoad, attendance, overrides, supportPlacements, totalSupportCount]
  );

  if (!hydrated) return null;

  const missing: string[] = [];
  if (packagePosition.length === 0) missing.push("포장라인 기본근무위치");
  if (attendance.length === 0) missing.push("근태");
  if (packageLoad.length === 0) missing.push("라인별 포장 부하");

  if (missing.length > 0) {
    return (
      <EmptyState
        title="데이터를 먼저 업로드해주세요"
        description={`현재 미업로드: ${missing.join(", ")}\n\n포장2라인 부하는 포장라인 기본근무위치(기준자료) + 근태 + 라인별 포장 부하(일일자료)가 필요합니다.`}
        ctaLabel={
          missing.includes("포장라인 기본근무위치") ? "기준자료 업로드" : "일일자료 업로드"
        }
        ctaHref={
          missing.includes("포장라인 기본근무위치") ? "/master-data" : "/upload"
        }
      />
    );
  }

  const { groups, unassignedMembers } = result;
  const overrideCount = Object.keys(overrides).length;

  // 간접 그룹 (피더) - 가용시간/부하시간 합계에서 제외
  const INDIRECT_GROUPS = new Set<string>(["피더"]);
  const directGroups = groups.filter((g) => !INDIRECT_GROUPS.has(g.group));
  const indirectGroups = groups.filter((g) => INDIRECT_GROUPS.has(g.group));

  const directPresent = directGroups.reduce(
    (s, g) => s + g.presentMembers.length,
    0
  );
  const indirectPresent = indirectGroups.reduce(
    (s, g) => s + g.presentMembers.length,
    0
  );
  const totalPresent = directPresent + indirectPresent;
  // 직접 그룹의 받은 지원인원 합 (가용시간 + 잔업 한도에 반영)
  const directSupportCount = directGroups.reduce(
    (s, g) => s + g.supportCount,
    0
  );

  // 직접 그룹의 부하시간만 합산 (간접인 피더는 부하 계산 제외)
  const totalLoadHours =
    Math.round(directGroups.reduce((s, g) => s + g.loadHours, 0) * 10) / 10;
  // 가용시간은 (직접 출근 + 받은 지원인원) × 8h
  const totalAvailableHours = (directPresent + directSupportCount) * 8;
  const totalDiff = Math.round((totalAvailableHours - totalLoadHours) * 10) / 10;
  const shortage = totalDiff < 0 ? Math.abs(totalDiff) : 0;
  // 잔업필요 = 올림(부족/3), 라인 전체 출근인원(직접+간접) 한도
  const totalOvertimePeople =
    shortage > 0
      ? Math.min(Math.ceil(shortage / 3), totalPresent)
      : 0;
  const overtimeCovered = totalOvertimePeople * 3;
  const remainingShortage = Math.max(
    0,
    Math.round((shortage - overtimeCovered) * 10) / 10
  );
  const totalSupportNeeded =
    remainingShortage > 0 ? Math.ceil(remainingShortage / 8) : 0;

  const alerts: AlertItem[] = [];
  if (unassignedMembers.length > 0) {
    alerts.push({
      level: "info",
      message: `기본근무위치가 그룹과 일치하지 않는 직원 ${unassignedMembers.length}명`,
      detail: unassignedMembers
        .map((m) => `${m.name}(${m.position || "(없음)"})`)
        .join(", "),
    });
  }

  const handleDragStart = (e: React.DragEvent, empCode: string) => {
    e.dataTransfer.setData(DRAG_TYPE_EMP, empCode);
    e.dataTransfer.effectAllowed = "move";
    setDraggingEmp(empCode);
  };
  const handleDragEnd = () => {
    setDraggingEmp(null);
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
    // 슬롯 드래그인지 직원 드래그인지 구분
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
    if (emp.position === targetGroup) {
      clearOverride(empCode);
    } else {
      setOverride(empCode, targetGroup);
    }
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
  const handleUnassignedDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleUnassignedDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const slotIdxStr = e.dataTransfer.getData(DRAG_TYPE_SUPPORT);
    if (!slotIdxStr) return;
    const idx = Number(slotIdxStr);
    if (Number.isInteger(idx)) clearSupportPlacement(idx);
    setDraggingSlot(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">포장2라인 부하</h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자: <span className="font-semibold">{workDate || "(미지정)"}</span>
            <span className="ml-3 text-slate-400">
              인원 카드를 다른 그룹으로 드래그하여 이동할 수 있습니다.
            </span>
          </p>
        </div>
        {overrideCount > 0 && (
          <button className="btn btn-secondary" onClick={resetOverrides}>
            <RotateCcw className="w-4 h-4" />
            기본 배치로 초기화 ({overrideCount}건)
          </button>
        )}
      </div>

      <AlertBanner items={alerts} />

      {/* 라인 전체 요약 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-slate-900">포장2라인 전체</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              피더는 간접인원으로 가용시간 / 부하시간 계산에서 제외됩니다.
            </p>
          </div>
          <div className="flex gap-1.5">
            {shortage > 0 && <span className="badge badge-red">잔업 필요</span>}
            {shortage === 0 && totalLoadHours > 0 && (
              <span className="badge badge-green">정상</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <SummaryStat
            icon={<Users className="w-5 h-5" />}
            label="전체"
            value={`${totalPresent}명`}
          />
          <SummaryStat
            icon={<UserCheck className="w-5 h-5" />}
            label="직접출근"
            value={`${directPresent}명`}
            tone="green"
          />
          <SummaryStat
            icon={<UserCheck className="w-5 h-5" />}
            label="간접출근"
            value={`${indirectPresent}명`}
            tone="gray"
          />
          <SummaryStat
            icon={<Clock className="w-5 h-5" />}
            label="가용시간"
            value={`${formatDecimal(totalAvailableHours)}h`}
          />
          <SummaryStat
            icon={<Clock className="w-5 h-5" />}
            label="총 부하시간"
            value={`${formatDecimal(totalLoadHours)}h`}
          />
          <SummaryStat
            icon={<ArrowRightLeft className="w-5 h-5" />}
            label="여유/부족"
            value={
              totalDiff >= 0
                ? `+${formatDecimal(totalDiff)}h`
                : `${formatDecimal(totalDiff)}h`
            }
            tone={totalDiff < 0 ? "red" : "green"}
          />
          <SummaryStat
            icon={<AlertCircle className="w-5 h-5" />}
            label="잔업필요 (3h)"
            value={
              totalOvertimePeople > 0
                ? `${totalOvertimePeople}명 (+${overtimeCovered}h)`
                : "0명"
            }
            tone={totalOvertimePeople > 0 ? "red" : "gray"}
          />
        </div>
        {totalSupportNeeded > 0 && (
          <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            잔업({totalOvertimePeople}명 × 3h = {overtimeCovered}h)으로도 부족한
            잔여 {formatDecimal(remainingShortage)}h → 추가 지원필요 인원{" "}
            <b>{totalSupportNeeded}명</b>
          </div>
        )}
      </div>

      {/* 받은 지원 인원 슬롯 (미배치) */}
      {totalSupportCount > 0 && (
        <div
          className="card border-blue-200 bg-blue-50/40"
          onDragOver={handleUnassignedDragOver}
          onDrop={handleUnassignedDrop}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-blue-900">
              지원 받은 인원 ({totalSupportCount}명)
            </h3>
            <span className="text-xs text-blue-700">
              미배치 {supportPlacements
                .slice(0, totalSupportCount)
                .filter((p) => !p).length +
                (totalSupportCount - Math.min(totalSupportCount, supportPlacements.length))}{" "}
              / 배치{" "}
              {supportPlacements
                .slice(0, totalSupportCount)
                .filter((p) => !!p).length}
            </span>
          </div>
          <p className="text-xs text-blue-700 mb-3">
            지원 칩을 그룹 카드로 드래그하면 해당 그룹의 가용시간에 +8시간 추가됩니다. 배치된 칩을 이 영역으로 다시 끌면 미배치 상태로 돌아갑니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {receivedSlots.map((slot, idx) => {
              const placed = supportPlacements[idx] ?? "";
              if (placed) return null; // 배치된 슬롯은 그룹 카드에 표시
              return (
                <SupportChip
                  key={idx}
                  slotIdx={idx}
                  fromGroup={slot.fromGroup}
                  isDragging={draggingSlot === idx}
                  onDragStart={(e) => handleSlotDragStart(e, idx)}
                  onDragEnd={handleSlotDragEnd}
                />
              );
            })}
            {supportPlacements
              .slice(0, totalSupportCount)
              .every((p) => !!p) && (
              <span className="text-xs text-slate-500 py-1.5 px-2">
                모든 지원 인원이 배치되었습니다.
              </span>
            )}
          </div>
        </div>
      )}

      {/* 그룹 병합 관리 */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-purple-600" />
            그룹 병합 ({groupMerges.length}건)
          </h3>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setShowMergePanel(!showMergePanel);
              setMergeSelection([]);
            }}
          >
            {showMergePanel ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {showMergePanel ? "닫기" : "새 묶음 추가"}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          2명 1조 작업이 필요한 그룹들을 묶으면 인원·부하·가용시간이 합쳐져 한 카드로 표시됩니다.
        </p>

        {showMergePanel && (
          <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3 mb-3">
            <div className="text-xs font-semibold text-purple-900 mb-2">
              묶을 그룹 2개 이상 선택
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PACKAGE2_GROUPS.map((g) => {
                const checked = mergeSelection.includes(g);
                return (
                  <label
                    key={g}
                    className={cn(
                      "px-2 py-1 rounded-md text-xs border cursor-pointer select-none",
                      checked
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setMergeSelection([...mergeSelection, g]);
                        } else {
                          setMergeSelection(mergeSelection.filter((x) => x !== g));
                        }
                      }}
                    />
                    {g}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-primary"
                disabled={mergeSelection.length < 2}
                onClick={() => {
                  if (mergeSelection.length < 2) return;
                  addGroupMerge(mergeSelection);
                  setMergeSelection([]);
                  setShowMergePanel(false);
                }}
              >
                <Link2 className="w-3 h-3" />
                {mergeSelection.length}개 묶기
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowMergePanel(false);
                  setMergeSelection([]);
                }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        {groupMerges.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-1">
            현재 묶인 그룹이 없습니다. 모든 그룹이 단독으로 표시됩니다.
          </p>
        ) : (
          <div className="space-y-1.5">
            {groupMerges.map((merge, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 text-xs bg-purple-50 border border-purple-200 rounded-md px-3 py-1.5"
              >
                <Link2 className="w-3 h-3 text-purple-600 flex-shrink-0" />
                <span className="font-medium text-purple-900">묶음 {idx + 1}:</span>
                <span className="text-slate-700">{merge.join(" + ")}</span>
                <button
                  className="ml-auto text-rose-600 hover:text-rose-800"
                  onClick={() => removeGroupMerge(idx)}
                  title="묶음 해제"
                >
                  <Link2Off className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {/* 묶음 카드를 먼저 표시 */}
        {groupMerges.map((merge, mIdx) => {
          const mergedRows = merge
            .map((gn) => groups.find((g) => g.group === gn))
            .filter((r): r is Package2GroupLoad => !!r);
          if (mergedRows.length === 0) return null;
          const merged = mergeGroupLoads(mergedRows);
          // 묶음 안의 모든 그룹에 배치된 슬롯 모음
          const placedSlots = supportPlacements
            .map((target, idx) => ({ target, idx }))
            .filter(
              ({ target, idx }) =>
                merge.includes(target) && idx < totalSupportCount
            )
            .map(({ idx }) => ({
              idx,
              fromGroup: receivedSlots[idx]?.fromGroup ?? "",
            }));
          return (
            <MergedGroupCard
              key={`merge-${mIdx}`}
              merged={merged}
              memberRows={mergedRows}
              overrides={overrides}
              isHover={hoverGroup === merge[0]}
              draggingEmp={draggingEmp}
              onDragOver={(e) => handleDragOver(e, merge[0])}
              onDragLeave={() => handleDragLeave(merge[0])}
              // 묶음에 드롭하면 첫 그룹에 배치
              onDrop={(e) => handleDrop(e, merge[0])}
              onWorkerDragStart={handleDragStart}
              onWorkerDragEnd={handleDragEnd}
              onMoveByDropdown={(empCode, target) => {
                const emp = packagePosition.find((p) => p.empCode === empCode);
                if (!emp) return;
                if (emp.position === target) clearOverride(empCode);
                else setOverride(empCode, target);
              }}
              placedSupportSlots={placedSlots}
              draggingSlot={draggingSlot}
              onSlotDragStart={handleSlotDragStart}
              onSlotDragEnd={handleSlotDragEnd}
              onUnmerge={() => removeGroupMerge(mIdx)}
              urgent={merge.reduce(
                (acc, g) => {
                  const u = getUrgentFor(urgentMap, g);
                  return {
                    dMinus1: acc.dMinus1 + u.dMinus1,
                    dMinus2: acc.dMinus2 + u.dMinus2,
                  };
                },
                { dMinus1: 0, dMinus2: 0 }
              )}
            />
          );
        })}
        {/* 단일 그룹 (병합 안 된 것만) */}
        {groups
          .filter((g) => !groupMerges.flat().includes(g.group))
          .map((g) => {
          // 이 그룹에 배치된 지원 슬롯들의 인덱스
          const placedSlots = supportPlacements
            .map((target, idx) => ({ target, idx }))
            .filter(
              ({ target, idx }) => target === g.group && idx < totalSupportCount
            )
            .map(({ idx }) => ({ idx, fromGroup: receivedSlots[idx]?.fromGroup ?? "" }));
          return (
            <GroupCard
              key={g.group}
              row={g}
              overrides={overrides}
              isHover={hoverGroup === g.group}
              draggingEmp={draggingEmp}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, g.group)}
              onDragLeave={() => handleDragLeave(g.group)}
              onDrop={(e) => handleDrop(e, g.group)}
              onMoveByDropdown={(empCode, target) => {
                const emp = packagePosition.find((p) => p.empCode === empCode);
                if (!emp) return;
                if (emp.position === target) clearOverride(empCode);
                else setOverride(empCode, target);
              }}
              placedSupportSlots={placedSlots}
              draggingSlot={draggingSlot}
              onSlotDragStart={handleSlotDragStart}
              onSlotDragEnd={handleSlotDragEnd}
              urgent={getUrgentFor(urgentMap, g.group)}
            />
          );
        })}
      </div>

      {unassignedMembers.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/50">
          <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            미배치 직원 ({unassignedMembers.length}명)
          </h3>
          <p className="text-xs text-amber-700 mb-2">
            기본근무위치가 위 10개 그룹과 일치하지 않습니다. 그룹으로 드래그하면 수동 배치할 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unassignedMembers.map((m) => (
              <WorkerChip
                key={m.empCode}
                worker={m}
                isOverridden={false}
                onDragStart={(e) => handleDragStart(e, m.empCode)}
                onDragEnd={handleDragEnd}
                onMoveByDropdown={(target) => {
                  if (m.position === target) clearOverride(m.empCode);
                  else setOverride(m.empCode, target);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "red" | "green" | "gray";
}) {
  const toneClass: Record<string, string> = {
    default: "bg-slate-50 text-slate-900",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    gray: "bg-slate-50 text-slate-600",
  };
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 p-3 flex items-center gap-3",
        toneClass[tone]
      )}
    >
      <div className="opacity-70">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide opacity-70">
          {label}
        </div>
        <div className="text-lg font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}

function GroupCard({
  row,
  overrides,
  isHover,
  draggingEmp,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onMoveByDropdown,
  placedSupportSlots,
  draggingSlot,
  onSlotDragStart,
  onSlotDragEnd,
  urgent,
}: {
  row: Package2GroupLoad;
  overrides: Record<string, string>;
  isHover: boolean;
  draggingEmp: string | null;
  onDragStart: (e: React.DragEvent, empCode: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onMoveByDropdown: (empCode: string, targetGroup: string) => void;
  placedSupportSlots: { idx: number; fromGroup: string }[];
  draggingSlot: number | null;
  onSlotDragStart: (e: React.DragEvent, slotIdx: number) => void;
  onSlotDragEnd: () => void;
  urgent?: { dMinus1: number; dMinus2: number };
}) {
  const judgement: "정상" | "잔업필요" | "지원가능" =
    row.diffHours < 0 ? "잔업필요" : row.supportablePeople > 0 ? "지원가능" : "정상";
  const judgementClass =
    judgement === "잔업필요"
      ? "badge-red"
      : judgement === "지원가능"
        ? "badge-blue"
        : "badge-green";
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "card transition-colors",
        isHover && "border-blue-400 ring-2 ring-blue-200 bg-blue-50/30",
        row.diffHours < 0 && !isHover && "border-rose-200 bg-rose-50/30",
        row.supportablePeople > 0 && !isHover && row.diffHours >= 0 && "border-emerald-200 bg-emerald-50/30"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-slate-900">{row.group}</h3>
        <div className="flex gap-1">
          {row.supportCount > 0 && (
            <span className="badge badge-blue">+{row.supportCount}명 지원</span>
          )}
          <span className={cn("badge", judgementClass)}>{judgement}</span>
        </div>
      </div>

      {urgent && (urgent.dMinus1 > 0 || urgent.dMinus2 > 0) && (
        <div className="flex gap-1 mb-2">
          {urgent.dMinus1 > 0 && (
            <span className="badge badge-red">D-1 {urgent.dMinus1}건</span>
          )}
          {urgent.dMinus2 > 0 && (
            <span className="badge badge-amber">D-2 {urgent.dMinus2}건</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs mb-3">
        <span className="text-slate-500">출근/기준</span>
        <span className="text-right font-medium">
          {row.presentMembers.length}
          {row.supportCount > 0 && (
            <span className="text-blue-600">+{row.supportCount}</span>
          )}{" "}
          / {row.members.length}
        </span>
        <span className="text-slate-500">계획수량</span>
        <span className="text-right font-medium">{row.todayQty.toLocaleString()}</span>
        <span className="text-slate-500">총부하</span>
        <span className="text-right font-medium">{formatDecimal(row.loadHours)}h</span>
        <span className="text-slate-500">가용</span>
        <span className="text-right font-medium">{formatDecimal(row.availableHours)}h</span>
        <span className="text-slate-500">여유/부족</span>
        <span
          className={cn(
            "text-right font-semibold",
            row.diffHours < 0 ? "text-rose-700" : "text-emerald-700"
          )}
        >
          {row.diffHours >= 0 ? "+" : ""}
          {formatDecimal(row.diffHours)}h
        </span>
        {row.overtimePeople > 0 && (
          <>
            <span className="text-slate-500">잔업필요</span>
            <span className="text-right font-semibold text-rose-700">
              {row.overtimePeople}명
            </span>
          </>
        )}
        {row.supportNeededPeople > 0 && (
          <>
            <span className="text-slate-500">지원필요</span>
            <span className="text-right font-semibold text-amber-700">
              {row.supportNeededPeople}명
            </span>
          </>
        )}
        {row.supportablePeople > 0 && (
          <>
            <span className="text-slate-500">지원가능</span>
            <span className="text-right font-semibold text-blue-700">
              {row.supportablePeople}명
            </span>
          </>
        )}
      </div>

      <div className="border-t border-slate-200 pt-2 min-h-[3rem]">
        <div className="text-[10px] uppercase text-slate-400 mb-1.5 tracking-wide">
          배치된 인원
        </div>
        {row.members.length === 0 && placedSupportSlots.length === 0 ? (
          <div className="text-xs text-slate-400 italic py-2 text-center">
            여기로 드래그
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.members.map((m) => (
              <WorkerChip
                key={m.empCode}
                worker={m}
                isPresent={row.presentMembers.includes(m)}
                isOverridden={!!overrides[m.empCode]}
                isDragging={draggingEmp === m.empCode}
                onDragStart={(e) => onDragStart(e, m.empCode)}
                onDragEnd={onDragEnd}
                onMoveByDropdown={(target) => onMoveByDropdown(m.empCode, target)}
              />
            ))}
            {placedSupportSlots.map((slot) => (
              <SupportChip
                key={`slot-${slot.idx}`}
                slotIdx={slot.idx}
                fromGroup={slot.fromGroup}
                isDragging={draggingSlot === slot.idx}
                onDragStart={(e) => onSlotDragStart(e, slot.idx)}
                onDragEnd={onSlotDragEnd}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkerChip({
  worker,
  isPresent,
  isOverridden,
  isDragging,
  onDragStart,
  onDragEnd,
  onMoveByDropdown,
}: {
  worker: PackagePosition;
  isPresent?: boolean;
  isOverridden: boolean;
  isDragging?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMoveByDropdown: (target: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isUnknownPresence = isPresent === undefined;

  return (
    <div className="relative">
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={`${worker.name} (${worker.empCode}) - 기본: ${worker.position || "(없음)"} / ${worker.movement}`}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-xs cursor-grab active:cursor-grabbing select-none border transition-opacity",
          isDragging && "opacity-40",
          // 출근 미상(미배치 영역) → 기본
          isUnknownPresence && "bg-slate-50 text-slate-700 border-slate-200",
          // 출근 + 고정
          isPresent === true && worker.movement !== "유동" && "bg-emerald-50 text-emerald-800 border-emerald-200",
          // 출근 + 유동
          isPresent === true && worker.movement === "유동" && "bg-blue-50 text-blue-800 border-blue-200",
          // 미출근
          isPresent === false && "bg-slate-100 text-slate-400 border-slate-200 line-through"
        )}
      >
        <GripVertical className="w-3 h-3 opacity-50" />
        <span className="font-medium">{worker.name}</span>
        {worker.movement === "유동" && (
          <span className="text-[9px] px-1 rounded bg-white/60 border border-current/20">
            유동
          </span>
        )}
        {isOverridden && (
          <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200">
            이동
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu((v) => !v);
          }}
          className="ml-0.5 px-1 -my-1 -mr-1 hover:bg-black/10 rounded text-[10px]"
          aria-label="다른 그룹으로 이동"
        >
          ⋯
        </button>
      </div>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute z-20 mt-1 left-0 bg-white border border-slate-200 rounded-md shadow-lg min-w-[140px] py-1">
            <div className="px-3 py-1 text-[10px] uppercase text-slate-400 tracking-wide border-b border-slate-100">
              이동
            </div>
            {PACKAGE2_GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => {
                  onMoveByDropdown(g);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
              >
                {g}
                {worker.position === g && (
                  <span className="ml-1 text-[9px] text-slate-400">(기본)</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 묶음 합산 결과 타입 (group이 string으로 풀림)
type MergedGroupLoad = Omit<Package2GroupLoad, "group"> & { group: string };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mergeGroupLoads(rows: Package2GroupLoad[]): MergedGroupLoad {
  const members = rows.flatMap((r) => r.members);
  const presentMembers = rows.flatMap((r) => r.presentMembers);
  const absentMembers = rows.flatMap((r) => r.absentMembers);
  const loadHours = round1(rows.reduce((s, r) => s + r.loadHours, 0));
  const todayQty = rows.reduce((s, r) => s + r.todayQty, 0);
  const supportCount = rows.reduce((s, r) => s + r.supportCount, 0);
  const presentCount = presentMembers.length;
  const effectivePeople = presentCount + supportCount;
  const availableHours = effectivePeople * 8;
  const diffHours = round1(availableHours - loadHours);
  const shortage = diffHours < 0 ? Math.abs(diffHours) : 0;
  const overtimePeople =
    shortage > 0 ? Math.min(Math.ceil(shortage / 3), effectivePeople) : 0;
  const overtimeCovered = overtimePeople * 3;
  const remaining = Math.max(0, round1(shortage - overtimeCovered));
  const supportNeededPeople =
    remaining > 0 ? Math.ceil(remaining / 8) : 0;
  const supportablePeople =
    diffHours > 0 ? Math.min(Math.floor(diffHours / 8), presentCount) : 0;

  return {
    group: rows.map((r) => r.group).join(" + "),
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
}

function MergedGroupCard({
  merged,
  memberRows,
  overrides,
  isHover,
  draggingEmp,
  onDragOver,
  onDragLeave,
  onDrop,
  onWorkerDragStart,
  onWorkerDragEnd,
  onMoveByDropdown,
  placedSupportSlots,
  draggingSlot,
  onSlotDragStart,
  onSlotDragEnd,
  onUnmerge,
  urgent,
}: {
  merged: MergedGroupLoad;
  memberRows: Package2GroupLoad[];
  overrides: Record<string, string>;
  isHover: boolean;
  draggingEmp: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onWorkerDragStart: (e: React.DragEvent, empCode: string) => void;
  onWorkerDragEnd: () => void;
  onMoveByDropdown: (empCode: string, targetGroup: string) => void;
  placedSupportSlots: { idx: number; fromGroup: string }[];
  draggingSlot: number | null;
  onSlotDragStart: (e: React.DragEvent, slotIdx: number) => void;
  onSlotDragEnd: () => void;
  onUnmerge: () => void;
  urgent?: { dMinus1: number; dMinus2: number };
}) {
  const judgement: "정상" | "잔업필요" | "지원가능" =
    merged.diffHours < 0
      ? "잔업필요"
      : merged.supportablePeople > 0
        ? "지원가능"
        : "정상";
  const judgementClass =
    judgement === "잔업필요"
      ? "badge-red"
      : judgement === "지원가능"
        ? "badge-blue"
        : "badge-green";
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "card transition-colors border-purple-200 bg-purple-50/30",
        isHover && "border-blue-400 ring-2 ring-blue-200 bg-blue-50/30",
        merged.diffHours < 0 && !isHover && "border-rose-200 bg-rose-50/30",
        merged.supportablePeople > 0 &&
          !isHover &&
          merged.diffHours >= 0 &&
          "border-emerald-200 bg-emerald-50/30"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link2 className="w-3.5 h-3.5 text-purple-600" />
            <h3 className="font-bold text-slate-900 text-sm">{merged.group}</h3>
          </div>
          <span className="badge bg-purple-100 text-purple-700 text-[10px] mt-1">
            병합 ({memberRows.length}개 그룹)
          </span>
        </div>
        <div className="flex gap-1 items-start">
          {merged.supportCount > 0 && (
            <span className="badge badge-blue">+{merged.supportCount}명 지원</span>
          )}
          <span className={cn("badge", judgementClass)}>{judgement}</span>
          <button
            className="text-rose-500 hover:text-rose-700 p-0.5"
            onClick={onUnmerge}
            title="묶음 해제"
          >
            <Link2Off className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {urgent && (urgent.dMinus1 > 0 || urgent.dMinus2 > 0) && (
        <div className="flex gap-1 mb-2">
          {urgent.dMinus1 > 0 && (
            <span className="badge badge-red">D-1 {urgent.dMinus1}건</span>
          )}
          {urgent.dMinus2 > 0 && (
            <span className="badge badge-amber">D-2 {urgent.dMinus2}건</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs mb-3">
        <span className="text-slate-500">출근/기준</span>
        <span className="text-right font-medium">
          {merged.presentMembers.length}
          {merged.supportCount > 0 && (
            <span className="text-blue-600">+{merged.supportCount}</span>
          )}{" "}
          / {merged.members.length}
        </span>
        <span className="text-slate-500">계획수량</span>
        <span className="text-right font-medium">
          {merged.todayQty.toLocaleString()}
        </span>
        <span className="text-slate-500">총부하 (합)</span>
        <span className="text-right font-medium">
          {formatDecimal(merged.loadHours)}h
        </span>
        <span className="text-slate-500">가용 (합)</span>
        <span className="text-right font-medium">
          {formatDecimal(merged.availableHours)}h
        </span>
        <span className="text-slate-500">여유/부족</span>
        <span
          className={cn(
            "text-right font-semibold",
            merged.diffHours < 0 ? "text-rose-700" : "text-emerald-700"
          )}
        >
          {merged.diffHours >= 0 ? "+" : ""}
          {formatDecimal(merged.diffHours)}h
        </span>
        {merged.overtimePeople > 0 && (
          <>
            <span className="text-slate-500">잔업필요</span>
            <span className="text-right font-semibold text-rose-700">
              {merged.overtimePeople}명
            </span>
          </>
        )}
        {merged.supportNeededPeople > 0 && (
          <>
            <span className="text-slate-500">지원필요</span>
            <span className="text-right font-semibold text-amber-700">
              {merged.supportNeededPeople}명
            </span>
          </>
        )}
        {merged.supportablePeople > 0 && (
          <>
            <span className="text-slate-500">지원가능</span>
            <span className="text-right font-semibold text-blue-700">
              {merged.supportablePeople}명
            </span>
          </>
        )}
      </div>

      <div className="border-t border-purple-200 pt-2 min-h-[3rem]">
        <div className="text-[10px] uppercase text-slate-400 mb-1.5 tracking-wide">
          배치된 인원 (그룹별)
        </div>
        {memberRows.map((row) => (
          <div key={row.group} className="mb-2 last:mb-0">
            <div className="text-[10px] text-purple-700 font-semibold mb-1">
              · {row.group} ({row.presentMembers.length}명 출근)
            </div>
            {row.members.length === 0 ? (
              <div className="text-[10px] text-slate-400 italic">(인원 없음)</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {row.members.map((m) => (
                  <WorkerChip
                    key={m.empCode}
                    worker={m}
                    isPresent={row.presentMembers.includes(m)}
                    isOverridden={!!overrides[m.empCode]}
                    isDragging={draggingEmp === m.empCode}
                    onDragStart={(e) => onWorkerDragStart(e, m.empCode)}
                    onDragEnd={onWorkerDragEnd}
                    onMoveByDropdown={(target) =>
                      onMoveByDropdown(m.empCode, target)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {placedSupportSlots.length > 0 && (
          <div className="mt-2 pt-2 border-t border-dashed border-blue-200">
            <div className="text-[10px] text-blue-700 font-semibold mb-1">
              · 받은 지원 ({placedSupportSlots.length}명)
            </div>
            <div className="flex flex-wrap gap-1">
              {placedSupportSlots.map((slot) => (
                <SupportChip
                  key={`mslot-${slot.idx}`}
                  slotIdx={slot.idx}
                  fromGroup={slot.fromGroup}
                  isDragging={draggingSlot === slot.idx}
                  onDragStart={(e) => onSlotDragStart(e, slot.idx)}
                  onDragEnd={onSlotDragEnd}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SupportChip({
  slotIdx,
  fromGroup,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  slotIdx: number;
  fromGroup: string;
  isDragging?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`지원 ${slotIdx + 1} — ${fromGroup}에서 받음`}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-md text-xs cursor-grab active:cursor-grabbing select-none border transition-opacity",
        "bg-blue-100 text-blue-800 border-blue-300 border-dashed",
        isDragging && "opacity-40"
      )}
    >
      <GripVertical className="w-3 h-3 opacity-50" />
      <span className="font-semibold">지원 {slotIdx + 1}</span>
      <span className="text-[9px] px-1 rounded bg-white/70 border border-blue-300">
        {fromGroup}
      </span>
    </div>
  );
}
