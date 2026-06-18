"use client";

import { useEffect, useMemo, useState } from "react";
import { useHydrated } from "@/components/useComputed";
import { AdminGuard } from "@/components/AdminGuard";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { cn } from "@/lib/utils";

interface PlanDoc {
  date: string;
  company: string;
  // 인원
  totalPeople?: number;
  totalAttendance?: number;
  totalAbsent?: number;
  overtimePeople?: number;
  // 직접 (생산액 산식용)
  directWorkers?: number;
  overtimeDirect?: number;
  // 시간
  standardHours?: number;
  overtimeHours?: number;
  weightedHours?: number;
  // 생산액
  expectedProduction?: number;
  expectedWorkHours?: number;
  expectedProductionPerHour?: number;
}

interface ActualDoc {
  date: string;
  company: string;
  totalPeople?: number;
  totalAttendance?: number;
  totalAbsent?: number;
  overtimePeople?: number;
  standardHours?: number;
  overtimeHours?: number;
  weightedHours?: number;
  expectedProduction?: number;
  expectedProductionPerHour?: number;
}

interface Metrics {
  totalPeople: number;
  totalAttendance: number;
  totalAbsent: number;
  overtimePeople: number;
  standardHours: number;
  overtimeHours: number;
  weightedHours: number;
  expectedProduction: number;
  expectedProductionPerHour: number;
}

function blankMetrics(): Metrics {
  return {
    totalPeople: 0,
    totalAttendance: 0,
    totalAbsent: 0,
    overtimePeople: 0,
    standardHours: 0,
    overtimeHours: 0,
    weightedHours: 0,
    expectedProduction: 0,
    expectedProductionPerHour: 0,
  };
}

function planToMetrics(p: PlanDoc): Metrics {
  return {
    totalPeople: p.totalPeople ?? 0,
    totalAttendance: p.totalAttendance ?? 0,
    totalAbsent: p.totalAbsent ?? 0,
    overtimePeople: p.overtimePeople ?? 0,
    standardHours: p.standardHours ?? 0,
    overtimeHours: p.overtimeHours ?? 0,
    weightedHours: p.weightedHours ?? 0,
    expectedProduction: p.expectedProduction ?? 0,
    expectedProductionPerHour: p.expectedProductionPerHour ?? 0,
  };
}

function actualToMetrics(a: ActualDoc): Metrics {
  return {
    totalPeople: a.totalPeople ?? 0,
    totalAttendance: a.totalAttendance ?? 0,
    totalAbsent: a.totalAbsent ?? 0,
    overtimePeople: a.overtimePeople ?? 0,
    standardHours: a.standardHours ?? 0,
    overtimeHours: a.overtimeHours ?? 0,
    weightedHours: a.weightedHours ?? 0,
    expectedProduction: a.expectedProduction ?? 0,
    expectedProductionPerHour: a.expectedProductionPerHour ?? 0,
  };
}

function sumMetrics(arr: Metrics[]): Metrics {
  const out = blankMetrics();
  for (const m of arr) {
    out.totalPeople += m.totalPeople;
    out.totalAttendance += m.totalAttendance;
    out.totalAbsent += m.totalAbsent;
    out.overtimePeople += m.overtimePeople;
    out.standardHours += m.standardHours;
    out.overtimeHours += m.overtimeHours;
    out.weightedHours += m.weightedHours;
    out.expectedProduction += m.expectedProduction;
  }
  out.expectedProductionPerHour =
    out.weightedHours > 0
      ? Math.round(out.expectedProduction / out.weightedHours)
      : 0;
  return out;
}

