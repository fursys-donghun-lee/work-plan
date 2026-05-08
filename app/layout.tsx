import type { Metadata } from "next";
import "./globals.css";
import { SyncProvider } from "@/components/SyncProvider";
import { RootGate } from "@/components/RootGate";

export const metadata: Metadata = {
  title: "안성공장 일일 근무계획",
  description: "안성공장 일일 근무계획 대시보드",
  // 인증 없이 공개 운영 — 검색엔진 노출만 차단
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <SyncProvider>
          <RootGate>{children}</RootGate>
        </SyncProvider>
      </body>
    </html>
  );
}
