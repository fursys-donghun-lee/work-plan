"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { LoadBarInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export function LoadBarTable() {
  const loadBar = useDataStore((s) => s.loadBar);
  const updateLoadBar = useDataStore((s) => s.updateLoadBar);
  const addLoadBar = useDataStore((s) => s.addLoadBar);
  const deleteLoadBar = useDataStore((s) => s.deleteLoadBar);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<LoadBarInfo | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRow, setNewRow] = useState<LoadBarInfo>({
    combo: "",
    itemCd: "",
    itemCol: "",
    qtyPerBar: 0,
  });

  // 검색 필터 (인덱스 보존)
  const filtered = useMemo(() => {
    if (!search.trim()) {
      return loadBar.map((row, idx) => ({ row, idx }));
    }
    const q = search.toLowerCase();
    return loadBar
      .map((row, idx) => ({ row, idx }))
      .filter(
        ({ row }) =>
          row.combo.toLowerCase().includes(q) ||
          row.itemCd.toLowerCase().includes(q) ||
          row.itemCol.toLowerCase().includes(q)
      );
  }, [loadBar, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  if (loadBar.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-6 text-center">
        로드바 정보를 업로드해주세요.
      </p>
    );
  }

  // 조합은 ITEMCD + "-" + ITEMCOL 형식으로 자동 생성 (사용자 입력 불필요)
  const buildCombo = (itemCd: string, itemCol: string): string => {
    const cd = itemCd.trim();
    const col = itemCol.trim();
    if (!cd && !col) return "";
    if (!col) return cd;
    if (!cd) return col;
    return `${cd}-${col}`;
  };

  const handleStartEdit = (idx: number) => {
    setEditIdx(idx);
    setDraft({ ...loadBar[idx] });
  };

  const handleSaveEdit = () => {
    if (editIdx !== null && draft) {
      const next: LoadBarInfo = {
        ...draft,
        combo: buildCombo(draft.itemCd, draft.itemCol),
      };
      updateLoadBar(editIdx, next);
    }
    setEditIdx(null);
    setDraft(null);
  };

  const handleCancelEdit = () => {
    setEditIdx(null);
    setDraft(null);
  };

  const handleAdd = () => {
    if (!newRow.itemCd.trim() && !newRow.itemCol.trim()) return;
    const item: LoadBarInfo = {
      ...newRow,
      combo: buildCombo(newRow.itemCd, newRow.itemCol),
    };
    addLoadBar(item);
    setNewRow({ combo: "", itemCd: "", itemCol: "", qtyPerBar: 0 });
    setShowAddRow(false);
    setPage(0);
  };

  const handleDelete = (idx: number) => {
    if (!confirm("이 행을 삭제하시겠습니까?")) return;
    deleteLoadBar(idx);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input flex-1 max-w-md"
          placeholder="조합 / ITEMCD / ITEMCOL 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <button
          className="btn btn-primary"
          onClick={() => setShowAddRow(true)}
        >
          <Plus className="w-4 h-4" />
          행 추가
        </button>
        <div className="ml-auto text-sm text-slate-600">
          {filtered.length.toLocaleString()}건 / 전체 {loadBar.length.toLocaleString()}건
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-14">#</th>
              <th>조합</th>
              <th>ITEMCD</th>
              <th>ITEMCOL</th>
              <th className="text-right">로드바당품목수</th>
              <th className="w-24">편집</th>
            </tr>
          </thead>
          <tbody>
            {showAddRow && (
              <tr className="bg-blue-50/40">
                <td className="text-center text-xs text-slate-400">신규</td>
                <td>
                  <input
                    className="input bg-slate-100 text-slate-500"
                    placeholder="자동생성"
                    value={buildCombo(newRow.itemCd, newRow.itemCol)}
                    readOnly
                    tabIndex={-1}
                    title="조합은 ITEMCD-ITEMCOL 로 자동 생성됩니다"
                  />
                </td>
                <td>
                  <input
                    className="input"
                    placeholder="ITEMCD"
                    value={newRow.itemCd}
                    onChange={(e) => setNewRow({ ...newRow, itemCd: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    placeholder="ITEMCOL"
                    value={newRow.itemCol}
                    onChange={(e) => setNewRow({ ...newRow, itemCol: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="input text-right"
                    value={newRow.qtyPerBar}
                    onChange={(e) =>
                      setNewRow({ ...newRow, qtyPerBar: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn btn-primary" onClick={handleAdd}>
                      <Save className="w-3 h-3" />
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowAddRow(false)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {visible.map(({ row, idx }) => {
              const editing = editIdx === idx;
              return (
                <tr key={`${idx}-${row.combo}`}>
                  <td className="text-center text-xs text-slate-400">{idx + 1}</td>
                  <td className="font-mono text-xs">
                    {editing && draft ? (
                      <input
                        className="input bg-slate-100 text-slate-500"
                        value={buildCombo(draft.itemCd, draft.itemCol)}
                        readOnly
                        tabIndex={-1}
                        title="조합은 ITEMCD-ITEMCOL 로 자동 생성됩니다"
                      />
                    ) : (
                      row.combo
                    )}
                  </td>
                  <td className="font-mono text-xs">
                    {editing && draft ? (
                      <input
                        className="input"
                        value={draft.itemCd}
                        onChange={(e) =>
                          setDraft({ ...draft, itemCd: e.target.value })
                        }
                      />
                    ) : (
                      row.itemCd
                    )}
                  </td>
                  <td>
                    {editing && draft ? (
                      <input
                        className="input"
                        value={draft.itemCol}
                        onChange={(e) =>
                          setDraft({ ...draft, itemCol: e.target.value })
                        }
                      />
                    ) : (
                      <span className="badge badge-gray">{row.itemCol}</span>
                    )}
                  </td>
                  <td className="text-right">
                    {editing && draft ? (
                      <input
                        type="number"
                        className="input text-right"
                        value={draft.qtyPerBar}
                        onChange={(e) =>
                          setDraft({ ...draft, qtyPerBar: Number(e.target.value) })
                        }
                      />
                    ) : (
                      row.qtyPerBar.toLocaleString()
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <div className="flex gap-1">
                        <button className="btn btn-primary" onClick={handleSaveEdit}>
                          <Save className="w-3 h-3" />
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={handleCancelEdit}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleStartEdit(idx)}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDelete(idx)}
                        >
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
                <td colSpan={6} className="text-center text-slate-500 py-6">
                  조건에 맞는 행이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <Pagination
        page={safePage}
        totalPages={totalPages}
        onChange={setPage}
        totalRows={filtered.length}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
  totalRows,
  pageSize,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  totalRows: number;
  pageSize: number;
}) {
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalRows);

  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  // 표시할 페이지 번호 계산 (현재 페이지 ±2)
  const pages: number[] = [];
  const range = 2;
  const lo = Math.max(0, page - range);
  const hi = Math.min(totalPages - 1, page + range);
  for (let i = lo; i <= hi; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="text-xs text-slate-500">
        {totalRows > 0 ? (
          <>
            {start.toLocaleString()} – {end.toLocaleString()} / {totalRows.toLocaleString()}
          </>
        ) : (
          "0건"
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          className={cn("btn btn-secondary", !canPrev && "opacity-40 cursor-not-allowed")}
          onClick={() => canPrev && onChange(0)}
          disabled={!canPrev}
        >
          처음
        </button>
        <button
          className={cn("btn btn-secondary", !canPrev && "opacity-40 cursor-not-allowed")}
          onClick={() => canPrev && onChange(page - 1)}
          disabled={!canPrev}
        >
          이전
        </button>
        {pages[0] > 0 && <span className="text-slate-400 px-1">…</span>}
        {pages.map((p) => (
          <button
            key={p}
            className={cn(
              "btn",
              p === page ? "btn-primary" : "btn-secondary",
              "min-w-[2.5rem] justify-center"
            )}
            onClick={() => onChange(p)}
          >
            {p + 1}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages - 1 && (
          <span className="text-slate-400 px-1">…</span>
        )}
        <button
          className={cn("btn btn-secondary", !canNext && "opacity-40 cursor-not-allowed")}
          onClick={() => canNext && onChange(page + 1)}
          disabled={!canNext}
        >
          다음
        </button>
        <button
          className={cn("btn btn-secondary", !canNext && "opacity-40 cursor-not-allowed")}
          onClick={() => canNext && onChange(totalPages - 1)}
          disabled={!canNext}
        >
          끝
        </button>
      </div>
    </div>
  );
}
