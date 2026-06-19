"use client";

import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { DohoPackage1ClockInView } from "@/components/DohoPackage1ClockInView";

export default function DohoPackage1ClockInPage() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);

  if (!hydrated) return null;
  if (company === "다호산업") return <DohoPackage1ClockInView />;

  return (
    <div className="card text-center py-16">
      <h2 className="text-lg font-bold text-slate-900 mb-2">
        다호산업 전용 페이지
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        포장1라인 현장 대시보드는 다호산업에서만 제공됩니다.
      </p>
      <Link href="/" className="btn btn-primary">
        메인 대시보드로
      </Link>
    </div>
  );
}
