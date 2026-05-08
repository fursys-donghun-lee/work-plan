import type { Equipment, EquipmentLoadRow, LoadPlanRow, WorkGroup } from "@/lib/types";
import { DASKER_AUTOMATION_EQUIPMENT } from "./defaultGroups";

interface ComputeResult {
  rows: EquipmentLoadRow[];
  unmatchedPlanEquipment: { name: string; qty: number }[]; // 라인별 부하 공정엔 있으나 설비기준엔 없음
  unmatchedGroupEquipment: string[];                       // 설비기준엔 있으나 어느 작업그룹에도 안 속함
}

export function computeEquipmentLoad(
  equipment: Equipment[],
  loadPlan: LoadPlanRow[],
  workGroups: WorkGroup[]
): ComputeResult {
  // 설비명 → 작업그룹 매핑
  const equipToGroup = new Map<string, string>();
  for (const g of workGroups) {
    for (const eq of g.equipmentNames) {
      equipToGroup.set(eq, g.name);
    }
  }

  // 설비기준에서 설비명 → 메타 매핑
  const equipMeta = new Map<string, Equipment>();
  for (const eq of equipment) {
    equipMeta.set(eq.equipmentName, eq);
  }

  // 라인별 부하 공정 → 당일 계획량 합계 (같은 설비명 여러 행 누적)
  const planByEquipment = new Map<string, number>();
  for (const row of loadPlan) {
    if (!row.equipmentName) continue;
    const cur = planByEquipment.get(row.equipmentName) ?? 0;
    planByEquipment.set(row.equipmentName, cur + row.todayQty);
  }

  // 모든 설비 합치기 (설비기준 + 라인별 부하 공정)
  const allEquipNames = new Set<string>([
    ...equipMeta.keys(),
    ...planByEquipment.keys(),
  ]);

  const rows: EquipmentLoadRow[] = [];
  const unmatchedPlanEquipment: { name: string; qty: number }[] = [];
  const unmatchedGroupEquipment: string[] = [];

  for (const name of Array.from(allEquipNames).sort()) {
    const meta = equipMeta.get(name);
    const plan = planByEquipment.get(name) ?? 0;

    if (!meta) {
      // 라인별 부하 공정엔 있으나 설비기준엔 없음
      if (plan > 0) unmatchedPlanEquipment.push({ name, qty: plan });
      continue; // 설비기준 정보 없으면 부하 계산 불가
    }

    const groupName = equipToGroup.get(name) ?? "미지정";
    if (groupName === "미지정") {
      unmatchedGroupEquipment.push(name);
    }

    const capa = meta.capa8h;
    const rawHours = capa > 0 ? (plan / capa) * 8 : 0;
    const factor = DASKER_AUTOMATION_EQUIPMENT.includes(name) ? 0.5 : 1.0;
    const appliedHours = rawHours * factor;

    rows.push({
      groupName,
      affiliation: meta.affiliation,
      workersRaw: meta.workersRaw,
      workers: meta.workers,
      equipmentName: name,
      capa8h: capa,
      todayQty: plan,
      capaRatio: capa > 0 ? plan / capa : 0,
      rawHours: round1(rawHours),
      factor,
      appliedHours: round1(appliedHours),
    });
  }

  return { rows, unmatchedPlanEquipment, unmatchedGroupEquipment };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
