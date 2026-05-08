"use client";

import { useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { useRouter } from "next/navigation";
import type { Company } from "@/lib/types";
import { Lock, Package, Settings } from "lucide-react";
import { PowderCoatingIcon, WeldingHelmetIcon } from "@/components/CompanyIcons";
import { checkAdminPassword } from "@/lib/admin";

type Choice = {
  label: string;
  company: Company;
  icon: React.ReactNode;
  // Tailwind 색상 토큰
  bg: string;
  hover: string;
  ring: string;
  iconBg: string;
  requiresPassword?: boolean;
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
    requiresPassword: true,
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
  const setIsAdmin = useDataStore((s) => s.setIsAdmin);
  const router = useRouter();

  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [pwdInput, setPwdInput] = useState("");
  const [pwdError, setPwdError] = useState("");

  const enter = (company: Company) => {
    setSelectedCompany(company);
    setCompanyChosen(true);
    router.push("/");
  };

  const handleClick = (c: Choice) => {
    if (c.requiresPassword) {
      setAdminModalOpen(true);
      setPwdInput("");
      setPwdError("");
    } else {
      enter(c.company);
    }
  };

  const submitAdminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkAdminPassword(pwdInput)) {
      setIsAdmin(true);
      enter("전체");
    } else {
      setPwdError("비밀번호가 올바르지 않습니다.");
    }
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
              onClick={() => handleClick(c)}
              className={`group relative ${c.bg} ${c.hover} text-white rounded-2xl shadow-lg ring-4 ${c.ring} transition-all duration-200 hover:scale-[1.02] hover:shadow-xl active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-white`}
            >
              <div className="flex flex-col items-center justify-center gap-5 px-6 py-14 md:py-16">
                <div className={`${c.iconBg} rounded-full p-4 shadow-inner`}>
                  {c.icon}
                </div>
                <div className="text-3xl md:text-4xl font-bold tracking-tight">
                  {c.label}
                </div>
                {c.requiresPassword && (
                  <div className="absolute top-3 right-3 opacity-70">
                    <Lock className="w-4 h-4" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 관리자 비밀번호 모달 */}
      {adminModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={() => setAdminModalOpen(false)}
        >
          <form
            onSubmit={submitAdminPassword}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-3"
          >
            <div className="text-center mb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-2">
                <Lock className="w-6 h-6 text-slate-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">관리자 비밀번호</h2>
              <p className="text-xs text-slate-500 mt-1">
                기준자료/일일자료 업로드 및 통합 대시보드 접근용
              </p>
            </div>
            <input
              type="password"
              autoFocus
              value={pwdInput}
              onChange={(e) => {
                setPwdInput(e.target.value);
                if (pwdError) setPwdError("");
              }}
              className="input w-full"
              placeholder="비밀번호"
            />
            {pwdError && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                {pwdError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAdminModalOpen(false)}
                className="btn btn-secondary flex-1 justify-center"
              >
                취소
              </button>
              <button
                type="submit"
                className="btn btn-primary flex-1 justify-center"
              >
                들어가기
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
