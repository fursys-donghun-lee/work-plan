"use client";

import { FileUploadCard } from "@/components/FileUploadCard";
import { useDataStore } from "@/lib/store/useDataStore";
import { parseAttendance } from "@/lib/excel/attendance";
import { parseLoadPlan } from "@/lib/excel/loadPlan";
import { parsePaintPlan } from "@/lib/excel/paintPlan";
import { parsePackageLoad } from "@/lib/excel/packageLoad";
import { parseUrgentProduction } from "@/lib/excel/urgentProduction";
import { useHydrated } from "@/components/useComputed";
import { AdminGuard } from "@/components/AdminGuard";
import Link from "next/link";

export default function UploadPage() {
  const hydrated = useHydrated();
  const setAttendance = useDataStore((s) => s.setAttendance);
  const setLoadPlan = useDataStore((s) => s.setLoadPlan);
  const setPaintPlan = useDataStore((s) => s.setPaintPlan);
  const setPackageLoad = useDataStore((s) => s.setPackageLoad);
  const setUrgentProduction = useDataStore((s) => s.setUrgentProduction);
  const attendance = useDataStore((s) => s.attendance);
  const loadPlan = useDataStore((s) => s.loadPlan);
  const paintPlan = useDataStore((s) => s.paintPlan);
  const packageLoad = useDataStore((s) => s.packageLoad);
  const urgentProduction = useDataStore((s) => s.urgentProduction);
  const attendanceMeta = useDataStore((s) => s.attendanceMeta);
  const loadPlanMeta = useDataStore((s) => s.loadPlanMeta);
  const paintPlanMeta = useDataStore((s) => s.paintPlanMeta);
  const packageLoadMeta = useDataStore((s) => s.packageLoadMeta);
  const urgentProductionMeta = useDataStore((s) => s.urgentProductionMeta);
  const workDate = useDataStore((s) => s.workDate);
  const uploadLog = useDataStore((s) => s.uploadLog);
  const addUploadLog = useDataStore((s) => s.addUploadLog);

  if (!hydrated) return null;

  const logUpload = (
    category: import("@/lib/types").UploadLogEntry["category"],
    file: File,
    rowCount: number
  ) => {
    addUploadLog({
      category,
      scope: "일일자료",
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      rowCount,
    });
  };

  const handleAttendance = async (file: File) => {
    const { records, workDate: wd } = await parseAttendance(file);
    if (records.length === 0) {
      throw new Error("근태 데이터가 비어있거나 형식이 올바르지 않습니다.");
    }
    setAttendance(records, wd, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("근태", file, records.length);
  };

  const handleLoadPlan = async (file: File) => {
    const rows = await parseLoadPlan(file);
    if (rows.length === 0) {
      throw new Error("라인별 공정 부하 데이터가 비어있거나 형식이 올바르지 않습니다.");
    }
    setLoadPlan(rows, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("라인별 공정 부하", file, rows.length);
  };

  const handlePaintPlan = async (file: File) => {
    const rows = await parsePaintPlan(file);
    if (rows.length === 0) {
      throw new Error("도장계획 데이터가 비어있거나 형식이 올바르지 않습니다.");
    }
    setPaintPlan(rows, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("도장계획", file, rows.length);
  };

  const handlePackageLoad = async (file: File) => {
    const rows = await parsePackageLoad(file);
    if (rows.length === 0) {
      throw new Error("라인별 포장 부하 데이터가 비어있거나 형식이 올바르지 않습니다.");
    }
    setPackageLoad(rows, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("라인별 포장 부하", file, rows.length);
  };

  const handleUrgentProduction = async (file: File) => {
    const rows = await parseUrgentProduction(file);
    if (rows.length === 0) {
      throw new Error(
        "긴급생산리스트 데이터가 비어있거나 형식이 올바르지 않습니다."
      );
    }
    setUrgentProduction(rows, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("긴급생산리스트", file, rows.length);
  };

  return (
    <AdminGuard>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">일일자료 업로드</h1>
        <p className="text-sm text-slate-500 mt-1">
          매일 근태와 라인별 공정 부하을 업로드합니다.
          업로드 즉시 메인/그룹별/설비별 페이지에 반영됩니다.
        </p>
      </div>

      {workDate && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 text-sm">
          <span className="font-semibold">현재 근무일자:</span> {workDate}
        </div>
      )}

      {/* 위열: 근태 / 도장계획 — 인원·부품 기준 */}
      {/* 아래열: 라인별 공정 부하 / 라인별 포장 부하 — 라인 단위 부하 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FileUploadCard
          title="근태"
          description="당일 출근시간 기준 자료. 사원번호·사원명·출근시간 컬럼 필수. (전 회사 공통)"
          uploaded={attendance.length > 0}
          fileName={attendanceMeta?.fileName}
          uploadedAt={attendanceMeta?.uploadedAt}
          rowCount={attendance.length}
          onFileSelected={handleAttendance}
        />
        <FileUploadCard
          title="도장계획"
          description="다호산업 도장·포장 일일계획. 작업설비(AJ열)와 포장라인(AZ열) 기준으로 부하를 집계합니다."
          uploaded={paintPlan.length > 0}
          fileName={paintPlanMeta?.fileName}
          uploadedAt={paintPlanMeta?.uploadedAt}
          rowCount={paintPlan.length}
          onFileSelected={handlePaintPlan}
          accept=".xls,.xlsx"
        />
        <FileUploadCard
          title="라인별 공정 부하"
          description="우성산업 가공라인 당일 계획량 (G열). 첫 번째 날짜 컬럼이 항상 당일로 처리됩니다."
          uploaded={loadPlan.length > 0}
          fileName={loadPlanMeta?.fileName}
          uploadedAt={loadPlanMeta?.uploadedAt}
          rowCount={loadPlan.length}
          onFileSelected={handleLoadPlan}
        />
        <FileUploadCard
          title="라인별 포장 부하"
          description="다호산업 포장1·2 라인 단위 당일 계획량(G열) / 계획시간(H열)."
          uploaded={packageLoad.length > 0}
          fileName={packageLoadMeta?.fileName}
          uploadedAt={packageLoadMeta?.uploadedAt}
          rowCount={packageLoad.length}
          onFileSelected={handlePackageLoad}
          accept=".xls,.xlsx"
        />
        <FileUploadCard
          title="긴급생산리스트"
          description="C열 출고일(공백은 위 행으로 자동 채움) · G열 포장라인 기준 D-1/D-2 긴급건 집계."
          uploaded={urgentProduction.length > 0}
          fileName={urgentProductionMeta?.fileName}
          uploadedAt={urgentProductionMeta?.uploadedAt}
          rowCount={urgentProduction.length}
          onFileSelected={handleUrgentProduction}
          accept=".xls,.xlsx"
        />
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-2">다음 단계</h3>
        <p className="text-sm text-slate-600 mb-3">
          기준자료(근무기준·설비기준)를 아직 업로드하지 않았다면 먼저 업로드해주세요.
        </p>
        <div className="flex gap-2">
          <Link href="/master-data" className="btn btn-secondary">
            기준자료 페이지로
          </Link>
          <Link href="/" className="btn btn-primary">
            메인 대시보드 보기
          </Link>
        </div>
      </div>

      {/* 업로드 로그 */}
      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-2">
          업로드 로그 (최근 50건)
        </h3>
        {uploadLog.length === 0 ? (
          <p className="text-sm text-slate-500">아직 업로드 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>구분</th>
                  <th>자료</th>
                  <th>파일명</th>
                  <th className="text-right">행 수</th>
                </tr>
              </thead>
              <tbody>
                {uploadLog.map((e, i) => (
                  <tr key={`${e.uploadedAt}-${i}`}>
                    <td className="text-xs whitespace-nowrap">
                      {formatLocal(e.uploadedAt)}
                    </td>
                    <td>
                      <span
                        className={
                          e.scope === "기준자료"
                            ? "badge bg-purple-100 text-purple-700"
                            : "badge badge-blue"
                        }
                      >
                        {e.scope}
                      </span>
                    </td>
                    <td className="font-medium">{e.category}</td>
                    <td className="text-xs text-slate-600 max-w-xs truncate">
                      {e.fileName}
                    </td>
                    <td className="text-right">{e.rowCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </AdminGuard>
  );
}

function formatLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}
