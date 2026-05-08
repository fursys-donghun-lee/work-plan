"use client";

import { useState } from "react";
import Link from "next/link";
import { FileUploadCard } from "@/components/FileUploadCard";
import { useDataStore } from "@/lib/store/useDataStore";
import { parseWorkStandard } from "@/lib/excel/workStandard";
import { parseEquipment } from "@/lib/excel/equipment";
import { parseLoadBar } from "@/lib/excel/loadBar";
import { parsePackagePosition } from "@/lib/excel/packagePosition";
import { parseLineBase } from "@/lib/excel/lineBase";
import {
  exportEquipment,
  exportLineBase,
  exportLoadBar,
  exportPackagePosition,
  exportWorkGroups,
  exportWorkStandard,
} from "@/lib/excel/export";
import { useHydrated } from "@/components/useComputed";
import { AdminGuard } from "@/components/AdminGuard";
import { LoadBarTable } from "@/components/LoadBarTable";
import { PackagePositionTable } from "@/components/PackagePositionTable";
import { LineBaseTable } from "@/components/LineBaseTable";
import { Download, Pencil, Save, X } from "lucide-react";
import type { Employee, Equipment, WorkGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab =
  | "근무기준"
  | "설비기준"
  | "작업그룹"
  | "로드바 정보"
  | "포장라인 위치"
  | "라인 기준인원";

export default function MasterDataPage() {
  const hydrated = useHydrated();
  const employees = useDataStore((s) => s.employees);
  const equipment = useDataStore((s) => s.equipment);
  const workGroups = useDataStore((s) => s.workGroups);
  const loadBar = useDataStore((s) => s.loadBar);
  const packagePosition = useDataStore((s) => s.packagePosition);
  const lineBase = useDataStore((s) => s.lineBase);
  const workStandardMeta = useDataStore((s) => s.workStandardMeta);
  const equipmentMeta = useDataStore((s) => s.equipmentMeta);
  const loadBarMeta = useDataStore((s) => s.loadBarMeta);
  const packagePositionMeta = useDataStore((s) => s.packagePositionMeta);
  const lineBaseMeta = useDataStore((s) => s.lineBaseMeta);
  const setEmployees = useDataStore((s) => s.setEmployees);
  const setEquipment = useDataStore((s) => s.setEquipment);
  const setLoadBar = useDataStore((s) => s.setLoadBar);
  const setPackagePosition = useDataStore((s) => s.setPackagePosition);
  const setLineBase = useDataStore((s) => s.setLineBase);
  const addUploadLog = useDataStore((s) => s.addUploadLog);

  const [tab, setTab] = useState<Tab>("근무기준");

  if (!hydrated) return null;

  const logUpload = (
    category: import("@/lib/types").UploadLogEntry["category"],
    file: File,
    rowCount: number
  ) =>
    addUploadLog({
      category,
      scope: "기준자료",
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      rowCount,
    });

  const handleWorkStandard = async (file: File) => {
    const data = await parseWorkStandard(file);
    if (data.length === 0) throw new Error("근무기준 데이터가 비어있습니다.");
    setEmployees(data, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("근무기준", file, data.length);
  };

  const handleEquipment = async (file: File) => {
    const data = await parseEquipment(file);
    if (data.length === 0) throw new Error("설비기준 데이터가 비어있습니다.");
    setEquipment(data, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("설비기준", file, data.length);
  };

  const handleLoadBar = async (file: File) => {
    const data = await parseLoadBar(file);
    if (data.length === 0) throw new Error("로드바 정보 데이터가 비어있습니다.");
    setLoadBar(data, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("로드바 정보", file, data.length);
  };

  const handlePackagePosition = async (file: File) => {
    const data = await parsePackagePosition(file);
    if (data.length === 0) throw new Error("포장라인 기본근무위치 데이터가 비어있습니다.");
    setPackagePosition(data, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("포장라인 기본근무위치", file, data.length);
  };

  const handleLineBase = async (file: File) => {
    const data = await parseLineBase(file);
    if (data.length === 0) throw new Error("라인 기준인원 데이터가 비어있습니다.");
    setLineBase(data, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    logUpload("라인 기준인원", file, data.length);
  };

  return (
    <AdminGuard>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">기준자료</h1>
        <p className="text-sm text-slate-500 mt-1">
          근무기준·설비기준·로드바 정보는 변경 시에만 업로드합니다. 모든 자료는 수동으로 편집할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <FileUploadCard
          title="근무기준"
          description="전체 사원 마스터. 사원코드·사원명·부서명·구분 컬럼 필수."
          uploaded={employees.length > 0}
          fileName={workStandardMeta?.fileName}
          uploadedAt={workStandardMeta?.uploadedAt}
          rowCount={employees.length}
          onFileSelected={handleWorkStandard}
          onDownload={() => exportWorkStandard(employees)}
        />
        <FileUploadCard
          title="설비기준"
          description="설비별 8시간 CAPA 기준. 라인·작업자·설비명·소속·8시간 CAPA 필수."
          uploaded={equipment.length > 0}
          fileName={equipmentMeta?.fileName}
          uploadedAt={equipmentMeta?.uploadedAt}
          rowCount={equipment.length}
          onFileSelected={handleEquipment}
          onDownload={() => exportEquipment(equipment)}
        />
        <FileUploadCard
          title="로드바 정보"
          description="조합·ITEMCD·ITEMCOL·로드바당품목수 4컬럼. 부품 식별 매핑 자료."
          uploaded={loadBar.length > 0}
          fileName={loadBarMeta?.fileName}
          uploadedAt={loadBarMeta?.uploadedAt}
          rowCount={loadBar.length}
          onFileSelected={handleLoadBar}
          onDownload={() => exportLoadBar(loadBar)}
        />
        <FileUploadCard
          title="포장라인 기본근무위치"
          description="사원별 포장라인 내 기본 위치와 이동여부(고정/유동)."
          uploaded={packagePosition.length > 0}
          fileName={packagePositionMeta?.fileName}
          uploadedAt={packagePositionMeta?.uploadedAt}
          rowCount={packagePosition.length}
          onFileSelected={handlePackagePosition}
          onDownload={() => exportPackagePosition(packagePosition)}
        />
        <FileUploadCard
          title="라인 기준인원"
          description="라인별 기준 인원수. 부하시간 × 인원으로 인시(person-hours) 환산."
          uploaded={lineBase.length > 0}
          fileName={lineBaseMeta?.fileName}
          uploadedAt={lineBaseMeta?.uploadedAt}
          rowCount={lineBase.length}
          onFileSelected={handleLineBase}
          onDownload={() => exportLineBase(lineBase)}
        />
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-200 -mt-1 -mx-1 px-1 overflow-x-auto">
          <div className="flex gap-1 flex-1">
            {(["근무기준", "설비기준", "작업그룹", "로드바 정보", "포장라인 위치", "라인 기준인원"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  tab === t
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {t} 편집
                {t === "근무기준" && ` (${employees.length})`}
                {t === "설비기준" && ` (${equipment.length})`}
                {t === "작업그룹" && ` (${workGroups.length})`}
                {t === "로드바 정보" && ` (${loadBar.length.toLocaleString()})`}
                {t === "포장라인 위치" && ` (${packagePosition.length})`}
                {t === "라인 기준인원" && ` (${lineBase.length})`}
              </button>
            ))}
          </div>
          <button
            className="btn btn-secondary whitespace-nowrap mb-2"
            onClick={() => {
              if (tab === "근무기준") exportWorkStandard(employees);
              else if (tab === "설비기준") exportEquipment(equipment);
              else if (tab === "작업그룹") exportWorkGroups(workGroups);
              else if (tab === "로드바 정보") exportLoadBar(loadBar);
              else if (tab === "포장라인 위치") exportPackagePosition(packagePosition);
              else if (tab === "라인 기준인원") exportLineBase(lineBase);
            }}
            title="현재 편집 중인 자료를 엑셀로 다운로드"
          >
            <Download className="w-4 h-4" />
            현재 데이터 다운로드
          </button>
        </div>

        {tab === "근무기준" && <EmployeeTable employees={employees} />}
        {tab === "설비기준" && <EquipmentTable equipment={equipment} />}
        {tab === "작업그룹" && <WorkGroupTable groups={workGroups} />}
        {tab === "로드바 정보" && <LoadBarTable />}
        {tab === "포장라인 위치" && <PackagePositionTable />}
        {tab === "라인 기준인원" && <LineBaseTable />}
      </div>

      <div className="flex justify-end">
        <Link href="/upload" className="btn btn-primary">
          일일자료 업로드 페이지로
        </Link>
      </div>
    </div>
    </AdminGuard>
  );
}

function EmployeeTable({ employees }: { employees: Employee[] }) {
  const updateEmployee = useDataStore((s) => s.updateEmployee);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Employee>>({});

  if (employees.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">근무기준을 업로드해주세요.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>사원코드</th>
            <th>사원명</th>
            <th>부서명</th>
            <th>업무구분</th>
            <th>직책</th>
            <th>구분</th>
            <th className="w-20">편집</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, idx) => {
            const editing = editIdx === idx;
            return (
              <tr key={`${emp.empCode}-${idx}`}>
                <td className="font-mono text-xs">{emp.empCode}</td>
                <td>
                  {editing ? (
                    <input
                      className="input"
                      value={draft.name ?? emp.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  ) : (
                    emp.name
                  )}
                </td>
                <td className="text-xs">{emp.department}</td>
                <td className="text-xs">{emp.workType}</td>
                <td className="text-xs">{emp.position}</td>
                <td>
                  {editing ? (
                    <input
                      className="input"
                      value={draft.category ?? emp.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    />
                  ) : (
                    <span className="badge badge-blue">{emp.category}</span>
                  )}
                </td>
                <td>
                  {editing ? (
                    <div className="flex gap-1">
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          updateEmployee(idx, draft);
                          setEditIdx(null);
                          setDraft({});
                        }}
                      >
                        <Save className="w-3 h-3" />
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditIdx(null);
                          setDraft({});
                        }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditIdx(idx);
                        setDraft({});
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EquipmentTable({ equipment }: { equipment: Equipment[] }) {
  if (equipment.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">설비기준을 업로드해주세요.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>라인(작업그룹)</th>
            <th>작업자</th>
            <th>설비명</th>
            <th>소속</th>
            <th>8h CAPA</th>
            <th>잔업 CAPA</th>
          </tr>
        </thead>
        <tbody>
          {equipment.map((eq, idx) => (
            <tr key={`${eq.equipmentName}-${idx}`}>
              <td>{eq.groupName}</td>
              <td className="text-xs">{eq.workers.join(", ")}</td>
              <td className="font-mono text-xs">{eq.equipmentName}</td>
              <td>
                <span className="badge badge-gray">{eq.affiliation}</span>
              </td>
              <td className="text-right">{eq.capa8h.toLocaleString()}</td>
              <td className="text-right">{eq.capaOvertime.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkGroupTable({ groups }: { groups: WorkGroup[] }) {
  const updateWorkGroup = useDataStore((s) => s.updateWorkGroup);
  const [editName, setEditName] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ workers: string; minPeople: number } | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>작업그룹</th>
            <th>작업자 (쉼표로 구분)</th>
            <th>최소인원</th>
            <th>설비 수</th>
            <th className="w-20">편집</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const editing = editName === g.name;
            return (
              <tr key={g.name}>
                <td className="font-semibold">{g.name}</td>
                <td>
                  {editing && draft ? (
                    <input
                      className="input"
                      value={draft.workers}
                      onChange={(e) =>
                        setDraft({ ...draft, workers: e.target.value })
                      }
                    />
                  ) : (
                    g.workers.join(", ")
                  )}
                </td>
                <td className="text-center">
                  {editing && draft ? (
                    <input
                      type="number"
                      min={0}
                      className="input w-20 text-center"
                      value={draft.minPeople}
                      onChange={(e) =>
                        setDraft({ ...draft, minPeople: Number(e.target.value) })
                      }
                    />
                  ) : (
                    g.minPeople
                  )}
                </td>
                <td className="text-center">{g.equipmentNames.length}</td>
                <td>
                  {editing && draft ? (
                    <div className="flex gap-1">
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          const workers = draft.workers
                            .split(/[,\s]+/)
                            .map((w) => w.trim())
                            .filter(Boolean);
                          updateWorkGroup(g.name, {
                            workers,
                            minPeople: draft.minPeople,
                          });
                          setEditName(null);
                          setDraft(null);
                        }}
                      >
                        <Save className="w-3 h-3" />
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditName(null);
                          setDraft(null);
                        }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditName(g.name);
                        setDraft({
                          workers: g.workers.join(", "),
                          minPeople: g.minPeople,
                        });
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
