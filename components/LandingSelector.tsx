"use client";

import { useDataStore } from "@/lib/store/useDataStore";
import { useRouter } from "next/navigation";
import type { Company } from "@/lib/types";
import { Package, Settings } from "lucide-react";
import { PowderCoatingIcon, WeldingHelmetIcon } from "@/components/CompanyIcons";

type Choice = {
  label: string;
  company: Company;
  icon: React.ReactNode;
  // Tailwind 색상 토큰
  bg: string;
  hover: string;
  ring: string;
  iconBg: string;
};

const CHOICES: Choice[] = [
  {
    label: "관리자",
    company: "전체",
    icon: <Settings className="w-10 h-10" />,
    bg: "bg-slate-800",
    hover: "hover:bg-slate-900",
    ring: "ring-slate-300",
    iconBg: "bg-slate-700",
  },
  {
    label: "우성",
    company: "우성산업",
    icon: <WeldingHelmetIcon className="w-10 h-10" />,
    bg: "bg-blue-600",
    hover: "hover:bg-blue-700",
    ring: "ring-blue-200",
    iconBg: "bg-blue-500",
  },
  {
    label: "다호",
    company: "다호산업",
    icon: <PowderCoatingIcon className="w-10 h-10" />,
    bg: "bg-emerald-600",
    hover: "hover:bg-emerald-700",
    ring: "ring-emerald-200",
    iconBg: "bg-emerald-500",
  },
  {
    label: "대림",
    company: "대림산업",
    icon: <Package className="w-10 h-10" />,
    bg: "bg-indigo-600",
    hover: "hover:bg-indigo-700",
    ring: "ring-indigo-200",
    iconBg: "bg-indigo-500",
  },
];

export function LandingSelector() {
  const setSelectedCompany = useDataStore((s) => s.setSelectedCompany);
  const setCompanyChosen = useDataStore((s) => s.setCompanyChosen);
  const router = useRouter();

  const choose = (company: Company) => {
    setSelectedCompany(company);
    setCompanyChosen(true);
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
            안성공장 일일 근무계획
          </h1>
          <p className="mt-4 text-base md:text-lg text-slate-500">
            접속할 화면을 선택하세요
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {CHOICES.map((c) => (
            <button
              key={c.company}
              type="button"
              onClick={() => choose(c.company)}
              className={`group relative ${c.bg} ${c.hover} text-white rounded-2xl shadow-lg ring-4 ${c.ring} transition-all duration-200 hover:scale-[1.02] hover:shadow-xl active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-white`}
            >
              <div className="flex flex-col items-center justify-center gap-5 px-6 py-14 md:py-16">
                <div className={`${c.iconBg} rounded-full p-4 shadow-inner`}>
                  {c.icon}
                </div>
                <div className="text-3xl md:text-4xl font-bold tracking-tight">
                  {c.label}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
