"use client";

import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";

// 일일자료 5종 중 오늘 업로드되지 않은 것을 위쪽 빨간 라인으로 알림.
// 클릭 시 일일자료 업로드 페이지로 이동.
// - 오늘 = 사용자 PC 의 로컬 날짜 (YYYY-MM-DD)
// - 각 자료의 meta.uploadedAt 의 로컬 날짜와 비교
// - 미업로드 또는 어제 이전이면 누락으로 간주

interface UploadCheck {
  label: string;
  uploadedAt?: string;
}

function isToday(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function DailyUploadAlert() {
  const hydrated = useHydrated();
  const isAdmin = useDataStore((s) => s.isAdmin);
  const attendanceMeta = useDataStore((s) => s.attendanceMeta);
  const loadPlanMeta = useDataStore((s) => s.loadPlanMeta);
  const paintPlanMeta = useDataStore((s) => s.paintPlanMeta);
  const packageLoadMeta = useDataStore((s) => s.packageLoadMeta);
  const urgentProductionMeta = useDataStore((s) => s.urgentProductionMeta);

  if (!hydrated) return null;
  // 관리자에게만 노출 (현장 관리자는 업로드 권한 없음)
  if (!isAdmin) return null;

  const checks: UploadCheck[] = [
    { label: "근태", uploadedAt: attendanceMeta?.uploadedAt },
    { label: "라인별 공정 부하", uploadedAt: loadPlanMeta?.uploadedAt },
    { label: "도장계획", uploadedAt: paintPlanMeta?.uploadedAt },
    { label: "라인별 포장 부하", uploadedAt: packageLoadMeta?.uploadedAt },
    { label: "긴급생산리스트", uploadedAt: urgentProductionMeta?.uploadedAt },
  ];

  const missing = checks.filter((c) => !isToday(c.uploadedAt));
  if (missing.length === 0) return null;

  return (
    <Link
      href="/upload"
      className="block bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-lg px-4 py-3 border border-amber-300 transition-colors"
    >
      <span className="text-base">
        ⛔ {missing.map((m) => m.label).join(" ")} 업로드 필요
      </span>
    </Link>
  );
}
