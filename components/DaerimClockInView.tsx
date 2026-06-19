"use client";

import { useMemo } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
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

// 그리드 라인 (Set) — 포장철물 포함
const GRID_LINES = new Set<string>(LINE_GRID.flat());

// 재배치 계획에서 자동포장라인으로 묶이는 packagePosition.position 값들
//   (useDaerimRealloc 의 AUTO_GROUP_NAMES 와 동일)
const AUTO_PACKAGE_POSITIONS = new Set<string>([
  "PA-01",
  "PA-02",
  "자동포장(파이프)",
]);

// 직원의 슬롯 결정 — 우선순위:
//   1) 포장철물 키워드 매칭 → 포장철물
//   2) 기준자료 포장라인 기본근무위치(packagePosition.position) 매핑
//      · PA-01·PA-02·자동포장(파이프) → 자동포장라인
//      · 그 외 PA/MM/MA → 해당 슬롯
//   3) employee.baseLocation fallback
//   4) 기타
function slotFor(
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

export function DaerimClockInView() {
  const hydrated = useHydrated();
  const employees = useDataStore((s) => s.employees);
  const attendance = useDataStore((s) => s.attendance);
  const workDate = useDataStore((s) => s.workDate);
  const packagePosition = useDataStore((s) => s.packagePosition);
  const clockInEmployee = useDataStore((s) => s.clockInEmployee);
  const clockOutEmployee = useDataStore((s) => s.clockOutEmployee);

  // 대림 직원 추출 + 출근 lookup + 슬롯 매핑 + 미출근 그룹화
  const {
    presentBySlot,
    presentOthers,
    notClockedInGroups,
    notClockedInTotal,
    attMap,
    stats,
  } = useMemo(() => {
    const daerimEmps = employees.filter((e) =>
      e.department.includes("대림산업")
    );

    // 기준자료 포장라인 기본근무위치 → empCode → position 매핑
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

    for (const e of daerimEmps) {
      const slot = slotFor(
        e.empCode,
        e.category,
        e.department,
        e.baseLocation,
        e.position,
        pkgPosMap
      );
      const isPresent = !!m.get(e.empCode)?.isPresent;
      if (!isPresent) {
        const grp = classifyGroup(e);
        if (grp === "소사장") sajangNot.push(e);
        else if (grp === "피더") feederNot.push(e);
        else if (grp === "작업자") workerNot.push(e);
        // 그 외(매칭 안 됨)는 미출근 표시 안 함 (출근 전 카드에는 안 나옴)
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
    sajangNot.sort(cmp);
    feederNot.sort(cmp);
    workerNot.sort(cmp);

    const notClockedInTotal = sajangNot.length + feederNot.length + workerNot.length;
    const total = daerimEmps.length;
    const present = total - notClockedInTotal;

    return {
      presentBySlot,
      presentOthers,
      notClockedInGroups: { 소사장: sajangNot, 피더: feederNot, 작업자: workerNot },
      notClockedInTotal,
      attMap: m,
      stats: { total, present, absent: notClockedInTotal },
    };
  }, [employees, attendance, packagePosition]);

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

      {/* 본문 — 왼쪽: 라인 배치 그리드 / 오른쪽: 출근 전 세로 패널 */}
      <div className="flex gap-4 items-start">
        {/* 왼쪽: 라인 그리드 (4행) — 출근한 인원만 표시 */}
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
                  onClockOut={clockOutEmployee}
                />
              ))}
            </div>
          ))}

          {/* 기타 — 출근했지만 13개 라인에 속하지 않는 직원 (사장님 등) */}
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
                    onClockOut={clockOutEmployee}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 출근 전 그룹 세로 패널 */}
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
                  onClockIn={clockInEmployee}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotClockedInGroup({
  label,
  workers,
  onClockIn,
}: {
  label: string;
  workers: Employee[];
  onClockIn: (empCode: string, name: string) => void;
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
              onClick={() => onClockIn(e.empCode, e.name)}
              className="w-full px-3 py-1.5 rounded-md text-sm font-semibold border bg-white border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors text-center"
              title={`${e.name} · 눌러서 출근`}
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
  onClockOut,
}: {
  line: string;
  workers: Employee[];
  attMap: Map<string, AttendanceRecord>;
  onClockOut: (empCode: string) => void;
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
            <PresentChip
              key={e.empCode}
              employee={e}
              attendance={attMap.get(e.empCode)}
              onClockOut={onClockOut}
            />
          ))
        )}
      </div>
    </div>
  );
}

// 출근한 직원 칩 — 라인 그리드 / 기타 카드에서 사용. 클릭하면 출근 취소
function PresentChip({
  employee,
  attendance,
  onClockOut,
}: {
  employee: Employee;
  attendance: AttendanceRecord | undefined;
  onClockOut: (empCode: string) => void;
}) {
  const timeLabel = formatTime(attendance?.startTime);

  const handleClick = () => {
    if (
      !window.confirm(
        `${employee.name} 출근을 취소할까요? (대기자 목록으로 돌아갑니다)`
      )
    ) {
      return;
    }
    onClockOut(employee.empCode);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="px-2.5 py-1.5 rounded-md text-xs font-semibold border bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 transition-colors"
      title={`${employee.name} · 출근 ${timeLabel} (눌러서 출근 취소)`}
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
