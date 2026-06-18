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
  ["PA-06", "PA-07", "자동포장라인", "포장철물"],
  ["MA-01", "MA-02", "MA-03", "MM-05"],
];

// 그리드 라인 (Set) — 포장철물 포함
const GRID_LINES = new Set<string>(LINE_GRID.flat());

// 직원의 슬롯 결정 — 포장철물 키워드는 baseLocation 우선
function slotFor(category: string, department: string, baseLocation: string, position: string): string {
  if (
    category.includes("포장철물") ||
    department.includes("포장철물") ||
    baseLocation.includes("포장철물") ||
    position.includes("포장철물")
  ) {
    return "포장철물";
  }
  const loc = (baseLocation || "").trim();
  if (GRID_LINES.has(loc)) return loc;
  return "기타";
}

export function DaerimClockInView() {
  const hydrated = useHydrated();
  const employees = useDataStore((s) => s.employees);
  const attendance = useDataStore((s) => s.attendance);
  const workDate = useDataStore((s) => s.workDate);
  const clockInEmployee = useDataStore((s) => s.clockInEmployee);

  // 대림 직원 추출 + 출근 lookup + 슬롯 매핑
  const { presentBySlot, presentOthers, notClockedIn, attMap, stats } = useMemo(() => {
    const daerimEmps = employees.filter((e) =>
      e.department.includes("대림산업")
    );

    const m = new Map<string, AttendanceRecord>();
    for (const a of attendance) m.set(a.empCode, a);

    const presentBySlot = new Map<string, Employee[]>();
    const presentOthers: Employee[] = [];
    const notClockedIn: Employee[] = [];

    for (const e of daerimEmps) {
      const slot = slotFor(e.category, e.department, e.baseLocation, e.position);
      const isPresent = !!m.get(e.empCode)?.isPresent;
      if (!isPresent) {
        notClockedIn.push(e);
        continue;
      }
      if (slot === "기타") {
        presentOthers.push(e);
      } else {
        if (!presentBySlot.has(slot)) presentBySlot.set(slot, []);
        presentBySlot.get(slot)!.push(e);
      }
    }

    // 정렬 — 이름 가나다순
    const cmp = (a: Employee, b: Employee) => a.name.localeCompare(b.name, "ko");
    for (const arr of presentBySlot.values()) arr.sort(cmp);
    presentOthers.sort(cmp);
    notClockedIn.sort(cmp);

    const total = daerimEmps.length;
    const present = total - notClockedIn.length;

    return {
      presentBySlot,
      presentOthers,
      notClockedIn,
      attMap: m,
      stats: { total, present, absent: notClockedIn.length },
    };
  }, [employees, attendance]);

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

      {/* 출근 전 — 본인 이름 눌러서 출근 처리 */}
      {notClockedIn.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/40">
          <h2 className="font-semibold text-slate-900 mb-3">
            출근 전{" "}
            <span className="text-xs font-normal text-amber-700">
              ({notClockedIn.length}명 — 본인 이름을 눌러서 출근 처리)
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {notClockedIn.map((e) => (
              <WorkerChip
                key={e.empCode}
                employee={e}
                attendance={undefined}
                onClockIn={clockInEmployee}
              />
            ))}
          </div>
        </div>
      )}

      {/* 라인 그리드 (4행) — 출근한 인원만 표시 */}
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
                workers={presentBySlot.get(line) ?? []}
                attMap={attMap}
                onClockIn={clockInEmployee}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 기타 — 출근했지만 13개 라인에 속하지 않는 직원 (사장님 등) */}
      {presentOthers.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-3">
            기타{" "}
            <span className="text-xs font-normal text-slate-500">
              (사장님 · 라인 미지정)
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {presentOthers.map((e) => (
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
  // workers 는 이미 출근한 직원만 들어옴
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 min-h-[120px]">
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
