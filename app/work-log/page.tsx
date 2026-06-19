"use client";

import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { WorkLogView } from "@/components/WorkLogView";

export default function WorkLogPage() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);

  if (!hydrated) return null;
  if (company === "대림산업") return <WorkLogView />;

  return (
    <div className="card text-center py-16">
      <h2 className="text-lg font-bold text-slate-900 mb-2">
        인원별 근무관리 준비 중
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        지금은 대림산업만 인원별 근무관리가 제공됩니다.
      </p>
      <Link href="/" className="btn btn-primary">
        메인 대시보드로
      </Link>
    </div>
  );
}
