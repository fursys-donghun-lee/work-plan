"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Upload, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";

const COMMON_ITEMS = [
  {
    href: "/master-data",
    label: "기준자료",
    description: "근무기준 / 설비기준",
    icon: Database,
  },
  {
    href: "/upload",
    label: "일일자료 업로드",
    description: "근태 / 라인별 공정 부하",
    icon: Upload,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const isAdmin = useDataStore((s) => s.isAdmin);

  // 관리자만 기준자료/일일자료 메뉴를 볼 수 있음 (비관리자는 사이드바 전체 숨김)
  if (!hydrated || !isAdmin) return null;

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex-shrink-0 min-h-[calc(100vh-3.5rem)] sticky top-14">
      <div className="p-4">
        <div className="flex items-center gap-2 px-2 mb-3">
          <FileSpreadsheet className="w-4 h-4 text-slate-400" />
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            공통 자료
          </h2>
        </div>
        <p className="text-xs text-slate-400 px-2 mb-3 leading-relaxed">
          모든 회사가 공통으로 사용하는 자료입니다.
        </p>

        <nav className="space-y-1">
          {COMMON_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-md transition-colors group",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-50"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 flex-shrink-0 mt-0.5",
                    active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                  )}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{item.label}</div>
                  <div
                    className={cn(
                      "text-xs mt-0.5 leading-tight",
                      active ? "text-blue-600/80" : "text-slate-400"
                    )}
                  >
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
