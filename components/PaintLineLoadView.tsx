"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { EmptyState } from "@/components/EmptyState";
import {
  summarizeByPackage1,
  summarizeByPaintLine,
  type LineGroupSummary,
} from "@/lib/calc/paintLineLoad";
import { cn, formatDecimal } from "@/lib/utils";
import type { PaintPlanRow } from "@/lib/types";

type Mode = "paint" | "package1";

interface Props {
  mode: Mode;
}

export function PaintLineLoadView({ mode }: Props) {
  const hydrated = useHydrated();
  const paintPlan = useDataStore((s) => s.paintPlan);
  const workDate = useDataStore((s) => s.workDate);
  const [selectedLine, setSelectedLine] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const groups = useMemo<LineGroupSummary[]>(() => {
    if (mode === "paint") return summarizeByPaintLine(paintPlan);
    return summarizeByPackage1(paintPlan).groups;
  }, [mode, paintPlan]);

  const totalSummary = useMemo<LineGroupSummary>(() => {
    if (mode === "paint") {
      const allRows = groups.flatMap((g) => g.rows);
      const totalMin = groups.reduce((s, g) => s + g.totalPlanMinutes, 0);
      return {
        lineName: "전체",
        itemCount: allRows.length,
        totalPlanQty: groups.reduce((s, g) => s + g.totalPlanQty, 0),
        totalPlanMinutes: totalMin,
        totalPlanHours: Math.round((totalMin / 60) * 10) / 10,
        inputQty: groups.reduce((s, g) => s + g.inputQty, 0),
        prodQty: groups.reduce((s, g) => s + g.prodQty, 0),
        rows: allRows,
      };
    }
    return summarizeByPackage1(paintPlan).total;
  }, [mode, paintPlan, groups]);

  const filteredRows = useMemo(() => {
    let rows: PaintPlanRow[] =
      selectedLine === "all"
        ? groups.flatMap((g) => g.rows)
        : (groups.find((g) => g.lineName === selectedLine)?.rows ?? []);

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.partCode.toLowerCase().includes(q) ||
          r.partName.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.cardNo.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [groups, selectedLine, search]);

  if (!hydrated) return null;

  if (paintPlan.length === 0) {
    return (
      <EmptyState
        title="도장계획을 먼저 업로드해주세요"
        description={"일일자료 업로드 페이지에서 도장계획 엑셀을 업로드하면\n도장라인·포장1라인 부하를 확인할 수 있습니다."}
        ctaLabel="일일자료 업로드"
        ctaHref="/upload"
      />
    );
  }

  const title = mode === "paint" ? "도장라인 부하" : "포장1라인 부하";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            근무일자: <span className="font-semibold">{workDate || "(미지정)"}</span>
            {mode === "package1" && (
              <span className="ml-3 text-slate-400">
                도장계획 AZ열(포장라인)이 "포장1"로 시작하는 항목만 집계
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 라인별 요약 카드 */}
      <div
        className={cn(
          "grid gap-3",
          groups.length <= 2
            ? "grid-cols-1 md:grid-cols-2"
            : groups.length <= 4
              ? "grid-cols-2 lg:grid-cols-4"
              : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        )}
      >
        {groups.map((g) => (
          <LineCard
            key={g.lineName}
            summary={g}
            active={selectedLine === g.lineName}
            onClick={() =>
              setSelectedLine(selectedLine === g.lineName ? "all" : g.lineName)
            }
          />
        ))}
      </div>

      {/* 전체 합계 */}
      <div className="card bg-slate-50 border-slate-300">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryStat label="라인 수" value={groups.length} />
          <SummaryStat label="총 건수" value={totalSummary.itemCount} />
          <SummaryStat label="총 계획량" value={totalSummary.totalPlanQty} />
          <SummaryStat
            label="총 계획시간"
            value={`${formatDecimal(totalSummary.totalPlanHours)}h`}
          />
          <SummaryStat
            label="진행률"
            value={
              totalSummary.totalPlanQty > 0
                ? `${((totalSummary.prodQty / totalSummary.totalPlanQty) * 100).toFixed(1)}%`
                : "-"
            }
          />
        </div>
      </div>

      {/* 상세 테이블 */}
      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <select
            className="select w-44"
            value={selectedLine}
            onChange={(e) => setSelectedLine(e.target.value)}
          >
            <option value="all">전체 라인</option>
            {groups.map((g) => (
              <option key={g.lineName} value={g.lineName}>
                {g.lineName}
              </option>
            ))}
          </select>
          <input
            className="input flex-1 max-w-md"
            placeholder="부품코드 / 부품명 / 제품명 / 카드번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="ml-auto text-sm text-slate-600">
            {filteredRows.length.toLocaleString()}건
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>우선순위</th>
                <th>{mode === "paint" ? "작업설비" : "포장라인"}</th>
                <th>{mode === "paint" ? "포장라인" : "작업설비"}</th>
                <th>부품코드</th>
                <th>부품명</th>
                <th>제품명</th>
                <th>색상</th>
                <th className="text-right">계획량</th>
                <th className="text-right">투입</th>
                <th className="text-right">생산</th>
                <th className="text-right">계획시간(분)</th>
                <th>현공정</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => (
                <tr key={`${r.cardNo}-${idx}`}>
                  <td className="text-center text-xs">{r.priority}</td>
                  <td>
                    <span className="badge badge-blue text-xs">
                      {mode === "paint" ? r.paintLine : r.packageLine}
                    </span>
                  </td>
                  <td className="text-xs text-slate-600">
                    {mode === "paint" ? r.packageLine : r.paintLine}
                  </td>
                  <td className="font-mono text-xs">{r.partCode}</td>
                  <td className="text-xs max-w-xs truncate" title={r.partName}>
                    {r.partName}
                  </td>
                  <td className="text-xs max-w-xs truncate" title={r.productName}>
                    {r.productName}
                  </td>
                  <td>
                    <span className="badge badge-gray text-xs">{r.partColor}</span>
                  </td>
                  <td className="text-right font-medium">{r.planQty}</td>
                  <td className="text-right text-slate-600">{r.inputQty}</td>
                  <td className="text-right text-slate-600">{r.prodQty}</td>
                  <td className="text-right text-slate-600">{r.planMinutes}</td>
                  <td className="text-xs">{r.currentProcess || "-"}</td>
                  <td className="text-xs text-slate-600">{r.workStatus || "-"}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center text-slate-500 py-6">
                    조건에 맞는 항목이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LineCard({
  summary,
  active,
  onClick,
}: {
  summary: LineGroupSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
          : "border-slate-200 bg-white hover:bg-slate-50"
      )}
    >
      <div className="text-sm font-semibold text-slate-700 truncate">
        {summary.lineName}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-slate-900">
          {summary.itemCount}
        </span>
        <span className="text-xs text-slate-500">건</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 text-xs">
        <span className="text-slate-500">계획량</span>
        <span className="text-right font-medium">
          {summary.totalPlanQty.toLocaleString()}
        </span>
        <span className="text-slate-500">계획시간</span>
        <span className="text-right font-medium">
          {formatDecimal(summary.totalPlanHours)}h
        </span>
        <span className="text-slate-500">진행</span>
        <span className="text-right font-medium">
          {summary.prodQty} / {summary.totalPlanQty}
        </span>
      </div>
    </button>
  );
}

function SummaryStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-900 mt-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
