"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { ActionModal } from "@/components/ActionModal";
import { cn } from "@/lib/utils";
import type { Employee, AttendanceRecord } from "@/lib/types";
import { PACKAGE2_FEEDER_WORKERS } from "@/lib/types";

const FEEDER_NAME_SET = new Set<string>(PACKAGE2_FEEDER_WORKERS);

// 출근 전 그룹화 — 소사장 / 피더 / 작업자(포장2라인 + 포장철물)
function classifyGroup(e: Employee): "소사장" | "피더" | "작업자" | null {
  if (e.category.includes("사장")) return "소사장";
  if (FEEDER_NAME_SET.has(e.name)) return "피더";
  const hasPCM =
    e.category.includes("포장철물") ||
    e.department.includes("포장철물") ||
    e.baseLocation.includes("포장철물") ||
    e.position.includes("포장철물");
  if (hasPCM) return "작업자";
  if (e.category === "포장2라인") return "작업자";
  return null;
}

// 라인 배치 — 사용자 지정 4행 레이아웃
const LINE_GRID: string[][] = [
  ["PA-01", "PA-02", "PA-03", "PA-04", "PA-05"],
  ["MM-01", "MM-02", "MM-03", "MM-04"],
  ["PA-06", "PA-07", "자동포장라인", "포장철물"],
  ["MA-01", "MA-02", "MA-03", "MM-05"],
];
const GRID_LINES = new Set<string>(LINE_GRID.flat());

// 재배치 계획에서 자동포장라인으로 묶이는 packagePosition.position 값들
const AUTO_PACKAGE_POSITIONS = new Set<string>([
  "PA-01",
  "PA-02",
  "자동포장(파이프)",
]);

// 직원의 기본 슬롯 결정 — 출근 시 자동 배치되는 위치
function defaultSlotFor(
  empCode: string,
  category: string,
  department: string,
  baseLocation: string,
  position: string,
  packagePos: Map<string, string>
): string {
  if (
    category.includes("포장철물") ||
    department.includes("포장철물") ||
    baseLocation.includes("포장철물") ||
    position.includes("포장철물")
  ) {
    return "포장철물";
  }
  const pkgPos = packagePos.get(empCode);
  if (pkgPos) {
    if (AUTO_PACKAGE_POSITIONS.has(pkgPos)) return "자동포장라인";
    if (GRID_LINES.has(pkgPos)) return pkgPos;
  }
  const loc = (baseLocation || "").trim();
  if (GRID_LINES.has(loc)) return loc;
  return "기타";
}

interface ModalState {
  open: boolean;
  empCode: string;
  name: string;
  currentLine: string;
  isPresent: boolean;
}

