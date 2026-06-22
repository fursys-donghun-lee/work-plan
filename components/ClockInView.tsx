"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { ActionModal } from "@/components/ActionModal";
import { cn } from "@/lib/utils";
import type { Employee, SupportTargetLineName } from "@/lib/types";

export interface ClockInGroup {
  소사장: Employee[];
  피더: Employee[];
  작업자: Employee[];
}

export interface ClockInConfig {
  companyDept: string; // 부서명 매칭 (예: "대림산업", "다호산업")
  // 이 대시보드가 받을 수 있는 지원 라인 (지원 풀 필터링)
  selfLines: SupportTargetLineName[];
  // 라인 → 지원 풀로 드롭 시 기록될 기본 라인 (selfLines[0])
  defaultSupportTarget: SupportTargetLineName;
  pageTitle: string; // h1 제목 (예: "대림산업 · 현장 대시보드")
  lineGrid: string[][]; // 라인 그리드 (각 행은 임의 길이)
  // 직원의 슬롯 결정 (line grid 의 한 슬롯명 OR "기타")
  slotFor: (e: Employee, packagePos: Map<string, string>) => string;
  // 직원의 우측 패널 그룹 분류
  classifyGroup: (
    e: Employee,
    packagePos: Map<string, string>
  ) => "소사장" | "피더" | "작업자" | null;
  // 라인 슬롯 표시명 (선택). 없으면 그대로 사용
  displayLineName?: (line: string) => string;
  // 직원 필터 (선택) — true 인 직원만 대시보드에 노출 (구분 필터 등)
  //   companyDept 매칭 이후 추가로 적용됨
  categoryFilter?: (e: Employee) => boolean;
}

interface ModalState {
  open: boolean;
  empCode: string;
  name: string;
  currentLine: string;
  isPresent: boolean;
  isSupporting: boolean;
}

