"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { PackagePosition } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export function PackagePositionTable() {
  const positions = useDataStore((s) => s.packagePosition);
  const updatePackagePosition = useDataStore((s) => s.updatePackagePosition);
  const addPackagePosition = useDataStore((s) => s.addPackagePosition);
  const deletePackagePosition = useDataStore((s) => s.deletePackagePosition);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<PackagePosition | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState<PackagePosition>({
    empCode: "",
    name: "",
    department: "",
    category: "",
    position: "",
    movement: "고정",
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return positions.map((row, idx) => ({ row, idx }));
    const q = search.toLowerCase();
    return positions
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) =>
        [row.empCode, row.name, row.department, row.category, row.position, row.movement]
          .some((v) => v.toLowerCase().includes(q))
      );
  }, [positions, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  if (positions.length === 0 && !showAdd) {
    return (
      <p className="text-sm text-slate-500 py-6 text-center">
        포장라인 기본근무위치를 업로드해주세요.
      </p>
    );
  }

  const handleStartEdit = (idx: number) => {
    setEditIdx(idx);
    setDraft({ ...positions[idx] });
  };
  const handleSaveEdit = () => {
    if (editIdx !== null && draft) {
      updatePackagePosition(editIdx, draft);
    }
    setEditIdx(null);
    setDraft(null);
  };
  const handleCancelEdit = () => {
    setEditIdx(null);
    setDraft(null);
  };
  const handleAdd = () => {
    if (!newRow.empCode.trim() && !newRow.name.trim()) return;
    addPackagePosition(newRow);
    setNewRow({
      empCode: "",
      name: "",
      department: "",
      category: "",
      position: "",
      movement: "고정",
    });
    setShowAdd(false);
    setPage(0);
  };
  const handleDelete = (idx: number) => {
    if (!confirm("이 행을 삭제하시겠습니까?")) return;
    deletePackagePosition(idx);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input flex-1 max-w-md"
          placeholder="사원코드 / 사원명 / 부서 / 구분 / 위치 / 이동여부 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" />
          행 추가
        </button>
        <div className="ml-auto text-sm text-slate-600">
          {filtered.length.toLocaleString()}건 / 전체 {positions.length.toLocaleString()}건
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-14">#</th>
              <th>사원코드</th>
              <th>사원명</th>
              <th>부서명</th>
              <th>구분</th>
              <th>기본근무위치</th>
              <th>이동여부</th>
              <th className="w-24">편집</th>
            </tr>
          </thead>
          <tbody>
            {showAdd && (
              <tr className="bg-blue-50/40">
                <td className="text-center text-xs text-slate-400">신규</td>
                <td>
                  <input
                    className="input"
                    placeholder="사원코드"
                    value={newRow.empCode}
                    onChange={(e) => setNewRow({ ...newRow, empCode: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    placeholder="사원명"
                    value={newRow.name}
                    onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    placeholder="부서명"
                    value={newRow.department}
                    onChange={(e) => setNewRow({ ...newRow, department: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    placeholder="구분"
                    value={newRow.category}
                    onChange={(e) => setNewRow({ ...newRow, category: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    placeholder="기본근무위치"
                    value={newRow.position}
                    onChange={(e) => setNewRow({ ...newRow, position: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="select"
                    value={newRow.movement}
                    onChange={(e) => setNewRow({ ...newRow, movement: e.target.value })}
                  >
                    <option value="고정">고정</option>
                    <option value="유동">유동</option>
                  </select>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn btn-primary" onClick={handleAdd}>
                      <Save className="w-3 h-3" />
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {visible.map(({ row, idx }) => {
              const editing = editIdx === idx;
              return (
                <tr key={`${idx}-${row.empCode}`}>
                  <td className="text-center text-xs text-slate-400">{idx + 1}</td>
                  <td className="font-mono text-xs">
                    {editing && draft ? (
                      <input
                        className="input"
                        value={draft.empCode}
                        onChange={(e) => setDraft({ ...draft, empCode: e.target.value })}
                      />
                    ) : (
                      row.empCode
                    )}
                  </td>
                  <td>
                    {editing && draft ? (
                      <input
                        className="input"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="text-xs">
                    {editing && draft ? (
                      <input
                        className="input"
                        value={draft.department}
                        onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                      />
                    ) : (
                      row.department
                    )}
                  </td>
                  <td>
                    {editing && draft ? (
                      <input
                        className="input"
                        value={draft.category}
                        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                      />
                    ) : (
                      <span className="badge badge-blue">{row.category}</span>
                    )}
                  </td>
                  <td>
                    {editing && draft ? (
                      <input
                        className="input"
                        value={draft.position}
                        onChange={(e) => setDraft({ ...draft, position: e.target.value })}
                      />
                    ) : (
                      <span className="badge badge-gray">{row.position}</span>
                    )}
                  </td>
                  <td>
                    {editing && draft ? (
                      <select
                        className="select"
                        value={draft.movement}
                        onChange={(e) => setDraft({ ...draft, movement: e.target.value })}
                      >
                        <option value="고정">고정</option>
                        <option value="유동">유동</option>
                      </select>
                    ) : (
                      <span
                        className={cn(
                          "badge",
                          row.movement === "유동" ? "badge-amber" : "badge-green"
                        )}
                      >
                        {row.movement}
                      </span>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <div className="flex gap-1">
                        <button className="btn btn-primary" onClick={handleSaveEdit}>
                          <Save className="w-3 h-3" />
                        </button>
                        <button className="btn btn-secondary" onClick={handleCancelEdit}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button className="btn btn-secondary" onClick={() => handleStartEdit(idx)}>
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button className="btn btn-danger" onClick={() => handleDelete(idx)}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-6">
                  조건에 맞는 행이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1">
          <button
            className={cn("btn btn-secondary", safePage === 0 && "opacity-40 cursor-not-allowed")}
            onClick={() => safePage > 0 && setPage(safePage - 1)}
            disabled={safePage === 0}
          >
            이전
          </button>
          <span className="text-sm text-slate-600 px-3">
            {safePage + 1} / {totalPages}
          </span>
          <button
            className={cn(
              "btn btn-secondary",
              safePage === totalPages - 1 && "opacity-40 cursor-not-allowed"
            )}
            onClick={() => safePage < totalPages - 1 && setPage(safePage + 1)}
            disabled={safePage === totalPages - 1}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