export function DaerimClockInView() {
  const hydrated = useHydrated();
  const employees = useDataStore((s) => s.employees);
  const attendance = useDataStore((s) => s.attendance);
  const workDate = useDataStore((s) => s.workDate);
  const packagePosition = useDataStore((s) => s.packagePosition);
  const currentLineOverrides = useDataStore((s) => s.currentLineOverrides);
  const clockInEmployee = useDataStore((s) => s.clockInEmployee);
  const clockOutEmployee = useDataStore((s) => s.clockOutEmployee);
  const logSupport = useDataStore((s) => s.logSupport);
  const moveWorkerLine = useDataStore((s) => s.moveWorkerLine);

  const [modal, setModal] = useState<ModalState>({
    open: false,
    empCode: "",
    name: "",
    currentLine: "",
    isPresent: false,
  });

  const [draggingEmpCode, setDraggingEmpCode] = useState<string | null>(null);

  // 대림 직원 추출 + 슬롯 매핑 (override > packagePosition > baseLocation)
  const {
    presentBySlot,
    presentOthers,
    notClockedInGroups,
    notClockedInTotal,
    attMap,
    defaultSlotMap,
    currentSlotMap,
    stats,
  } = useMemo(() => {
    const daerimEmps = employees.filter((e) =>
      e.department.includes("대림산업")
    );
    const pkgPosMap = new Map<string, string>();
    for (const p of packagePosition) {
      if (p.empCode) pkgPosMap.set(p.empCode, p.position || "");
    }

    const m = new Map<string, AttendanceRecord>();
    for (const a of attendance) m.set(a.empCode, a);

    const presentBySlot = new Map<string, Employee[]>();
    const presentOthers: Employee[] = [];
    const sajangNot: Employee[] = [];
    const feederNot: Employee[] = [];
    const workerNot: Employee[] = [];

    // 기본 슬롯 (출근 시 자동 배치 위치) + 현재 슬롯 (override 반영)
    const defaultSlotMap = new Map<string, string>();
    const currentSlotMap = new Map<string, string>();

    for (const e of daerimEmps) {
      const def = defaultSlotFor(
        e.empCode,
        e.category,
        e.department,
        e.baseLocation,
        e.position,
        pkgPosMap
      );
      defaultSlotMap.set(e.empCode, def);
      const cur = currentLineOverrides[e.empCode] || def;
      currentSlotMap.set(e.empCode, cur);

      const isPresent = !!m.get(e.empCode)?.isPresent;
      if (!isPresent) {
        const grp = classifyGroup(e);
        if (grp === "소사장") sajangNot.push(e);
        else if (grp === "피더") feederNot.push(e);
        else if (grp === "작업자") workerNot.push(e);
        continue;
      }
      if (cur === "기타" || !GRID_LINES.has(cur)) {
        presentOthers.push(e);
      } else {
        if (!presentBySlot.has(cur)) presentBySlot.set(cur, []);
        presentBySlot.get(cur)!.push(e);
      }
    }

    const cmp = (a: Employee, b: Employee) => a.name.localeCompare(b.name, "ko");
    for (const arr of presentBySlot.values()) arr.sort(cmp);
    presentOthers.sort(cmp);
    sajangNot.sort(cmp);
    feederNot.sort(cmp);
    workerNot.sort(cmp);

    const notClockedInTotal =
      sajangNot.length + feederNot.length + workerNot.length;
    const total = daerimEmps.length;
    const present = total - notClockedInTotal;

    return {
      presentBySlot,
      presentOthers,
      notClockedInGroups: { 소사장: sajangNot, 피더: feederNot, 작업자: workerNot },
      notClockedInTotal,
      attMap: m,
      defaultSlotMap,
      currentSlotMap,
      stats: { total, present, absent: notClockedInTotal },
    };
  }, [employees, attendance, packagePosition, currentLineOverrides]);

  if (!hydrated) return null;

  if (employees.length === 0) {
    return (
      <EmptyState
        title="기준자료가 필요합니다"
        description="대림산업 직원 정보를 보려면 먼저 근무기준을 업로드하세요."
        ctaLabel="기준자료 업로드"
        ctaHref="/master-data"
      />
    );
  }

  // 이름 클릭 → 모달 오픈
  const openModalFor = (e: Employee) => {
    const isPresent = !!attMap.get(e.empCode)?.isPresent;
    const currentLine = currentSlotMap.get(e.empCode) || "";
    setModal({
      open: true,
      empCode: e.empCode,
      name: e.name,
      currentLine,
      isPresent,
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

  const handleSupport = () => {
    logSupport(modal.empCode, modal.name, modal.currentLine);
    closeModal();
  };

  // 드래그 핸들러 — 라인 슬롯 간 이동
  const handleDrop = (toLine: string, empCode: string, name: string) => {
    const fromLine = currentSlotMap.get(empCode) || "";
    if (fromLine === toLine) return;
    moveWorkerLine(empCode, name, fromLine, toLine);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            대림산업 · 출근 체크
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자{" "}
            <span className="font-semibold">{workDate || "(미지정)"}</span>
            <span className="ml-3 text-slate-400">
              이름 클릭으로 출근·퇴근·지원 / 드래그앤드롭으로 라인 이동
            </span>
          </p>
        </div>
        <div className="flex gap-2">
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
          {LINE_GRID.map((row, ri) => (
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
                  workers={presentBySlot.get(line) ?? []}
                  attMap={attMap}
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
                    attendance={attMap.get(e.empCode)}
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

        {notClockedInTotal > 0 && (
          <div className="w-60 flex-shrink-0 card border-amber-200 bg-amber-50/40 self-stretch">
            <h2 className="font-semibold text-slate-900 mb-3 text-sm">
              출근 전{" "}
              <span className="text-xs font-normal text-amber-700">
                ({notClockedInTotal}명)
              </span>
            </h2>
            <div className="space-y-4">
              {(["소사장", "피더", "작업자"] as const).map((grp) => (
                <NotClockedInGroup
                  key={grp}
                  label={grp}
                  workers={notClockedInGroups[grp]}
                  onClickName={openModalFor}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <ActionModal
        open={modal.open}
        workerName={modal.name}
        workerEmpCode={modal.empCode}
        currentLine={modal.currentLine}
        isPresent={modal.isPresent}
        onClose={closeModal}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
        onSupport={handleSupport}
      />
    </div>
  );
}

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
      <div className="font-bold text-slate-800 text-sm mb-2 border-b border-amber-300 pb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-xs font-normal text-slate-500">
          {workers.length}명
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {workers.length === 0 ? (
          <span className="text-xs text-slate-400 italic px-2">없음</span>
        ) : (
          workers.map((e) => (
            <button
              key={e.empCode}
              type="button"
              onClick={() => onClickName(e)}
              className="w-full px-3 py-1.5 rounded-md text-sm font-semibold border bg-white border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors text-center"
              title={`${e.name}`}
            >
              {e.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function LineCard({
  line,
  workers,
  attMap,
  onChipClick,
  onDropWorker,
  draggingEmpCode,
  setDraggingEmpCode,
}: {
  line: string;
  workers: Employee[];
  attMap: Map<string, AttendanceRecord>;
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
      const { empCode, name } = JSON.parse(raw) as { empCode: string; name: string };
      onDropWorker(empCode, name);
    } catch {
      // ignore
    }
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
        <div className="font-bold text-slate-800 text-sm">
          {line === "자동포장라인" ? "자동포장" : line}
        </div>
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
              attendance={attMap.get(e.empCode)}
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
  attendance,
  onClick,
  draggable,
  draggingEmpCode,
  setDraggingEmpCode,
}: {
  employee: Employee;
  attendance: AttendanceRecord | undefined;
  onClick: () => void;
  draggable: boolean;
  draggingEmpCode: string | null;
  setDraggingEmpCode: (s: string | null) => void;
}) {
  const timeLabel = formatTime(attendance?.startTime);
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
        "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
      title={`${employee.name} · 출근 ${timeLabel}${draggable ? " · 드래그로 라인 이동" : ""}`}
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

function formatTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
    return value;
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalMin = Math.round(value * 24 * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  return String(value);
}
