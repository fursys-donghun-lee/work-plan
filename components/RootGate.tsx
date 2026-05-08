"use client";

import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { LandingSelector } from "@/components/LandingSelector";
import { NavBar } from "@/components/NavBar";
import { Sidebar } from "@/components/Sidebar";
import { DailyUploadAlert } from "@/components/DailyUploadAlert";

// 첫 진입 시 회사 선택 화면을 보여주는 게이트.
// 이미 선택했으면 NavBar+Sidebar+content 정상 렌더링.
export function RootGate({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const chosen = useDataStore((s) => s.companyChosen);

  if (!hydrated) return null;

  if (!chosen) return <LandingSelector />;

  return (
    <>
      <NavBar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 max-w-[1500px] px-6 py-6 space-y-3">
          <DailyUploadAlert />
          {children}
        </main>
      </div>
    </>
  );
}
