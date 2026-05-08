"use client";

import Link from "next/link";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { AlertTriangle } from "lucide-react";

// 일일자료 5종 중 오늘 업로드되지 않은 것을 위쪽 배너로 알림.
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
  const attendanceMeta = useDataStore((s) => s.attendanceMeta);
  const loadPlanMeta = useDataStore((s) => s.loadPlanMeta);
  const paintPlanMeta = useDataStore((s) => s.paintPlanMeta);
  const packageLoadMeta = useDataStore((s) => s.packageLoadMeta);
  const urgentProductionMeta = useDataStore((s) => s.urgentProductionMeta);

  if (!hydrated) return null;

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
    <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-3 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">
          오늘 업로드되지 않은 일일자료 {missing.length}건
        </div>
        <div className="text-xs mt-1">
          {missing.map((m) => m.label).join(", ")}
        </div>
      </div>
      <Link
        href="/upload"
        className="text-xs font-medium text-amber-900 hover:text-amber-700 underline whitespace-nowrap"
      >
        업로드 →
      </Link>
    </div>
  );
}