function formatMoney(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

const ROWS: {
  key: keyof Metrics;
  label: string;
  unit: string;
  isMoney?: boolean;
}[] = [
  { key: "totalPeople", label: "총인원", unit: "명" },
  { key: "totalAttendance", label: "총출근", unit: "명" },
  { key: "totalAbsent", label: "미출근", unit: "명" },
  { key: "overtimePeople", label: "잔업인원", unit: "명" },
  { key: "standardHours", label: "기본근무시간", unit: "h" },
  { key: "overtimeHours", label: "잔업근무시간", unit: "h" },
  { key: "weightedHours", label: "가중근무시간", unit: "h" },
  { key: "expectedProduction", label: "생산액", unit: "원", isMoney: true },
  {
    key: "expectedProductionPerHour",
    label: "시간당생산액",
    unit: "원",
    isMoney: true,
  },
];

// 차트 — 월별 누계실적 (생산액/시간당생산액/시간메트릭/총인원)
const CHART_METRICS: {
  key: keyof Metrics;
  label: string;
  unit: string;
  isMoney?: boolean;
  isAverage?: boolean; // 누계가 아니라 평균을 보여줄 메트릭 (시간당생산액)
}[] = [
  { key: "expectedProduction", label: "생산액", unit: "원", isMoney: true },
  {
    key: "expectedProductionPerHour",
    label: "시간당생산액",
    unit: "원",
    isMoney: true,
    isAverage: true,
  },
  { key: "standardHours", label: "기본근무시간", unit: "h" },
  { key: "overtimeHours", label: "잔업근무시간", unit: "h" },
  { key: "weightedHours", label: "가중근무시간", unit: "h" },
  { key: "totalPeople", label: "총인원", unit: "명" },
];

export default function DailyPlansPage() {
  return (
    <AdminGuard>
      <DailyPlansContent />
    </AdminGuard>
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function thisMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function DailyPlansContent() {
  const hydrated = useHydrated();
  const [plans, setPlans] = useState<PlanDoc[]>([]);
  const [actuals, setActuals] = useState<ActualDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<"day" | "month">("day");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedMonth, setSelectedMonth] = useState(thisMonthStr);
  const [chartMetric, setChartMetric] =
    useState<keyof Metrics>("expectedProduction");

  // Firestore subscribe — plans & actuals
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setError("Firebase 설정 필요");
      setLoading(false);
      return;
    }
    const db = getDb();
    const qPlans = query(collection(db, "dailyPlans"), orderBy("date", "desc"));
    const unsubPlans = onSnapshot(
      qPlans,
      (snap) => {
        const arr: PlanDoc[] = [];
        snap.forEach((d) => arr.push(d.data() as PlanDoc));
        setPlans(arr);
        setLoading(false);
      },
      (e) => {
        setError(String(e));
        setLoading(false);
      }
    );
    // dailyActuals — collection might not exist yet; getDocs is OK
    getDocs(query(collection(db, "dailyActuals")))
      .then((snap) => {
        const arr: ActualDoc[] = [];
        snap.forEach((d) => arr.push(d.data() as ActualDoc));
        setActuals(arr);
      })
      .catch(() => {});
    return () => unsubPlans();
  }, []);

  // 회사 목록
  const companies = useMemo(() => {
    const s = new Set<string>();
    plans.forEach((p) => s.add(p.company));
    return Array.from(s).sort();
  }, [plans]);

  // 일자 모드: 선택일자의 회사별 (계획, 실적) 매트릭스
  const dayData = useMemo(() => {
    return companies.map((company) => {
      const plan = plans.find(
        (p) => p.date === selectedDate && p.company === company
      );
      const actual = actuals.find(
        (a) => a.date === selectedDate && a.company === company
      );
      return {
        company,
        plan: plan ? planToMetrics(plan) : blankMetrics(),
        actual: actual ? actualToMetrics(actual) : blankMetrics(),
        hasPlan: !!plan,
        hasActual: !!actual,
      };
    });
  }, [companies, plans, actuals, selectedDate]);

  // 월 모드: 선택월의 회사별 누계
  const monthData = useMemo(() => {
    return companies.map((company) => {
      const planRecords = plans.filter(
        (p) => p.date.startsWith(selectedMonth) && p.company === company
      );
      const actualRecords = actuals.filter(
        (a) => a.date.startsWith(selectedMonth) && a.company === company
      );
      return {
        company,
        planDays: planRecords.length,
        actualDays: actualRecords.length,
        plan: sumMetrics(planRecords.map(planToMetrics)),
        actual: sumMetrics(actualRecords.map(actualToMetrics)),
      };
    });
  }, [companies, plans, actuals, selectedMonth]);

  // 선택일자 옵션 — plans 에 있는 날짜들
  const availableDates = useMemo(() => {
    const s = new Set<string>();
    plans.forEach((p) => s.add(p.date));
    actuals.forEach((a) => s.add(a.date));
    s.add(todayStr());
    return Array.from(s).sort().reverse();
  }, [plans, actuals]);

  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    plans.forEach((p) => s.add(p.date.substring(0, 7)));
    actuals.forEach((a) => s.add(a.date.substring(0, 7)));
    s.add(thisMonthStr());
    return Array.from(s).sort().reverse();
  }, [plans, actuals]);

  // 월별 차트 데이터 — 모든 회사 실적을 월별로 누계
  const chartData = useMemo(() => {
    // (months, totals[chartMetric]) — 실적이 있는 모든 월
    const byMonth = new Map<
      string,
      { sum: number; weightedSum: number; productionSum: number; count: number }
    >();
    for (const a of actuals) {
      const month = a.date.substring(0, 7);
      if (!byMonth.has(month)) {
        byMonth.set(month, {
          sum: 0,
          weightedSum: 0,
          productionSum: 0,
          count: 0,
        });
      }
      const b = byMonth.get(month)!;
      const m = actualToMetrics(a);
      b.sum += m[chartMetric] ?? 0;
      b.weightedSum += m.weightedHours ?? 0;
      b.productionSum += m.expectedProduction ?? 0;
      b.count += 1;
    }
    // 최근 12개월만 (오름차순)
    const months = Array.from(byMonth.keys()).sort();
    const recent = months.slice(-12);
    const meta = CHART_METRICS.find((m) => m.key === chartMetric);
    return recent.map((month) => {
      const b = byMonth.get(month)!;
      // 시간당생산액은 합산이 아니라 (총생산액 / 총가중시간) 재계산
      let value: number;
      if (meta?.isAverage) {
        value =
          b.weightedSum > 0
            ? Math.round(b.productionSum / b.weightedSum)
            : 0;
      } else {
        value = b.sum;
      }
      return { month, value };
    });
  }, [actuals, chartMetric]);

  // 실적 편집 핸들러
  const updateActual = async (date: string, company: string, m: Metrics) => {
    if (!isFirebaseConfigured()) return;
    const docId = `${date}_${company}`;
    await setDoc(doc(getDb(), "dailyActuals", docId), {
      date,
      company,
      ...m,
    });
    // 로컬 상태 즉시 갱신
    setActuals((prev) => {
      const idx = prev.findIndex(
        (a) => a.date === date && a.company === company
      );
      const next = [...prev];
      const newDoc: ActualDoc = { date, company, ...m };
      if (idx >= 0) next[idx] = newDoc;
      else next.push(newDoc);
      return next;
    });
  };

  if (!hydrated) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          일자별 근무계획 / 실적
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          계획(확정 시점) 과 실적(수동 입력) 비교 — 관리자 전용
        </p>
      </div>

      {/* 월별 누계실적 차트 */}
      <MonthlyChart
        data={chartData}
        chartMetric={chartMetric}
        setChartMetric={setChartMetric}
      />

      {/* 모드 토글 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("day")}
          className={cn(
            "px-4 py-1.5 rounded font-semibold text-sm",
            mode === "day"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
        >
          일자
        </button>
        <button
          type="button"
          onClick={() => setMode("month")}
          className={cn(
            "px-4 py-1.5 rounded font-semibold text-sm",
            mode === "month"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
        >
          월 누계
        </button>
        <div className="ml-4">
          {mode === "day" ? (
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm border border-slate-300 rounded px-2 py-1"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
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

      {!loading &&
        !error &&
        (mode === "day"
          ? dayData.map(({ company, plan, actual, hasPlan, hasActual }) => (
              <DayCompanyCard
                key={company}
                company={company}
                date={selectedDate}
                plan={plan}
                actual={actual}
                hasPlan={hasPlan}
                hasActual={hasActual}
                onActualChange={(m) => updateActual(selectedDate, company, m)}
              />
            ))
          : monthData.map(
              ({ company, plan, actual, planDays, actualDays }) => (
                <MonthCompanyCard
                  key={company}
                  company={company}
                  month={selectedMonth}
                  plan={plan}
                  actual={actual}
                  planDays={planDays}
                  actualDays={actualDays}
                />
              )
            ))}

      {!loading && !error && companies.length === 0 && (
        <div className="card text-center py-8 text-slate-500">
          확정된 계획이 없습니다. /plan 페이지에서 [확정] 을 누르면 그날의
          계획이 저장됩니다.
        </div>
      )}

      {/* 공식 안내 */}
      <div className="card border-slate-200 bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 mb-2">계산 공식</h3>
        <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
          <li>
            <b>총인원</b> = 대림 부서 전체 직원 / <b>총출근</b> = 직접 +
            소사장 + 피더 + 포장철물 / <b>미출근</b> = 총인원 - 총출근
          </li>
          <li>
            <b>잔업인원</b> = 직접 잔업 + 피더 잔업 + 포장철물 잔업확정
          </li>
          <li>
            <b>기본근무시간</b> = 총출근 × 8시간 /{" "}
            <b>잔업근무시간</b> = 잔업인원 × 3시간 /{" "}
            <b>가중근무시간</b> = 기본 + 잔업 × 1.5
          </li>
          <li>
            <b>생산액</b> = 직접인원 × 4,000,000원 + 직접 잔업인원 ×
            1,400,000원
          </li>
          <li>
            <b>시간당생산액</b> = 생산액 ÷ 가중근무시간
          </li>
        </ul>
      </div>
    </div>
  );
}

