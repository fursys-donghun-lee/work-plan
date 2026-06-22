"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { cn } from "@/lib/utils";
import type { Employee, WorkLogEntry, WorkLogAction } from "@/lib/types";

const ACTION_TONE: Record<WorkLogAction, string> = {
  출근: "bg-emerald-100 text-emerald-800 border-emerald-300",
  퇴근: "bg-rose-100 text-rose-800 border-rose-300",
  미출근: "bg-rose-100 text-rose-800 border-rose-300",
  지원: "bg-blue-100 text-blue-800 border-blue-300",
  이동: "bg-amber-100 text-amber-800 border-amber-300",
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatHHMM(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export interface WorkLogViewProps {
  title: string;
  description?: string;
  // 이 페이지에 포함할 직원 필터 (회사 + 카테고리)
  employeeFilter: (e: Employee) => boolean;
}

export function WorkLogView({
  title,
  description,
  employeeFilter,
}: WorkLogViewProps) {
  const hydrated = useHydrated();
  const workLog = useDataStore((s) => s.workLog);
  const employees = useDataStore((s) => s.employees);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // 필터 매칭되는 직원 사원코드 집합
  const targetEmpCodes = useMemo(() => {
    const s = new Set<string>();
    for (const e of employees) {
      if (employeeFilter(e)) s.add(e.empCode);
    }
    return s;
  }, [employees, employeeFilter]);

  const { entriesByEmp, allDates } = useMemo(() => {
    const dates = new Set<string>();
    for (const e of workLog) dates.add(e.workDate);
    dates.add(todayStr());

    const byEmp = new Map<string, WorkLogEntry[]>();
    for (const e of workLog) {
      if (e.workDate !== selectedDate) continue;
      if (!targetEmpCodes.has(e.empCode)) continue;
      if (!byEmp.has(e.empCode)) byEmp.set(e.empCode, []);
      byEmp.get(e.empCode)!.push(e);
    }
    for (const arr of byEmp.values()) {
      arr.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    return {
      entriesByEmp: byEmp,
      allDates: Array.from(dates).sort().reverse(),
    };
  }, [workLog, targetEmpCodes, selectedDate]);

  const sortedEmps = useMemo(() => {
    const arr = Array.from(entriesByEmp.entries());
    arr.sort(([, aLog], [, bLog]) => {
      const aFirst = aLog[0]?.timestamp || "";
      const bFirst = bLog[0]?.timestamp || "";
      return aFirst.localeCompare(bFirst);
    });
    return arr;
  }, [entriesByEmp]);

  if (!hydrated) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {description ??
              "출근·퇴근·지원·이동 이력 — 현장 대시보드에서 발생한 모든 액션이 여기 기록됩니다"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">날짜</label>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm border border-slate-300 rounded px-2 py-1"
          >
            {allDates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sortedEmps.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          선택한 날짜에 기록된 근무 이력이 없습니다.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">이름</th>
                <th className="text-left">사원코드</th>
                <th className="text-left w-2/3">이력 (시각순)</th>
              </tr>
            </thead>
            <tbody>
              {sortedEmps.map(([empCode, entries]) => (
                <tr key={empCode}>
                  <td className="font-semibold text-slate-900">
                    {entries[0]?.name || ""}
                  </td>
                  <td className="text-xs text-slate-500">{empCode}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {entries.map((e) => (
                        <LogChip key={e.id} entry={e} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card border-slate-200 bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 mb-2 text-sm">색상 안내</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["출근", "미출근", "지원", "이동"] as WorkLogAction[]).map((a) => (
            <span
              key={a}
              className={cn(
                "px-2 py-0.5 rounded border font-semibold",
                ACTION_TONE[a]
              )}
            >
              {a}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LogChip({ entry }: { entry: WorkLogEntry }) {
  const hhmm = formatHHMM(entry.timestamp);
  const tone = ACTION_TONE[entry.action];

  const displayLine = (l: string) =>
    l === "자동포장라인" ? "자동포장" : l;

  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded border text-xs font-semibold whitespace-nowrap",
        tone
      )}
      title={new Date(entry.timestamp).toLocaleString("ko-KR")}
    >
      {hhmm} · {entry.action}
      {entry.action === "이동" && entry.fromLine && entry.toLine && (
        <span className="ml-1 font-normal opacity-80">
          ({displayLine(entry.fromLine)} → {displayLine(entry.toLine)})
        </span>
      )}
      {entry.action !== "이동" && entry.line && (
        <span className="ml-1 font-normal opacity-80">
          ({displayLine(entry.line)})
        </span>
      )}
    </span>
  );
}
