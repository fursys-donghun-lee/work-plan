"use client";

import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { IntegratedDashboard } from "@/components/IntegratedDashboard";
import { CompanyMainDashboard } from "@/components/CompanyMainDashboard";

export default function MainDashboardPage() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);
  if (!hydrated) return null;
  if (company === "전체") return <IntegratedDashboard />;
  return <CompanyMainDashboard company={company} />;
}