// ===== 컴포넌트들 =====

function MonthlyChart({
  data,
  chartMetric,
  setChartMetric,
}: {
  data: { month: string; value: number }[];
  chartMetric: keyof Metrics;
  setChartMetric: (k: keyof Metrics) => void;
}) {
  const meta = CHART_METRICS.find((m) => m.key === chartMetric)!;
  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const niceMax = niceCeil(maxValue);

  // SVG 좌표계
  const PAD_L = 70;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 40;
  const W = 780;
  const H = 280;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const n = data.length;
  const barGap = 8;
  const barW = n > 0 ? (innerW - barGap * (n - 1)) / n : 0;

  // 5단계 y-grid
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) =>
    Math.round((niceMax * i) / ticks)
  );

  const formatValue = (v: number) => {
    if (meta.isMoney) {
      if (v >= 100_000_000) return (v / 100_000_000).toFixed(1) + "억";
      if (v >= 10_000) return (v / 10_000).toFixed(0) + "만";
      return v.toLocaleString("ko-KR");
    }
    if (meta.unit === "h") return v.toFixed(0) + "시간";
    return v + meta.unit;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-bold text-slate-900">월별 누계실적</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">보고 싶은 값</span>
          <select
            value={chartMetric}
            onChange={(e) => setChartMetric(e.target.value as keyof Metrics)}
            className="text-sm border border-slate-300 rounded px-2 py-1 bg-white"
          >
            {CHART_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
                {m.isAverage ? " (월 평균)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          실적이 입력된 월이 없습니다. 일자 모드에서 [실적 입력] 으로 입력하면
          여기에 표시됩니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            style={{ maxWidth: "100%" }}
          >
            {/* Y-axis grid + labels */}
            {tickValues.map((v, i) => {
              const y = PAD_T + innerH - (innerH * i) / ticks;
              return (
                <g key={i}>
                  <line
                    x1={PAD_L}
                    x2={W - PAD_R}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={i === 0 ? "" : "3,3"}
                  />
                  <text
                    x={PAD_L - 6}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="#64748b"
                  >
                    {formatValue(v)}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {data.map((d, i) => {
              const x = PAD_L + i * (barW + barGap);
              const h = niceMax > 0 ? (innerH * d.value) / niceMax : 0;
              const y = PAD_T + innerH - h;
              return (
                <g key={d.month}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    fill="#2563eb"
                    rx={2}
                  />
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#1e293b"
                    fontWeight={600}
                  >
                    {formatValue(d.value)}
                  </text>
                  <text
                    x={x + barW / 2}
                    y={H - PAD_B + 16}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#475569"
                  >
                    {d.month}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">
        {meta.isAverage
          ? "※ 시간당생산액은 월 합산이 아니라 (총 생산액 ÷ 총 가중근무시간) 으로 재계산"
          : "※ 각 월에 입력된 모든 회사 실적의 합계"}
      </p>
    </div>
  );
}

// 차트 y-axis 깔끔한 최대값 (1·2·2.5·5 × 10ⁿ)
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const m = n / base;
  let nice: number;
  if (m <= 1) nice = 1;
  else if (m <= 2) nice = 2;
  else if (m <= 2.5) nice = 2.5;
  else if (m <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function MetricCell({
  value,
  unit,
  isMoney,
}: {
  value: number;
  unit: string;
  isMoney?: boolean;
}) {
  if (isMoney) return <span>{formatMoney(value)}</span>;
  if (unit === "h") return <span>{value.toFixed(1)}시간</span>;
  return (
    <span>
      {value}
      {unit}
    </span>
  );
}

function DiffCell({
  plan,
  actual,
  unit,
  isMoney,
  betterUp,
}: {
  plan: number;
  actual: number;
  unit: string;
  isMoney?: boolean;
  betterUp?: boolean;
}) {
  const diff = actual - plan;
  if (Math.abs(diff) < 1e-6) {
    return <span className="text-slate-400">0</span>;
  }
  const good = betterUp ? diff > 0 : diff < 0;
  return (
    <span
      className={cn(
        "font-semibold",
        good ? "text-emerald-700" : "text-rose-700"
      )}
    >
      {diff > 0 ? "+" : ""}
      {isMoney
        ? formatMoney(diff)
        : unit === "h"
          ? `${diff.toFixed(1)}시간`
          : `${diff}${unit}`}
    </span>
  );
}

function DayCompanyCard({
  company,
  date,
  plan,
  actual,
  hasPlan,
  hasActual,
  onActualChange,
}: {
  company: string;
  date: string;
  plan: Metrics;
  actual: Metrics;
  hasPlan: boolean;
  hasActual: boolean;
  onActualChange: (m: Metrics) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Metrics>(actual);
  useEffect(() => {
    if (!editMode) setDraft(actual);
  }, [actual, editMode]);

  const handleSave = () => {
    onActualChange(draft);
    setEditMode(false);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-slate-900">
          {company}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {date}
            {!hasPlan && " · 계획 없음"}
            {!hasActual && hasPlan && " · 실적 미입력"}
          </span>
        </h2>
        <div className="flex gap-2">
          {!editMode ? (
            <button
              type="button"
              onClick={() => {
                setDraft(hasActual ? actual : plan);
                setEditMode(true);
              }}
              className="text-xs px-3 py-1 border border-slate-300 hover:bg-slate-50 rounded"
            >
              실적 {hasActual ? "수정" : "입력"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="text-xs px-3 py-1 border border-slate-300 hover:bg-slate-50 rounded"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                저장
              </button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 font-semibold text-slate-600 w-1/4">
                항목
              </th>
              <th className="text-right py-2 px-2 font-semibold text-blue-700">
                계획
              </th>
              <th className="text-right py-2 px-2 font-semibold text-emerald-700">
                실적
              </th>
              <th className="text-right py-2 px-2 font-semibold text-slate-600">
                차이
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, label, unit, isMoney }) => (
              <tr key={key} className="border-b border-slate-100">
                <td className="py-1.5 px-2 text-slate-700">{label}</td>
                <td className="text-right py-1.5 px-2 text-blue-700">
                  <MetricCell value={plan[key]} unit={unit} isMoney={isMoney} />
                </td>
                <td className="text-right py-1.5 px-2 text-emerald-700">
                  {editMode ? (
                    <input
                      type="number"
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [key]: Number(e.target.value) || 0,
                        })
                      }
                      className="text-right w-24 border border-slate-300 rounded px-1 py-0.5 text-sm"
                    />
                  ) : (
                    <MetricCell
                      value={actual[key]}
                      unit={unit}
                      isMoney={isMoney}
                    />
                  )}
                </td>
                <td className="text-right py-1.5 px-2">
                  {hasActual && !editMode ? (
                    <DiffCell
                      plan={plan[key]}
                      actual={actual[key]}
                      unit={unit}
                      isMoney={isMoney}
                      betterUp={
                        key === "expectedProduction" ||
                        key === "expectedProductionPerHour" ||
                        key === "totalAttendance"
                      }
                    />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthCompanyCard({
  company,
  month,
  plan,
  actual,
  planDays,
  actualDays,
}: {
  company: string;
  month: string;
  plan: Metrics;
  actual: Metrics;
  planDays: number;
  actualDays: number;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-slate-900">
          {company}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {month} · 계획 {planDays}일 / 실적 {actualDays}일
          </span>
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 font-semibold text-slate-600 w-1/4">
                항목 (월 누계)
              </th>
              <th className="text-right py-2 px-2 font-semibold text-blue-700">
                계획
              </th>
              <th className="text-right py-2 px-2 font-semibold text-emerald-700">
                실적
              </th>
              <th className="text-right py-2 px-2 font-semibold text-slate-600">
                차이
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, label, unit, isMoney }) => (
              <tr key={key} className="border-b border-slate-100">
                <td className="py-1.5 px-2 text-slate-700">{label}</td>
                <td className="text-right py-1.5 px-2 text-blue-700">
                  <MetricCell value={plan[key]} unit={unit} isMoney={isMoney} />
                </td>
                <td className="text-right py-1.5 px-2 text-emerald-700">
                  <MetricCell value={actual[key]} unit={unit} isMoney={isMoney} />
                </td>
                <td className="text-right py-1.5 px-2">
                  {actualDays > 0 ? (
                    <DiffCell
                      plan={plan[key]}
                      actual={actual[key]}
                      unit={unit}
                      isMoney={isMoney}
                      betterUp={
                        key === "expectedProduction" ||
                        key === "expectedProductionPerHour" ||
                        key === "totalAttendance"
                      }
                    />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
