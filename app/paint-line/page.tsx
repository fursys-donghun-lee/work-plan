"use client";

import { CompanyGate, CompanyNotApplicable } from "@/components/CompanyGate";
import { useDataStore } from "@/lib/store/useDataStore";
import { useHydrated } from "@/components/useComputed";
import { DohoPaintLineView } from "@/components/DohoPaintLineView";

export default function PaintLinePage() {
  return (
    <CompanyGate>
      <PaintLineContent />
    </CompanyGate>
  );
}

function PaintLineContent() {
  const hydrated = useHydrated();
  const company = useDataStore((s) => s.selectedCompany);
  if (!hydrated) return null;
  if (company !== "다호산업") {
    return (
      <CompanyNotApplicable
        company={company}
        message={"도장라인 부하는 다호산업 전용 페이지입니다.\n우측 상단에서 회사를 다호산업으로 변경하세요."}
      />
    );
  }
  return <DohoPaintLineView />;
}
