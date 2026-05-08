"use client";

import { AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertLevel = "error" | "warning" | "info";

export interface AlertItem {
  level: AlertLevel;
  message: string;
  detail?: string;
}

export function AlertBanner({ items }: { items: AlertItem[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2 mb-4">
      {items.map((item, i) => (
        <AlertCard key={i} item={item} />
      ))}
    </div>
  );
}

function AlertCard({ item }: { item: AlertItem }) {
  const styles = {
    error: "bg-rose-50 border-rose-200 text-rose-800",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  } as const;

  const Icon = item.level === "error" ? XCircle : item.level === "warning" ? AlertTriangle : Info;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border text-sm",
        styles[item.level]
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-semibold">{item.message}</div>
        {item.detail && <div className="mt-1 text-xs opacity-90">{item.detail}</div>}
      </div>
    </div>
  );
}
