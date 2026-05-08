import * as XLSX from "xlsx";
import type {
  Employee,
  Equipment,
  LineBaseHeadcount,
  LoadBarInfo,
  PackagePosition,
  WorkGroup,
} from "@/lib/types";

function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function downloadSheet(
  rows: unknown[][],
  sheetName: string,
  fileName: string
) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

export function exportWorkStandard(employees: Employee[]) {
  const rows: unknown[][] = [
    [
      "사원코드",
      "사원명",
      "부서명",
      "업무구분",
      "직책",
      "급여구분",
      "구분",
      "기본근무위치",
      "비고",
    ],
    ...employees.map((e) => [
      e.empCode,
      e.name,
      e.department,
      e.workType,
      e.position,
      e.payType,
      e.category,
      e.baseLocation,
      e.remark,
    ]),
  ];
  downloadSheet(rows, "인원", `근무기준_${todayStr()}.xlsx`);
}

export function exportEquipment(equipment: Equipment[]) {
  // 업로드 시에는 라인/인원/비고 컬럼이 그룹 단위로 병합되어 있지만
  // 다운로드는 평탄화하여 모든 행에 채워서 내보낸다 (편집 편의)
  const rows: unknown[][] = [
    ["라인", "인원", "비고", "설비명", "소속", "8시간 CAPA", "잔업 CAPA"],
    ...equipment.map((eq) => [
      eq.groupName,
      eq.basePeople,
      eq.workersRaw,
      eq.equipmentName,
      eq.affiliation,
      eq.capa8h,
      eq.capaOvertime,
    ]),
  ];
  downloadSheet(rows, "설비", `설비기준_${todayStr()}.xlsx`);
}

export function exportWorkGroups(groups: WorkGroup[]) {
  const rows: unknown[][] = [["작업그룹", "최소인원", "작업자", "설비명"]];
  for (const g of groups) {
    const equipments = g.equipmentNames.length > 0 ? g.equipmentNames : [""];
    equipments.forEach((eq, idx) => {
      rows.push([
        idx === 0 ? g.name : "",
        idx === 0 ? g.minPeople : "",
        idx === 0 ? g.workers.join(", ") : "",
        eq,
      ]);
    });
  }
  downloadSheet(rows, "작업그룹", `작업그룹_${todayStr()}.xlsx`);
}

export function exportLoadBar(items: LoadBarInfo[]) {
  const rows: unknown[][] = [
    ["조합", "ITEMCD", "ITEMCOL", "로드바당품목수"],
    ...items.map((l) => [l.combo, l.itemCd, l.itemCol, l.qtyPerBar]),
  ];
  downloadSheet(rows, "로드바 정보", `로드바정보_${todayStr()}.xlsx`);
}

export function exportLineBase(items: LineBaseHeadcount[]) {
  const rows: unknown[][] = [
    ["라인명", "인원"],
    ...items.map((l) => [l.line, l.headcount]),
  ];
  downloadSheet(rows, "Sheet1", `라인_기준인원_${todayStr()}.xlsx`);
}

export function exportPackagePosition(items: PackagePosition[]) {
  const rows: unknown[][] = [
    ["사원코드", "사원명", "부서명", "구분", "기본근무위치", "이동여부"],
    ...items.map((p) => [
      p.empCode,
      p.name,
      p.department,
      p.category,
      p.position,
      p.movement,
    ]),
  ];
  downloadSheet(rows, "Sheet1", `포장라인_기본근무위치_${todayStr()}.xlsx`);
}
