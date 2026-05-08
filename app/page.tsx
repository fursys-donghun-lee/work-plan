"use client";

import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { IntegratedDashboard } from "@/components/IntegratedDashboard";
import { CompanyMainDashboard } from "@/components/CompanyMainDashboard";
import { AdminGuard } from "@/components/AdminGuard";

export default function MainDashboardPage() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);
  if (!hydrated) return null;
  if (company === "전체") {
    // 통합 대시보드는 관리자 전용
    return (
      <AdminGuard>
        <IntegratedDashboard />
      </AdminGuard>
    );
  }
  return <CompanyMainDashboard company={company} />;
}