export function ClockInView({ config }: { config: ClockInConfig }) {
  const hydrated = useHydrated();
  const employees = useDataStore((s) => s.employees);
  const workDate = useDataStore((s) => s.workDate);
  const packagePosition = useDataStore((s) => s.packagePosition);
  const currentLineOverrides = useDataStore((s) => s.currentLineOverrides);
  const manualClockIns = useDataStore((s) => s.manualClockIns);
  const supportTargetMap = useDataStore((s) => s.supportTargetMap);
  const clockInEmployee = useDataStore((s) => s.clockInEmployee);
  const clockOutEmployee = useDataStore((s) => s.clockOutEmployee);
  const logSupport = useDataStore((s) => s.logSupport);
  const moveWorkerLine = useDataStore((s) => s.moveWorkerLine);
  const returnFromSupport = useDataStore((s) => s.returnFromSupport);
  const bulkClockIn = useDataStore((s) => s.bulkClockIn);

  const GRID_LINES = useMemo(
    () => new Set<string>(config.lineGrid.flat()),
    [config.lineGrid]
  );

  const [modal, setModal] = useState<ModalState>({
    open: false,
    empCode: "",
    name: "",
    currentLine: "",
    isPresent: false,
    isSupporting: false,
  });
  const [draggingEmpCode, setDraggingEmpCode] = useState<string | null>(null);

  const {
    presentBySlot,
    presentOthers,
    supportingNow,
    supportingElsewhere,
    receivedFromOthers,
    receivedEmpCodeSet,
    notClockedInGroups,
    notClockedInTotal,
    defaultSlotMap,
    currentSlotMap,
    stats,
  } = useMemo(() => {
    const targetEmps = employees.filter((e) => {
      if (!e.department.includes(config.companyDept)) return false;
      if (config.categoryFilter && !config.categoryFilter(e)) return false;
      return true;
    });
    const pkgPosMap = new Map<string, string>();
    for (const p of packagePosition) {
      if (p.empCode) pkgPosMap.set(p.empCode, p.position || "");
    }

    const presentBySlot = new Map<string, Employee[]>();
    const presentOthers: Employee[] = [];
    const supportingNow: Employee[] = []; // 우리 라인 지원하는 우리 직원
    const supportingElsewhere: Employee[] = []; // 타 라인 지원하는 우리 직원
    const sajangNot: Employee[] = [];
    const feederNot: Employee[] = [];
    const workerNot: Employee[] = [];

    const defaultSlotMap = new Map<string, string>();
    const currentSlotMap = new Map<string, string>();

    const selfLineSet = new Set<string>(config.selfLines);

    for (const e of targetEmps) {
      const def = config.slotFor(e, pkgPosMap);
      defaultSlotMap.set(e.empCode, def);
      const overrideVal = currentLineOverrides[e.empCode];
      const cur =
        overrideVal !== undefined && overrideVal !== "" ? overrideVal : def;
      currentSlotMap.set(e.empCode, cur);

      const isPresent = !!manualClockIns[e.empCode];
      if (!isPresent) {
        const grp = config.classifyGroup(e, pkgPosMap);
        if (grp === "소사장") sajangNot.push(e);
        else if (grp === "피더") feederNot.push(e);
        else if (grp === "작업자") workerNot.push(e);
        continue;
      }
      if (cur === "지원") {
        const target = supportTargetMap[e.empCode];
        if (target && selfLineSet.has(target)) {
          supportingNow.push(e);
        } else {
          supportingElsewhere.push(e);
        }
      } else if (cur === "기타" || !GRID_LINES.has(cur)) {
        presentOthers.push(e);
      } else {
        if (!presentBySlot.has(cur)) presentBySlot.set(cur, []);
        presentBySlot.get(cur)!.push(e);
      }
    }

    // 받은 지원 — 이 대시보드의 '정규 구성원' 이 아닌데 우리 라인 지원하는 인원
    //   · 다른 회사 직원 (예: 우성 → 도장)
    //   · 같은 회사이지만 categoryFilter 에 안 걸리는 직원 (예: 다호 포장1 → 도장)
    //   targetEmps 에 이미 포함된 인원(우리 정규 구성원)은 위 루프에서 처리됐으므로 skip
    const ownTargetSet = new Set(targetEmps.map((e) => e.empCode));
    const receivedFromOthers: Employee[] = [];
    // 받은 지원자 사원코드 집합 — 슬롯에 배치돼도 다른 색으로 표시하기 위함
    const receivedEmpCodeSet = new Set<string>();
    for (const e of employees) {
      if (ownTargetSet.has(e.empCode)) continue; // 우리 정규 구성원 — 이미 처리
      const isPresent = !!manualClockIns[e.empCode];
      if (!isPresent) continue;
      const target = supportTargetMap[e.empCode];
      if (!target || !selfLineSet.has(target)) continue;

      receivedEmpCodeSet.add(e.empCode);

      const overrideVal = currentLineOverrides[e.empCode];
      if (!overrideVal || overrideVal === "지원") {
        // 지원 풀에 대기 중
        receivedFromOthers.push(e);
      } else if (GRID_LINES.has(overrideVal)) {
        // 우리 라인 슬롯에 배치됨
        if (!presentBySlot.has(overrideVal))
          presentBySlot.set(overrideVal, []);
        presentBySlot.get(overrideVal)!.push(e);
      } else {
        // 알 수 없는 override — 지원 풀로 fallback
        receivedFromOthers.push(e);
      }

      // 모달용 currentSlotMap 에도 등록 (받은 지원자 클릭 시 currentLine 표시)
      currentSlotMap.set(e.empCode, overrideVal || "지원");
    }

    const cmp = (a: Employee, b: Employee) =>
      a.name.localeCompare(b.name, "ko");
    for (const arr of presentBySlot.values()) arr.sort(cmp);
    presentOthers.sort(cmp);
    supportingNow.sort(cmp);
    supportingElsewhere.sort(cmp);
    receivedFromOthers.sort(cmp);
    sajangNot.sort(cmp);
    feederNot.sort(cmp);
    workerNot.sort(cmp);

    const notClockedInTotal =
      sajangNot.length + feederNot.length + workerNot.length;
    const total = targetEmps.length;
    const present = total - notClockedInTotal;

    return {
      presentBySlot,
      presentOthers,
      supportingNow,
      supportingElsewhere,
      receivedFromOthers,
      receivedEmpCodeSet,
      notClockedInGroups: {
        소사장: sajangNot,
        피더: feederNot,
        작업자: workerNot,
      },
      notClockedInTotal,
      defaultSlotMap,
      currentSlotMap,
      stats: { total, present, absent: notClockedInTotal },
    };
  }, [
    employees,
    packagePosition,
    currentLineOverrides,
    manualClockIns,
    supportTargetMap,
    GRID_LINES,
    config,
  ]);

  if (!hydrated) return null;

  if (employees.length === 0) {
    return (
      <EmptyState
        title="기준자료가 필요합니다"
        description={`${config.companyDept} 직원 정보를 보려면 먼저 근무기준을 업로드하세요.`}
        ctaLabel="기준자료 업로드"
        ctaHref="/master-data"
      />
    );
  }

  const openModalFor = (e: Employee) => {
    const isPresent = !!manualClockIns[e.empCode];
    const currentLine = currentSlotMap.get(e.empCode) || "";
    const isSupporting = currentLine === "지원";
    setModal({
      open: true,
      empCode: e.empCode,
      name: e.name,
      currentLine,
      isPresent,
      isSupporting,
    });
  };
  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  const handleClockIn = () => {
    const defaultLine = defaultSlotMap.get(modal.empCode) || "";
    clockInEmployee(modal.empCode, modal.name, defaultLine);
    closeModal();
  };
  const handleClockOut = () => {
    clockOutEmployee(modal.empCode, modal.name, modal.currentLine);
    closeModal();
  };
  const handleSupport = (targetLine: SupportTargetLineName) => {
    logSupport(modal.empCode, modal.name, modal.currentLine, targetLine);
    closeModal();
  };
  const handleReturn = () => {
    // 지원 상태 해제 → 기본 라인으로 복귀 (supportTargetMap 도 함께 정리)
    const defaultLine = defaultSlotMap.get(modal.empCode) || "";
    returnFromSupport(modal.empCode, modal.name, defaultLine);
    closeModal();
  };

  const handleDrop = (toLine: string, empCode: string, name: string) => {
    const fromLine = currentSlotMap.get(empCode) || "";
    if (fromLine === toLine) return;
    moveWorkerLine(empCode, name, fromLine, toLine);
  };

  // 일괄 출근 — 출근 전 인원 모두 출근 처리
  const handleBulkClockIn = () => {
    const workers: Array<{ empCode: string; name: string; line: string }> = [];
    for (const grp of Object.values(notClockedInGroups)) {
      for (const e of grp) {
        const line = defaultSlotMap.get(e.empCode) || "";
        workers.push({ empCode: e.empCode, name: e.name, line });
      }
    }
    if (workers.length === 0) return;
    if (
      !window.confirm(
        `출근 전 ${workers.length}명을 모두 출근 처리합니다. 미출근자는 칩을 눌러서 따로 미출근 처리해주세요.`
      )
    ) {
      return;
    }
    bulkClockIn(workers);
  };

  const displayName = (line: string) =>
    config.displayLineName ? config.displayLineName(line) : line;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {config.pageTitle}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자{" "}
            <span className="font-semibold">{workDate || "(미지정)"}</span>
            <span className="ml-3 text-slate-400">
              이름 클릭으로 출근·퇴근·지원 / 드래그앤드롭으로 라인 이동
            </span>
          </p>
        </div>
        <div className="flex gap-2 items-stretch">
          <button
            type="button"
            onClick={handleBulkClockIn}
            disabled={notClockedInTotal === 0}
            className={cn(
              "px-4 py-1.5 rounded-lg font-bold text-sm border-2 transition-colors",
              notClockedInTotal === 0
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
            )}
            title="출근 전 인원 전체 출근 처리 (미출근자는 칩을 눌러 별도 처리)"
          >
            일괄 출근처리
            {notClockedInTotal > 0 && (
              <span className="ml-1.5 text-xs font-normal opacity-90">
                ({notClockedInTotal}명)
              </span>
            )}
          </button>
          <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">총인원</div>
            <div className="text-lg font-bold text-slate-800">
              {stats.total}명
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-[11px] text-emerald-600">출근</div>
            <div className="text-lg font-bold text-emerald-700">
              {stats.present}명
            </div>
          </div>
          <div
            className={cn(
              "px-3 py-1.5 rounded-lg border",
              stats.absent > 0
                ? "bg-rose-50 border-rose-200"
                : "bg-slate-50 border-slate-200"
            )}
          >
            <div
              className={cn(
                "text-[11px]",
                stats.absent > 0 ? "text-rose-600" : "text-slate-500"
              )}
            >
              미출근
            </div>
            <div
              className={cn(
                "text-lg font-bold",
                stats.absent > 0 ? "text-rose-700" : "text-slate-800"
              )}
            >
              {stats.absent}명
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-3">
          {config.lineGrid.map((row, ri) => (
            <div
              key={ri}
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
              }}
            >
              {row.map((line) => (
                <LineCard
                  key={line}
                  line={line}
                  displayName={displayName(line)}
                  workers={presentBySlot.get(line) ?? []}
                  manualClockIns={manualClockIns}
                  receivedEmpCodeSet={receivedEmpCodeSet}
                  onChipClick={openModalFor}
                  onDropWorker={(empCode, name) => handleDrop(line, empCode, name)}
                  draggingEmpCode={draggingEmpCode}
                  setDraggingEmpCode={setDraggingEmpCode}
                />
              ))}
            </div>
          ))}

          {presentOthers.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h2 className="font-semibold text-slate-900 text-sm mb-2">
                기타{" "}
                <span className="text-xs font-normal text-slate-500">
                  (사장님 · 라인 미지정)
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {presentOthers.map((e) => (
                  <PresentChip
                    key={e.empCode}
                    employee={e}
                    clockInTime={manualClockIns[e.empCode]}
                    isReceived={receivedEmpCodeSet.has(e.empCode)}
                    onClick={() => openModalFor(e)}
                    draggable={false}
                    draggingEmpCode={draggingEmpCode}
                    setDraggingEmpCode={setDraggingEmpCode}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 우측 패널 — 항상 표시 (전원 출근해도 지원 풀 / 그룹 라벨 유지) */}
        <div className="w-56 flex-shrink-0 card border-amber-200 bg-amber-50/40 self-stretch">
            <h2 className="font-semibold text-slate-900 mb-3 text-sm">
              대기 인원{" "}
              <span className="text-xs font-normal text-amber-700">
                (출근 전 {notClockedInTotal} · 지원{" "}
                {supportingNow.length + receivedFromOthers.length})
              </span>
            </h2>
            <div className="space-y-3">
              {(["소사장", "피더", "작업자"] as const).map((grp) => (
                <NotClockedInGroup
                  key={grp}
                  label={grp}
                  workers={notClockedInGroups[grp]}
                  onClickName={openModalFor}
                />
              ))}
              <SupportPoolGroup
                ownWorkers={supportingNow}
                receivedWorkers={receivedFromOthers}
                manualClockIns={manualClockIns}
                onClickName={openModalFor}
                onDropFromLine={(empCode, name) => {
                  logSupport(
                    empCode,
                    name,
                    currentSlotMap.get(empCode) || "",
                    config.defaultSupportTarget
                  );
                }}
                draggingEmpCode={draggingEmpCode}
                setDraggingEmpCode={setDraggingEmpCode}
              />
              {supportingElsewhere.length > 0 && (
                <div>
                  <div className="font-bold text-slate-800 text-xs mb-1.5 border-b border-purple-300 pb-1 flex items-center justify-between">
                    <span>타 라인 지원 중</span>
                    <span className="text-[10px] font-normal text-slate-500">
                      {supportingElsewhere.length}명
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {supportingElsewhere.map((e) => {
                      const target = supportTargetMap[e.empCode];
                      return (
                        <button
                          key={e.empCode}
                          type="button"
                          onClick={() => openModalFor(e)}
                          className="px-1.5 py-1 rounded text-xs font-semibold border bg-purple-100 border-purple-300 text-purple-800 hover:bg-purple-200 transition-colors text-center truncate"
                          title={`${e.name} · 지원 → ${target}`}
                        >
                          {e.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
      </div>

      <ActionModal
        open={modal.open}
        workerName={modal.name}
        workerEmpCode={modal.empCode}
        currentLine={modal.currentLine}
        isPresent={modal.isPresent}
        isSupporting={modal.isSupporting}
        onClose={closeModal}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
        onSupport={handleSupport}
        onReturn={handleReturn}
      />
    </div>
  );
}

// ===== 헬퍼 컴포넌트 =====

function NotClockedInGroup({
  label,
  workers,
  onClickName,
}: {
  label: string;
  workers: Employee[];
  onClickName: (e: Employee) => void;
}) {
  return (
    <div>
      <div className="font-bold text-slate-800 text-xs mb-1.5 border-b border-amber-300 pb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[10px] font-normal text-slate-500">
          {workers.length}명
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {workers.length === 0 ? (
          <span className="col-span-2 text-[11px] text-slate-400 italic px-1">
            없음
          </span>
        ) : (
          workers.map((e) => (
            <button
              key={e.empCode}
              type="button"
              onClick={() => onClickName(e)}
              className="px-1.5 py-1 rounded text-xs font-semibold border bg-white border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors text-center truncate"
              title={e.name}
            >
              {e.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function SupportPoolGroup({
  ownWorkers,
  receivedWorkers,
  manualClockIns,
  onClickName,
  onDropFromLine,
  draggingEmpCode,
  setDraggingEmpCode,
}: {
  ownWorkers: Employee[];
  receivedWorkers: Employee[]; // 다른 회사에서 지원받은 직원
  manualClockIns: Record<string, string>;
  onClickName: (e: Employee) => void;
  onDropFromLine: (empCode: string, name: string) => void;
  draggingEmpCode: string | null;
  setDraggingEmpCode: (s: string | null) => void;
}) {
  const [hover, setHover] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHover(true);
  };
  const onDragLeave = () => setHover(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    try {
      const { empCode, name } = JSON.parse(raw) as {
        empCode: string;
        name: string;
      };
      onDropFromLine(empCode, name);
    } catch {}
  };

  const all = [...ownWorkers, ...receivedWorkers];

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "rounded transition-colors p-1.5 -m-1.5",
        hover && "bg-blue-100 ring-2 ring-blue-300"
      )}
    >
      <div className="font-bold text-slate-800 text-xs mb-1.5 border-b border-blue-300 pb-1 flex items-center justify-between">
        <span>지원</span>
        <span className="text-[10px] font-normal text-slate-500">
          {all.length}명
          {receivedWorkers.length > 0 && ` (받은 ${receivedWorkers.length})`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {all.length === 0 ? (
          <span className="col-span-2 text-[11px] text-slate-400 italic px-1">
            {hover ? "여기로 놓으면 지원 처리" : "없음"}
          </span>
        ) : (
          all.map((e) => {
            const isDragging = draggingEmpCode === e.empCode;
            const isReceived = receivedWorkers.includes(e);
            const handleDragStart = (ev: React.DragEvent) => {
              ev.dataTransfer.setData(
                "application/json",
                JSON.stringify({ empCode: e.empCode, name: e.name })
              );
              ev.dataTransfer.effectAllowed = "move";
              setDraggingEmpCode(e.empCode);
            };
            const handleDragEnd = () => setDraggingEmpCode(null);
            const hhmm = formatTime(manualClockIns[e.empCode]);
            return (
              <button
                key={e.empCode}
                type="button"
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={() => onClickName(e)}
                className={cn(
                  "px-1.5 py-1 rounded text-xs font-semibold border transition-colors text-center truncate cursor-grab active:cursor-grabbing",
                  isReceived
                    ? "bg-indigo-100 border-indigo-300 text-indigo-800 hover:bg-indigo-200"
                    : "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200",
                  isDragging && "opacity-50"
                )}
                title={`${e.name} · ${isReceived ? "받은 지원" : "지원"} ${hhmm}`}
              >
                {e.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function LineCard({
  line,
  displayName,
  workers,
  manualClockIns,
  receivedEmpCodeSet,
  onChipClick,
  onDropWorker,
  draggingEmpCode,
  setDraggingEmpCode,
}: {
  line: string;
  displayName: string;
  workers: Employee[];
  manualClockIns: Record<string, string>;
  receivedEmpCodeSet: Set<string>;
  onChipClick: (e: Employee) => void;
  onDropWorker: (empCode: string, name: string) => void;
  draggingEmpCode: string | null;
  setDraggingEmpCode: (s: string | null) => void;
}) {
  const [hover, setHover] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHover(true);
  };
  const onDragLeave = () => setHover(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    try {
      const { empCode, name } = JSON.parse(raw) as {
        empCode: string;
        name: string;
      };
      onDropWorker(empCode, name);
    } catch {}
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "rounded-lg border bg-white p-3 min-h-[120px] transition-colors",
        hover
          ? "border-blue-400 bg-blue-50/40 ring-2 ring-blue-200"
          : "border-slate-200"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-slate-800 text-sm">{displayName}</div>
        <div
          className={cn(
            "text-xs font-semibold",
            workers.length > 0 ? "text-emerald-700" : "text-slate-400"
          )}
        >
          {workers.length}명
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {workers.length === 0 ? (
          <div className="text-xs text-slate-400 italic">대기 중</div>
        ) : (
          workers.map((e) => (
            <PresentChip
              key={e.empCode}
              employee={e}
              clockInTime={manualClockIns[e.empCode]}
              isReceived={receivedEmpCodeSet.has(e.empCode)}
              onClick={() => onChipClick(e)}
              draggable
              draggingEmpCode={draggingEmpCode}
              setDraggingEmpCode={setDraggingEmpCode}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PresentChip({
  employee,
  clockInTime,
  isReceived = false,
  onClick,
  draggable,
  draggingEmpCode,
  setDraggingEmpCode,
}: {
  employee: Employee;
  clockInTime: string | undefined;
  isReceived?: boolean;
  onClick: () => void;
  draggable: boolean;
  draggingEmpCode: string | null;
  setDraggingEmpCode: (s: string | null) => void;
}) {
  const timeLabel = formatTime(clockInTime);
  const isDragging = draggingEmpCode === employee.empCode;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ empCode: employee.empCode, name: employee.name })
    );
    e.dataTransfer.effectAllowed = "move";
    setDraggingEmpCode(employee.empCode);
  };
  const handleDragEnd = () => setDraggingEmpCode(null);

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onDragEnd={draggable ? handleDragEnd : undefined}
      onClick={onClick}
      className={cn(
        "px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors",
        isReceived
          ? "bg-indigo-100 border-indigo-300 text-indigo-800 hover:bg-indigo-200"
          : "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
      title={`${employee.name} · ${isReceived ? "받은 지원" : "출근"} ${timeLabel}${draggable ? " · 드래그로 라인 이동" : ""}`}
    >
      <span>{employee.name}</span>
      {timeLabel && (
        <span className="ml-1.5 text-[10px] font-normal opacity-80">
          {timeLabel}
        </span>
      )}
    </button>
  );
}

function formatTime(value: string | undefined): string {
  if (!value) return "";
  if (value.includes("T") || value.includes("-")) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  }
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return value;
}
