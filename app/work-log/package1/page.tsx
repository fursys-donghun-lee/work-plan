"use client";

import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { WorkLogView } from "@/components/WorkLogView";

export default function DohoPackage1WorkLogPage() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);

  if (!hydrated) return null;
  if (company === "다호산업") {
    return (
      <WorkLogView
        title="다호산업 · 포장1라인 인원별 근무관리"
        employeeFilter={(e) =>
          e.department.includes("다호산업") &&
          (e.category === "포장1라인" || e.category === "물류")
        }
      />
    );
  }

  return (
    <div className="card text-center py-16">
      <h2 className="text-lg font-bold text-slate-900 mb-2">
        다호산업 전용 페이지
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        포장1라인 근무관리는 다호산업에서만 제공됩니다.
      </p>
      <Link href="/" className="btn btn-primary">
        메인 대시보드로
      </Link>
    </div>
  );
}
