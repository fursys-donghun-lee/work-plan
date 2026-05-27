"use client";

import { Upload, CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import { useRef, useState } from "react";
import { cn, formatDateTime } from "@/lib/utils";

interface Props {
  title: string;
  description: string;
  uploaded: boolean;
  fileName?: string;
  uploadedAt?: string;
  rowCount?: number;
  onFileSelected: (file: File) => Promise<void> | void;
  onDownload?: () => void;
  accept?: string;
  className?: string;
}

export function FileUploadCard({
  title,
  description,
  uploaded,
  fileName,
  uploadedAt,
  rowCount,
  onFileSelected,
  onDownload,
  accept = ".xlsx,.xls",
  className,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleClick = () => ref.current?.click();

  const processFile = async (f: File) => {
    // 확장자 검사 (accept 목록과 비교)
    const exts = accept
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const lower = f.name.toLowerCase();
    if (exts.length > 0 && !exts.some((ext) => lower.endsWith(ext))) {
      setError(`지원하지 않는 파일 형식입니다. (${exts.join(", ")} 만 가능)`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onFileSelected(f);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "파일 처리 중 오류가 발생했습니다."
      );
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await processFile(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dragOver) setDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) await processFile(f);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "card flex flex-col gap-3 transition-colors",
        dragOver && "border-blue-400 ring-2 ring-blue-200 bg-blue-50/40",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            uploaded ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
          )}
        >
          {uploaded ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <FileSpreadsheet className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>

      {uploaded && (
        <div className="text-xs text-slate-600 bg-slate-50 rounded-md p-2 space-y-0.5">
          <div className="flex justify-between">
            <span className="text-slate-500">파일명</span>
            <span className="font-medium truncate ml-2">{fileName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">업로드</span>
            <span className="font-medium">{formatDateTime(uploadedAt ?? "")}</span>
          </div>
          {rowCount !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-500">데이터</span>
              <span className="font-medium">{rowCount.toLocaleString("ko-KR")}건</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md p-2">
          {error}
        </div>
      )}

      {/* 드롭존 안내 */}
      <div
        onClick={handleClick}
        className={cn(
          "border-2 border-dashed rounded-lg py-4 px-3 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-blue-400 bg-blue-50 text-blue-700"
            : "border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50"
        )}
      >
        <Upload className="w-5 h-5 mx-auto mb-1" />
        <p className="text-xs font-medium">
          {busy
            ? "처리 중..."
            : dragOver
              ? "여기에 놓으세요"
              : "파일을 끌어다 놓거나 클릭해서 선택"}
        </p>
      </div>

      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex gap-2">
        <button
          onClick={handleClick}
          disabled={busy}
          className={cn(
            "btn flex-1 justify-center",
            uploaded ? "btn-secondary" : "btn-primary",
            busy && "opacity-60 cursor-wait"
          )}
        >
          <Upload className="w-4 h-4" />
          {busy ? "처리 중..." : uploaded ? "다시 업로드" : "엑셀 파일 업로드"}
        </button>
        {onDownload && uploaded && (
          <button
            onClick={onDownload}
            className="btn btn-secondary"
            title="현재 데이터를 엑셀로 다운로드"
          >
            <Download className="w-4 h-4" />
            다운로드
          </button>
        )}
      </div>
    </div>
  );
}
