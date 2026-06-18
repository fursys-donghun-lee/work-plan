"use client";

import { useMemo } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import type { Employee, AttendanceRecord } from "@/lib/types";

// 라인 배치 — 사용자 지정 4행 레이아웃
const LINE_GRID: string[][] = [
  ["PA-01", "PA-02", "PA-03", "PA-04", "PA-05"],
  ["MM-01", "MM-02", "MM-03", "MM-04"],
  ["PA-06", "PA-07", "자동포장라인"],
  ["MA-01", "MA-02", "MA-03", "MM-05"],
];

// 그리드 라인에 속하는 13개 라인 (Set)
const GRID_LINES = new Set<string>(LINE_GRID.flat());

export function DaerimClockInView() {
  const hydrated = useHydrated();
  const employees = useDataStore((s) => s.employees);
  const attendance = useDataStore((s) => s.attendance);
  const workDate = useDataStore((s) => s.workDate);
  const clockInEmployee = useDataStore((s) => s.clockInEmployee);

  // 대림 직원 추출 + 출근 lookup
  const { byLocation, otherWorkers, attMap } = useMemo(() => {
    const daerimEmps = employees.filter((e) =>
      e.department.includes("대림산업")
    );
    const byLoc = new Map<string, Employee[]>();
    const others: Employee[] = [];
    for (const e of daerimEmps) {
      const loc = (e.baseLocation || "").trim();
      if (GRID_LINES.has(loc)) {
        if (!byLoc.has(loc)) byLoc.set(loc, []);
        byLoc.get(loc)!.push(e);
      } else {
        others.push(e);
      }
    }
    // 이름 가나다순
    for (const arr of byLoc.values()) arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    others.sort((a, b) => a.name.localeCompare(b.name, "ko"));

    const m = new Map<string, AttendanceRecord>();
    for (const a of attendance) m.set(a.empCode, a);

    return { byLocation: byLoc, otherWorkers: others, attMap: m };
  }, [employees, attendance]);

  // 출근 통계
  const stats = useMemo(() => {
    let total = 0;
    let present = 0;
    for (const arr of byLocation.values()) {
      for (const e of arr) {
        total += 1;
        if (attMap.get(e.empCode)?.isPresent) present += 1;
      }
    }
    for (const e of otherWorkers) {
      total += 1;
      if (attMap.get(e.empCode)?.isPresent) present += 1;
    }
    return { total, present, absent: total - present };
  }, [byLocation, otherWorkers, attMap]);

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
              본인 이름을 누르면 누른 시각으로 출근 처리됩니다.
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

      {/* 라인 그리드 (4행) */}
      <div className="space-y-3">
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
                workers={byLocation.get(line) ?? []}
                attMap={attMap}
                onClockIn={clockInEmployee}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 기타 — 사장님 / 포장철물 / 라인 없는 직원 */}
      {otherWorkers.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-3">
            기타{" "}
            <span className="text-xs font-normal text-slate-500">
              (사장님 · 포장철물 · 라인 미지정)
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {otherWorkers.map((e) => (
              <WorkerChip
                key={e.empCode}
                employee={e}
                attendance={attMap.get(e.empCode)}
                onClockIn={clockInEmployee}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LineCard({
  line,
  workers,
  attMap,
  onClockIn,
}: {
  line: string;
  workers: Employee[];
  attMap: Map<string, AttendanceRecord>;
  onClockIn: (empCode: string, name: string) => void;
}) {
  const presentCount = workers.filter(
    (e) => attMap.get(e.empCode)?.isPresent
  ).length;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 min-h-[120px]">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-slate-800 text-sm">
          {line === "자동포장라인" ? "자동포장" : line}
        </div>
        <div className="text-xs text-slate-500">
          {presentCount}/{workers.length}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {workers.length === 0 ? (
          <div className="text-xs text-slate-400 italic">배정 인원 없음</div>
        ) : (
          workers.map((e) => (
            <WorkerChip
              key={e.empCode}
              employee={e}
              attendance={attMap.get(e.empCode)}
              onClockIn={onClockIn}
            />
          ))
        )}
      </div>
    </div>
  );
}

function WorkerChip({
  employee,
  attendance,
  onClockIn,
}: {
  employee: Employee;
  attendance: AttendanceRecord | undefined;
  onClockIn: (empCode: string, name: string) => void;
}) {
  const isPresent = !!attendance?.isPresent;
  const timeLabel = isPresent ? formatTime(attendance?.startTime) : "";

  const handleClick = () => {
    if (isPresent) {
      // 이미 출근됨 — 다시 누르면 시간 갱신
      if (
        !window.confirm(
          `${employee.name} 출근 시각을 지금 시각으로 다시 찍을까요?`
        )
      ) {
        return;
      }
    }
    onClockIn(employee.empCode, employee.name);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors",
        isPresent
          ? "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200"
          : "bg-slate-50 border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700"
      )}
      title={
        isPresent
          ? `${employee.name} · 출근 ${timeLabel} (눌러서 시간 갱신)`
          : `${employee.name} · 눌러서 출근`
      }
    >
      <span>{employee.name}</span>
      {timeLabel && (
        <span className="ml-1.5 text-[10px] font-normal text-emerald-700">
          {timeLabel}
        </span>
      )}
    </button>
  );
}

// startTime → HH:MM 표시. 엑셀 decimal (0~1) 도 처리
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
