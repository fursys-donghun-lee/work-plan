"use client";

import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { DaerimClockInView } from "@/components/DaerimClockInView";
import { WoosungClockInView } from "@/components/WoosungClockInView";

export default function ClockInPage() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);

  if (!hydrated) return null;
  if (company === "대림산업") return <DaerimClockInView />;
  if (company === "우성산업") return <WoosungClockInView />;

  return (
    <div className="card text-center py-16">
      <h2 className="text-lg font-bold text-slate-900 mb-2">
        현장 대시보드
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        다호산업은 좌측 메뉴에서 포장1 현장 또는 도장 현장을 선택하세요.
      </p>
      <Link href="/" className="btn btn-primary">
        메인 대시보드로
      </Link>
    </div>
  );
}
