"use client";

// 브라우저 back 버튼/Backspace 가 사이트를 빠져나가지 않게 가드.
// - 회사 선택 시 URL 에 #a 해시 추가 → history 엔트리 생성
// - back 누르면 해시가 사라지면서 popstate → 선택 화면으로 복귀
// - hash 만 변경하므로 Next.js Link 라우팅과 충돌 없음

import { useEffect } from "react";
import { useDataStore } from "@/lib/store/useDataStore";

export const DASH_HASH = "#a";

export function HistoryGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 페이지 최초 진입 시 — URL 의 stale #a 해시를 무조건 제거.
    // (companyChosen 은 매 진입마다 false 로 시작하므로 선택화면부터 보여줌)
    if (window.location.hash === DASH_HASH) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }

    // 브라우저 back/forward 시 hash 상태에 따라 chosen 동기화
    const handler = () => {
      const hasHash = window.location.hash === DASH_HASH;
      const store = useDataStore.getState();
      if (hasHash && !store.companyChosen) {
        store.setCompanyChosen(true);
      } else if (!hasHash && store.companyChosen) {
        store.setCompanyChosen(false);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return null;
}
