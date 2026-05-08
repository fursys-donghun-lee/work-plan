"use client";

import { useEffect } from "react";
import { useDataStore } from "@/lib/store/useDataStore";

const KEY = "fursys-admin-session";

// isAdmin 을 탭 sessionStorage 에 저장.
// - 페이지 새로고침/내부 이동: 유지 (비밀번호 다시 안 묻음)
// - 탭/브라우저 닫기: 사라짐 (다음 진입 시 재로그인)
export function AdminSession() {
  const isAdmin = useDataStore((s) => s.isAdmin);
  const setIsAdmin = useDataStore((s) => s.setIsAdmin);

  // 마운트 시 hydrate
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === "1") setIsAdmin(true);
    } catch {}
    // 의도적으로 1회만 실행 — setIsAdmin 변동 무시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // isAdmin 변할 때 sessionStorage 갱신
  useEffect(() => {
    try {
      if (isAdmin) sessionStorage.setItem(KEY, "1");
      else sessionStorage.removeItem(KEY);
    } catch {}
  }, [isAdmin]);

  return null;
}
