import type { Metadata } from "next";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";
import { SyncProvider } from "@/components/SyncProvider";
import { RootGate } from "@/components/RootGate";

export const metadata: Metadata = {
  title: "안성공장 일일 근무계획",
  description: "안성공장 일일 근무계획 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <AuthGate>
          <SyncProvider>
            <RootGate>{children}</RootGate>
          </SyncProvider>
        </AuthGate>
      </body>
    </html>
  );
}
