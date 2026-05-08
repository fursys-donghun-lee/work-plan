"use client";

import { CompanyGate, CompanyNotApplicable } from "@/components/CompanyGate";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { Package2LineView } from "@/components/Package2LineView";

export default function Package2LinePage() {
  return (
    <CompanyGate>
      <Package2LineContent />
    </CompanyGate>
  );
}

function Package2LineContent() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);
  if (!hydrated) return null;
  if (company !== "대림산업") {
    return (
      <CompanyNotApplicable
        company={company}
        message={"포장2라인 부하는 대림산업 전용 페이지입니다.\n우측 상단에서 회사를 대림산업으로 변경하세요."}
      />
    );
  }
  return <Package2LineView />;
}
