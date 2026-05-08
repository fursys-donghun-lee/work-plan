"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { checkAdminPassword } from "@/lib/admin";
import { Lock } from "lucide-react";

// 관리자 권한이 필요한 페이지 래퍼.
// !isAdmin 이면 비밀번호 입력 화면 표시.
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const isAdmin = useDataStore((s) => s.isAdmin);
  const setIsAdmin = useDataStore((s) => s.setIsAdmin);
  const setCompanyChosen = useDataStore((s) => s.setCompanyChosen);
  const router = useRouter();

  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");

  if (!hydrated) return null;
  if (isAdmin) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkAdminPassword(pwd)) {
      setIsAdmin(true);
      setError("");
    } else {
      setError("비밀번호가 올바르지 않습니다.");
    }
  };

  const goBack = () => {
    // 선택 화면으로 (companyChosen=false → RootGate 가 LandingSelector 렌더)
    setCompanyChosen(false);
    router.push("/");
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm space-y-3 border border-slate-200"
      >
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-2">
            <Lock className="w-6 h-6 text-slate-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">관리자 권한 필요</h2>
          <p className="text-xs text-slate-500 mt-1">
            이 페이지는 관리자만 접근할 수 있습니다.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          value={pwd}
          onChange={(e) => {
            setPwd(e.target.value);
            if (error) setError("");
          }}
          className="input w-full"
          placeholder="관리자 비밀번호"
        />
        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            {error}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={goBack}
            className="btn btn-secondary flex-1 justify-center"
          >
            돌아가기
          </button>
          <button type="submit" className="btn btn-primary flex-1 justify-center">
            확인
          </button>
        </div>
      </form>
    </div>
  );
}
