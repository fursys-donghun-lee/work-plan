"use client";

import { useState } from "react";
import { useComputed, useHydrated } from "@/components/useComputed";
import { useDataStore } from "@/lib/store/useDataStore";
import { EmptyState } from "@/components/EmptyState";
import { AlertBanner, type AlertItem } from "@/components/Alerts";
import { CompanyGate, CompanyNotApplicable } from "@/components/CompanyGate";
import { cn, formatDecimal } from "@/lib/utils";

export default function EquipmentPage() {
  return (
    <CompanyGate>
      <EquipmentContent />
    </CompanyGate>
  );
}

function EquipmentContent() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);
  if (!hydrated) return null;
  if (company === "다호산업") {
    return (
      <CompanyNotApplicable
        company="다호산업"
        message={"다호산업은 설비 부하 계산을 사용하지 않습니다.\n메인 대시보드에서 소속별 출근 현황을 확인하세요."}
      />
    );
  }
  return <WoosungEquipment />;
}

function WoosungEquipment() {
  const computed = useComputed();
  const equipmentCount = useDataStore((s) => s.equipment.length);
  const loadPlanCount = useDataStore((s) => s.loadPlan.length);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  if (!computed) return null;

  if (equipmentCount === 0 || loadPlanCount === 0) {
    return (
      <EmptyState
        title="설비기준 또는 라인별 공정 부하 미업로드"
        description="설비별 부하를 보려면 설비기준(기준자료)과 라인별 공정 부하(일일자료) 업로드가 필요합니다."
        ctaLabel="업로드 페이지로"
        ctaHref={equipmentCount === 0 ? "/master-data" : "/upload"}
      />
    );
  }

  const { equipmentLoad, unmatchedPlanEquipment, unmatchedGroupEquipment } = computed;

  const groupOptions = Array.from(
    new Set(equipmentLoad.map((r) => r.groupName))
  ).sort();

  const filtered = equipmentLoad.filter((r) => {
    if (filter !== "all" && r.groupName !== filter) return false;
    if (search.trim() && !r.equipmentName.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const totalLoad = filtered.reduce((s, r) => s + r.appliedHours, 0);
  const totalPlan = filtered.reduce((s, r) => s + r.todayQty, 0);

  const alerts: AlertItem[] = [];
  if (unmatchedPlanEquipment.length > 0) {
    alerts.push({
      level: "warning",
      message: `라인별 공정 부하에 있으나 설비기준에 없는 설비 ${unmatchedPlanEquipment.length}건`,
      detail: unmatchedPlanEquipment.map((u) => `${u.name} (계획량 ${u.qty})`).join(", "),
    });
  }
  if (unmatchedGroupEquipment.length > 0) {
    alerts.push({
      level: "info",
      message: `작업그룹에 매핑되지 않은 설비 ${unmatchedGroupEquipment.length}건 (부하는 계산되나 그룹별 부하에는 미반영)`,
      detail: unmatchedGroupEquipment.join(", "),
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">설비별 부하</h1>
        <p className="text-sm text-slate-500 mt-1">
          설비별 8시간 CAPA 대비 당일 계획량을 표시합니다. 데스커 자동화 1·2호기는 반영계수 0.5가 적용됩니다.
        </p>
      </div>

      <AlertBanner items={alerts} />

      <div className="card">
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <select
            className="select w-44"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">모든 작업그룹</option>
            {groupOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <input
            className="input flex-1 max-w-md"
            placeholder="설비명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="ml-auto text-sm text-slate-600">
            <span className="mr-4">계획량 합계: <b>{formatDecimal(totalPlan)}</b></span>
            <span>반영부하시간 합계: <b>{formatDecimal(totalLoad)}h</b></span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>작업그룹</th>
                <th>소속</th>
                <th>작업자</th>
                <th>설비명</th>
                <th className="text-right">8h CAPA</th>
                <th className="text-right">당일 계획량</th>
                <th className="text-right">CAPA 대비</th>
                <th className="text-right">원부하</th>
                <th className="text-right">계수</th>
                <th className="text-right">반영부하</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.equipmentName}>
                  <td>
                    <span
                      className={cn(
                        "badge",
                        r.groupName === "미지정" ? "badge-amber" : "badge-blue"
                      )}
                    >
                      {r.groupName}
                    </span>
                  </td>
                  <td>{r.affiliation}</td>
                  <td className="text-xs text-slate-600">{r.workers.join(", ")}</td>
                  <td className="font-mono text-xs">{r.equipmentName}</td>
                  <td className="text-right">{r.capa8h.toLocaleString()}</td>
                  <td className="text-right font-medium">{r.todayQty.toLocaleString()}</td>
                  <td className="text-right">{(r.capaRatio * 100).toFixed(1)}%</td>
                  <td className="text-right">{formatDecimal(r.rawHours)}</td>
                  <td className="text-right">
                    {r.factor !== 1 ? (
                      <span className="badge badge-amber">×{r.factor}</span>
                    ) : (
                      r.factor.toFixed(1)
                    )}
                  </td>
                  <td
                    className={cn(
                      "text-right font-semibold",
                      r.appliedHours > 0 && "text-slate-900"
                    )}
                  >
                    {formatDecimal(r.appliedHours)}h
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-slate-500 py-6">
                    조건에 맞는 설비가 없습니다.
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
