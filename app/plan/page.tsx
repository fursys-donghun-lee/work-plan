"use client";

import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { DaerimPlanView } from "@/components/DaerimPlanView";

export default function PlanPage() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);

  if (!hydrated) return null;
  if (company === "대림산업") return <DaerimPlanView />;

  return (
    <div className="card text-center py-16">
      <h2 className="text-lg font-bold text-slate-900 mb-2">
        재배치 계획 준비 중
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        지금은 대림산업만 재배치 계획이 제공됩니다.
      </p>
      <Link href="/" className="btn btn-primary">
        메인 대시보드로
      </Link>
    </div>
  );
}
