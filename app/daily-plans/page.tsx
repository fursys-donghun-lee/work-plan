"use client";

import { useEffect, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { AdminGuard } from "@/components/AdminGuard";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { cn } from "@/lib/utils";

interface DailyPlanDoc {
  date: string;
  company: string;
  directWorkers: number;
  feederPresent: number;
  overtimeDirect: number;
  overtimeFeeder: number;
  expectedProduction: number;
  expectedWorkHours: number;
  expectedProductionPerHour: number;
  totalLoad: number;
  workHours: number;
  idleHours: number;
  totalCarry: number;
  // 대림 추가 필드
  sajangPresent?: number;
  pojangCheolMulPresent?: number;
  pojangCheolMulOTConfirmed?: number;
  totalAttendance?: number; // 합산 출근 (직접+소사장+피더+포장철물)
  totalOT?: number; // 합산 잔업
}

function formatMoney(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export default function DailyPlansPage() {
  return (
    <AdminGuard>
      <DailyPlansContent />
    </AdminGuard>
  );
}

function DailyPlansContent() {
  const hydrated = useHydrated();
  const [docs, setDocs] = useState<DailyPlanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setError("Firebase 설정이 필요합니다");
      setLoading(false);
      return;
    }
    const db = getDb();
    const q = query(collection(db, "dailyPlans"), orderBy("date", "desc"));
    getDocs(q)
      .then((snap) => {
        const arr: DailyPlanDoc[] = [];
        snap.forEach((d) => arr.push(d.data() as DailyPlanDoc));
        setDocs(arr);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  if (!hydrated) return null;

  // 일자별 그룹화 (한 날짜에 여러 회사 가능)
  const byDate = new Map<string, DailyPlanDoc[]>();
  for (const d of docs) {
    const arr = byDate.get(d.date) ?? [];
    arr.push(d);
    byDate.set(d.date, arr);
  }
  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  // 합계 (전체)
  const total = docs.reduce(
    (acc, d) => ({
      directWorkers: acc.directWorkers + d.directWorkers,
      overtimeDirect: acc.overtimeDirect + d.overtimeDirect,
      expectedProduction: acc.expectedProduction + d.expectedProduction,
      expectedWorkHours: acc.expectedWorkHours + d.expectedWorkHours,
    }),
    {
      directWorkers: 0,
      overtimeDirect: 0,
      expectedProduction: 0,
      expectedWorkHours: 0,
    }
  );
  const totalProdPerHour =
    total.expectedWorkHours > 0
      ? Math.round(total.expectedProduction / total.expectedWorkHours)
      : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          일자별 근무계획 / 예상생산액
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          확정한 일자별 근무계획 데이터 누적 (관리자 전용)
        </p>
      </div>

      {/* 합계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="총 직접 인원-일"
          value={`${total.directWorkers}명`}
          tone="slate"
        />
        <SummaryCard
          label="총 잔업 인원-일"
          value={`${total.overtimeDirect}명`}
          tone="rose"
        />
        <SummaryCard
          label="누적 예상 생산액"
          value={formatMoney(total.expectedProduction)}
          tone="emerald"
        />
        <SummaryCard
          label="평균 시간당생산액"
          value={formatMoney(totalProdPerHour)}
          tone="indigo"
        />
      </div>

      {loading && (
        <div className="card text-center py-8 text-slate-500">
          불러오는 중…
        </div>
      )}
      {error && (
        <div className="card text-center py-8 text-rose-700 bg-rose-50">
          {error}
        </div>
      )}
      {!loading && !error && docs.length === 0 && (
        <div className="card text-center py-8 text-slate-500">
          확정된 일자별 근무계획이 없습니다. /plan 페이지에서 [확정] 을
          누르면 그날의 계획이 저장됩니다.
        </div>
      )}

      {/* 일자별 카드 */}
      {dates.map((date) => {
        const rows = byDate.get(date) ?? [];
        const dailyTotal = rows.reduce(
          (acc, r) => ({
            directWorkers: acc.directWorkers + r.directWorkers,
            overtimeDirect: acc.overtimeDirect + r.overtimeDirect,
            expectedProduction: acc.expectedProduction + r.expectedProduction,
            expectedWorkHours: acc.expectedWorkHours + r.expectedWorkHours,
          }),
          {
            directWorkers: 0,
            overtimeDirect: 0,
            expectedProduction: 0,
            expectedWorkHours: 0,
          }
        );
        const dailyPerHour =
          dailyTotal.expectedWorkHours > 0
            ? Math.round(
                dailyTotal.expectedProduction / dailyTotal.expectedWorkHours
              )
            : 0;
        return (
          <div key={date} className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-slate-900">{date}</h2>
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-emerald-700">
                  {formatMoney(dailyTotal.expectedProduction)}
                </span>
                <span className="text-slate-400 mx-2">·</span>
                <span>
                  시간당생산액{" "}
                  <span className="font-semibold text-indigo-700">
                    {formatMoney(dailyPerHour)}
                  </span>
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base text-sm">
                <thead>
                  <tr>
                    <th>회사</th>
                    <th>직접</th>
                    <th>소사장</th>
                    <th>피더</th>
                    <th>포장철물</th>
                    <th>총 출근</th>
                    <th>잔업 합계</th>
                    <th>총 부하</th>
                    <th>예상 근무시간</th>
                    <th>예상 생산액</th>
                    <th>시간당생산액</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const totalAttn =
                      r.totalAttendance ??
                      r.directWorkers +
                        (r.sajangPresent ?? 0) +
                        r.feederPresent +
                        (r.pojangCheolMulPresent ?? 0);
                    const totalOTAll =
                      r.totalOT ??
                      r.overtimeDirect +
                        r.overtimeFeeder +
                        (r.pojangCheolMulOTConfirmed ?? 0);
                    return (
                      <tr key={`${r.date}_${r.company}`}>
                        <td className="font-semibold">{r.company}</td>
                        <td className="text-center">
                          {r.directWorkers}
                          <span className="text-[10px] text-rose-600 ml-1">
                            ({r.overtimeDirect})
                          </span>
                        </td>
                        <td className="text-center text-slate-500">
                          {r.sajangPresent ?? 0}
                        </td>
                        <td className="text-center text-slate-500">
                          {r.feederPresent}
                          <span className="text-[10px] text-rose-600 ml-1">
                            ({r.overtimeFeeder})
                          </span>
                        </td>
                        <td className="text-center text-slate-500">
                          {r.pojangCheolMulPresent ?? 0}
                          {(r.pojangCheolMulOTConfirmed ?? 0) > 0 && (
                            <span className="text-[10px] text-rose-600 ml-1">
                              ({r.pojangCheolMulOTConfirmed})
                            </span>
                          )}
                        </td>
                        <td className="text-center font-semibold">
                          {totalAttn}명
                        </td>
                        <td className="text-center text-rose-700 font-semibold">
                          {totalOTAll}명
                        </td>
                        <td className="text-center">
                          {r.totalLoad.toFixed(1)}인시
                        </td>
                        <td className="text-center">
                          {r.expectedWorkHours.toFixed(0)}h
                        </td>
                        <td className="text-right text-emerald-700 font-semibold">
                          {formatMoney(r.expectedProduction)}
                        </td>
                        <td className="text-right text-indigo-700 font-semibold">
                          {formatMoney(r.expectedProductionPerHour)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* 계산 공식 안내 */}
      <div className="card border-slate-200 bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 mb-2">계산 공식</h3>
        <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
          <li>
            <b>총 출근</b> (대림 기준) = 직접 + 소사장 + 피더 + 포장철물
            (메인 대시보드 출근 인원 표시용)
          </li>
          <li>
            <b>잔업 합계</b> = 직접 잔업 + 피더 잔업 + 포장철물 잔업(확정)
            (표시용)
          </li>
          <li>
            <b>포장철물 잔업확정</b>: 포장2라인 직접 잔업확정 ≥ 1명이면
            포장철물 출근자 전원 잔업
          </li>
          <li>
            <b>예상 생산액</b> = <span className="font-mono">직접 출근 ×
            4,200,000원 + 직접 잔업인원 × 1,500,000원</span> (3h 잔업 기준,
            소사장/피더/포장철물 미포함)
          </li>
          <li>
            <b>예상 근무시간</b> = 직접 출근 × 8h + 직접 잔업인원 × 3h × 1.5
          </li>
          <li>
            <b>시간당생산액</b> = 예상 생산액 ÷ 예상 근무시간
          </li>
        </ul>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "rose" | "emerald" | "indigo";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "slate" && "border-slate-200 bg-slate-50",
        tone === "rose" && "border-rose-200 bg-rose-50",
        tone === "emerald" && "border-emerald-200 bg-emerald-50",
        tone === "indigo" && "border-indigo-200 bg-indigo-50"
      )}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={cn(
          "text-base font-bold mt-0.5",
          tone === "slate" && "text-slate-800",
          tone === "rose" && "text-rose-700",
          tone === "emerald" && "text-emerald-700",
          tone === "indigo" && "text-indigo-700"
        )}
      >
        {value}
      </div>
    </div>
  );
}
