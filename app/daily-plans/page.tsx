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
          label="평균 시간당 생산액"
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
                  시간당{" "}
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
                    <th>직접 인원</th>
                    <th>피더 출근</th>
                    <th>잔업 (직접/피더)</th>
                    <th>총 부하</th>
                    <th>예상 근무시간</th>
                    <th>예상 생산액</th>
                    <th>시간당 생산액</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.date}_${r.company}`}>
                      <td className="font-semibold">{r.company}</td>
                      <td className="text-center">{r.directWorkers}명</td>
                      <td className="text-center text-slate-500">
                        {r.feederPresent}명
                      </td>
                      <td className="text-center text-rose-700">
                        {r.overtimeDirect} / {r.overtimeFeeder}명
                      </td>
                      <td className="text-center">
                        {r.totalLoad.toFixed(1)}인시
                      </td>
                      <td className="text-center">
                        {r.expectedWorkHours.toFixed(0)}h
                        <span className="text-[10px] text-slate-400 ml-1">
                          (잔업 1.5배)
                        </span>
                      </td>
                      <td className="text-right text-emerald-700 font-semibold">
                        {formatMoney(r.expectedProduction)}
                      </td>
                      <td className="text-right text-indigo-700 font-semibold">
                        {formatMoney(r.expectedProductionPerHour)}
                      </td>
                    </tr>
                  ))}
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
            <b>예상 생산액</b> = 직접 인원 × 4,200,000원 + 잔업 직접인원 ×
            1,500,000원 (3h 잔업 기준)
          </li>
          <li>
            <b>예상 근무시간</b> = 직접 인원 × 8h + 잔업 직접인원 × 3h × 1.5
          </li>
          <li>
            <b>시간당 생산액</b> = 예상 생산액 ÷ 예상 근무시간
          </li>
          <li className="text-slate-400">
            피더는 별도 표기 (현재 생산액 산식에 미포함)
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
