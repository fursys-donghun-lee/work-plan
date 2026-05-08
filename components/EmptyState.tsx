"use client";

import Link from "next/link";
import { FileWarning } from "lucide-react";

export function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="card flex flex-col items-center justify-center py-16 text-center">
      <FileWarning className="w-12 h-12 text-slate-400 mb-4" />
      <h2 className="text-lg font-semibold text-slate-800 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-6 whitespace-pre-line">{description}</p>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="btn btn-primary">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
