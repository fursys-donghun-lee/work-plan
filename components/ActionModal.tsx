"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SUPPORT_TARGET_LINES, type SupportTargetLineName } from "@/lib/types";

interface Props {
  open: boolean;
  workerName: string;
  workerEmpCode: string;
  currentLine: string;
  isPresent: boolean;
  isSupporting: boolean;
  onClose: () => void;
  onClockIn: () => void;
  onMarkAbsent: () => void;
  onClockOut: () => void;
  onSupport: (targetLine: SupportTargetLineName) => void;
  onReturn: () => void;
}

// 직원 이름 클릭 시 표시되는 액션 선택 모달 — 출근/퇴근/지원
// 지원 클릭 시 → 지원 라인 선택 단계로 전환
export function ActionModal({
  open,
  workerName,
  workerEmpCode,
  currentLine,
  isPresent,
  isSupporting,
  onClose,
  onClockIn,
  onMarkAbsent,
  onClockOut,
  onSupport,
  onReturn,
}: Props) {
  const [stage, setStage] = useState<"main" | "supportSelect">("main");

  // 모달 열릴 때 main 단계로 리셋
  useEffect(() => {
    if (open) setStage("main");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 shadow-xl min-w-[340px] max-w-[440px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <div className="text-xl font-bold text-slate-900">{workerName}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            사원코드 {workerEmpCode}
            {currentLine && (
              <>
                {" · "}현재 위치{" "}
                <span className="font-semibold text-slate-700">
                  {currentLine === "자동포장라인" ? "자동포장" : currentLine}
                </span>
              </>
            )}
            {" · "}
            {isPresent ? (
              <span className="text-emerald-700 font-semibold">출근 중</span>
            ) : (
              <span className="text-rose-700 font-semibold">미출근</span>
            )}
          </div>
        </div>

        {stage === "main" ? (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {isSupporting ? (
                <ActionButton
                  label="복귀"
                  tone="emerald"
                  onClick={onReturn}
                />
              ) : (
                <ActionButton
                  label="출근"
                  tone="emerald"
                  disabled={isPresent}
                  onClick={onClockIn}
                />
              )}
              <ActionButton
                label="미출근"
                tone="rose"
                disabled={!isPresent}
                onClick={onMarkAbsent}
              />
              <ActionButton
                label="퇴근"
                tone="amber"
                disabled={!isPresent}
                onClick={onClockOut}
              />
              <ActionButton
                label={isSupporting ? "지원 변경" : "지원"}
                tone="blue"
                disabled={!isPresent}
                onClick={() => setStage("supportSelect")}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-sm text-slate-500 hover:text-slate-700 py-1.5"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-slate-700 mb-2">
              어느 라인을 지원할까요?
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {SUPPORT_TARGET_LINES.map((line) => (
                <ActionButton
                  key={line}
                  label={line}
                  tone="blue"
                  onClick={() => onSupport(line)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStage("main")}
              className="w-full text-sm text-slate-500 hover:text-slate-700 py-1.5"
            >
              ← 뒤로
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "emerald" | "rose" | "amber" | "blue";
  disabled?: boolean;
  onClick: () => void;
}) {
  const toneClass: Record<typeof tone, string> = {
    emerald:
      "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700",
    rose: "bg-rose-600 hover:bg-rose-700 text-white border-rose-700",
    amber: "bg-amber-600 hover:bg-amber-700 text-white border-amber-700",
    blue: "bg-blue-600 hover:bg-blue-700 text-white border-blue-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "py-3 rounded-lg font-bold text-base border-2 transition-colors",
        disabled
          ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
          : toneClass[tone]
      )}
    >
      {label}
    </button>
  );
}
