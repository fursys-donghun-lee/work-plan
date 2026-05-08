"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { LineBaseHeadcount } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export function LineBaseTable() {
  const lineBase = useDataStore((s) => s.lineBase);
  const updateLineBase = useDataStore((s) => s.updateLineBase);
  const addLineBase = useDataStore((s) => s.addLineBase);
  const deleteLineBase = useDataStore((s) => s.deleteLineBase);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<LineBaseHeadcount | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState<LineBaseHeadcount>({ line: "", headcount: 1 });

  const filtered = useMemo(() => {
    if (!search.trim()) return lineBase.map((row, idx) => ({ row, idx }));
    const q = search.toLowerCase();
    return lineBase
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row.line.toLowerCase().includes(q));
  }, [lineBase, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  if (lineBase.length === 0 && !showAdd) {
    return (
      <p className="text-sm text-slate-500 py-6 text-center">
        라인 기준인원을 업로드해주세요.
      </p>
    );
  }

  const handleStartEdit = (idx: number) => {
    setEditIdx(idx);
    setDraft({ ...lineBase[idx] });
  };
  const handleSaveEdit = () => {
    if (editIdx !== null && draft) updateLineBase(editIdx, draft);
    setEditIdx(null);
    setDraft(null);
  };
  const handleCancelEdit = () => {
    setEditIdx(null);
    setDraft(null);
  };
  const handleAdd = () => {
    if (!newRow.line.trim()) return;
    addLineBase(newRow);
    setNewRow({ line: "", headcount: 1 });
    setShowAdd(false);
    setPage(0);
  };
  const handleDelete = (idx: number) => {
    if (!confirm("이 행을 삭제하시겠습니까?")) return;
    deleteLineBase(idx);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input flex-1 max-w-md"
          placeholder="라인명 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" /> 행 추가
        </button>
        <div className="ml-auto text-sm text-slate-600">
          {filtered.length.toLocaleString()}건 / 전체 {lineBase.length.toLocaleString()}건
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-14">#</th>
              <th>라인명</th>
              <th className="text-right">인원</th>
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
                    placeholder="라인명"
                    value={newRow.line}
                    onChange={(e) => setNewRow({ ...newRow, line: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="input text-right"
                    value={newRow.headcount}
                    onChange={(e) =>
                      setNewRow({ ...newRow, headcount: Number(e.target.value) })
                    }
                  />
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
                <tr key={`${idx}-${row.line}`}>
                  <td className="text-center text-xs text-slate-400">{idx + 1}</td>
                  <td>
                    {editing && draft ? (
                      <input
                        className="input"
                        value={draft.line}
                        onChange={(e) => setDraft({ ...draft, line: e.target.value })}
                      />
                    ) : (
                      row.line
                    )}
                  </td>
                  <td className="text-right">
                    {editing && draft ? (
                      <input
                        type="number"
                        className="input text-right"
                        value={draft.headcount}
                        onChange={(e) =>
                          setDraft({ ...draft, headcount: Number(e.target.value) })
                        }
                      />
                    ) : (
                      row.headcount.toLocaleString()
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
                <td colSpan={4} className="text-center text-slate-500 py-6">
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
