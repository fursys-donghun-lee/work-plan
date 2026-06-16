"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/lib/store/useDataStore";
import { type Company } from "@/lib/types";
import { Home } from "lucide-react";
import { useHydrated } from "./useComputed";

const NAV_ITEMS_BY_COMPANY: Record<Company, { href: string; label: string }[]> = {
  전체: [
    { href: "/", label: "안성공장 통합 대시보드" },
    { href: "/daily-plans", label: "일자별 근무계획" },
  ],
  우성산업: [
    { href: "/", label: "메인 대시보드" },
    { href: "/workgroups", label: "그룹별 부하" },
    { href: "/equipment", label: "설비별 부하" },
  ],
  다호산업: [
    { href: "/", label: "메인 대시보드" },
    { href: "/paint-line", label: "도장라인 부하" },
    { href: "/package-line", label: "포장1라인 부하" },
    { href: "/plan", label: "재배치 계획" },
  ],
  대림산업: [
    { href: "/", label: "메인 대시보드" },
    { href: "/floor", label: "포장2라인 부하" },
    { href: "/plan", label: "재배치 계획" },
    { href: "/package2-line", label: "포장2라인 상세" },
  ],
};

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const selectedCompany = useDataStore((s) => s.selectedCompany);
  const setCompanyChosen = useDataStore((s) => s.setCompanyChosen);

  const company = hydrated ? selectedCompany : "전체";
  const navItems = NAV_ITEMS_BY_COMPANY[company];

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-6 flex items-center h-14 gap-4">
        <Link href="/" className="font-bold text-slate-900 text-base whitespace-nowrap">
          안성공장 일일 근무계획
        </Link>

        <div className="flex gap-1 ml-4">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => {
              setCompanyChosen(false);
              if (pathname !== "/") router.push("/");
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100"
            title="회사 선택 화면으로 돌아가기"
          >
            <Home className="w-4 h-4" />
            선택 화면
          </button>
        </div>
      </div>
    </nav>
  );
}
