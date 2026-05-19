"use client";

// URL 해시 가드 — 초기 진입 시 stale 한 #a 해시만 제거.
// popstate 기반 자동 동기화는 Next.js Link 라우팅과 충돌하므로 사용하지 않음.
// 선택화면으로 돌아가는 방법은 NavBar 의 "선택 화면" 버튼만.

import { useEffect } from "react";

export const DASH_HASH = "#a";

export function HistoryGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 페이지 진입 시 URL 의 stale #a 해시 제거 → 선택화면부터 표시
    if (window.location.hash === DASH_HASH) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }, []);
  return null;
}
