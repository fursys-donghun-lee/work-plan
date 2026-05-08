"use client";

import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "./useComputed";
import { Construction } from "lucide-react";
import type { Company } from "@/lib/types";

interface Props {
  children: React.ReactNode;
  // 어떤 회사가 구현되었는지 명시 (해당 페이지 기준)
  implementedCompanies?: Company[];
}

const DEFAULT_IMPLEMENTED: Company[] = ["우성산업", "다호산업", "대림산업"];

// 구현되지 않은 회사 선택 시 placeholder 표시.
// 구현된 회사면 children 그대로 렌더링.
export function CompanyGate({
  children,
  implementedCompanies = DEFAULT_IMPLEMENTED,
}: Props) {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);

  if (!hydrated) return null;
  if (company === "전체") return <SelectCompanyPlaceholder />;
  if (implementedCompanies.includes(company)) return <>{children}</>;

  return <UpcomingPlaceholder company={company} />;
}

function SelectCompanyPlaceholder() {
  return (
    <div className="card flex flex-col items-center justify-center py-20 text-center">
      <Construction className="w-14 h-14 text-blue-500 mb-4" />
      <h2 className="text-xl font-bold text-slate-900 mb-2">회사를 선택해주세요</h2>
      <p className="text-sm text-slate-500 max-w-md">
        이 페이지는 특정 회사 단위로 동작합니다. 우측 상단 회사 셀렉터에서
        우성산업 / 다호산업 / 대림산업 중 하나를 선택해주세요.
      </p>
    </div>
  );
}

function UpcomingPlaceholder({ company }: { company: Company }) {
  return (
    <div className="card flex flex-col items-center justify-center py-20 text-center">
      <Construction className="w-14 h-14 text-amber-500 mb-4" />
      <h2 className="text-xl font-bold text-slate-900 mb-2">
        {company} 대시보드 준비 중
      </h2>
      <p className="text-sm text-slate-500 max-w-md whitespace-pre-line">
        {`${company}의 작업그룹·라인 구성과 기준자료 양식이 확정되면 이곳에 추가됩니다.\n현재는 우성산업과 다호산업만 사용 가능합니다.`}
      </p>
    </div>
  );
}

// 회사별로 다른 페이지 가용성 안내용 (예: "이 페이지는 우성산업에서만 사용")
export function CompanyNotApplicable({
  company,
  message,
}: {
  company: Company;
  message: string;
}) {
  return (
    <div className="card flex flex-col items-center justify-center py-16 text-center">
      <Construction className="w-12 h-12 text-slate-400 mb-4" />
      <h2 className="text-lg font-bold text-slate-900 mb-1">
        {company}에서는 사용하지 않는 페이지입니다
      </h2>
      <p className="text-sm text-slate-500 max-w-md whitespace-pre-line">
        {message}
      </p>
    </div>
  );
}
