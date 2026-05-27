"use client";

import { useEffect } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import type { Company } from "@/lib/types";

// 탭 단위 세션 상태를 sessionStorage 로 관리.
// - 새 탭/창: sessionStorage 비어있음 → 선택화면부터
// - 같은 탭 내 이동(풀 리로드 포함): 선택 상태/회사/관리자 유지
const ADMIN_KEY = "fursys-admin";
const CHOSEN_KEY = "fursys-chosen";
const COMPANY_KEY = "fursys-company";

export function SessionState() {
  const isAdmin = useDataStore((s) => s.isAdmin);
  const companyChosen = useDataStore((s) => s.companyChosen);
  const selectedCompany = useDataStore((s) => s.selectedCompany);
  const setIsAdmin = useDataStore((s) => s.setIsAdmin);
  const setCompanyChosen = useDataStore((s) => s.setCompanyChosen);
  const setSelectedCompany = useDataStore((s) => s.setSelectedCompany);
  const setSessionReady = useDataStore((s) => s.setSessionReady);

  // 마운트 시 sessionStorage 복원
  useEffect(() => {
    try {
      if (sessionStorage.getItem(ADMIN_KEY) === "1") setIsAdmin(true);
      const company = sessionStorage.getItem(COMPANY_KEY);
      if (company) setSelectedCompany(company as Company);
      if (sessionStorage.getItem(CHOSEN_KEY) === "1") setCompanyChosen(true);
    } catch {}
    setSessionReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 상태 변화 → sessionStorage 갱신
  useEffect(() => {
    try {
      if (isAdmin) sessionStorage.setItem(ADMIN_KEY, "1");
      else sessionStorage.removeItem(ADMIN_KEY);
    } catch {}
  }, [isAdmin]);

  useEffect(() => {
    try {
      if (companyChosen) sessionStorage.setItem(CHOSEN_KEY, "1");
      else sessionStorage.removeItem(CHOSEN_KEY);
    } catch {}
  }, [companyChosen]);

  useEffect(() => {
    try {
      sessionStorage.setItem(COMPANY_KEY, selectedCompany);
    } catch {}
  }, [selectedCompany]);

  return null;
}
