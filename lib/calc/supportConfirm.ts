import type { SupportAssignment } from "@/lib/types";

/**
 * 그룹별 지원가능인원(supportable)을 행 순서대로 분배해 confirmed 인원 계산.
 *
 * - 한 그룹의 supportable 이 N 명일 때, 같은 그룹의 여러 행이 있으면 위→아래 순서로 N 까지만 배분
 * - id 가 없는 옛 데이터도 동작 (같은 그룹 여러 행 우선순위는 배열 인덱스 순)
 * - 반환: id 가 있으면 id → confirmed, id 가 없으면 group+index → confirmed
 */
export function calcConfirmedByGroup(
  assignments: SupportAssignment[],
  supportableMap: Map<string, number>
): Map<string, number> {
  const result = new Map<string, number>();

  // 그룹별로 행 모음 (원본 인덱스 보존)
  const byGroup = new Map<string, { a: SupportAssignment; idx: number }[]>();
  assignments.forEach((a, idx) => {
    if (!byGroup.has(a.group)) byGroup.set(a.group, []);
    byGroup.get(a.group)!.push({ a, idx });
  });

  for (const [group, rows] of byGroup.entries()) {
    let remaining = supportableMap.get(group) ?? 0;
    for (const { a, idx } of rows) {
      const key = a.id ?? `${group}#${idx}`;
      if (!a.targetLine || a.selectedCount <= 0) {
        result.set(key, 0);
        continue;
      }
      const give = Math.max(0, Math.min(a.selectedCount, remaining));
      result.set(key, give);
      remaining -= give;
    }
  }

  return result;
}

// 한 SupportAssignment 의 confirmed 추출 (calcConfirmedByGroup 결과 활용)
export function getConfirmedFor(
  a: SupportAssignment,
  index: number,
  confirmed: Map<string, number>
): number {
  const key = a.id ?? `${a.group}#${index}`;
  return confirmed.get(key) ?? 0;
}

// 한 그룹이 보낸 confirmed 합계
export function sumSentByGroup(
  group: string,
  assignments: SupportAssignment[],
  confirmed: Map<string, number>
): number {
  let total = 0;
  assignments.forEach((a, idx) => {
    if (a.group === group) {
      total += getConfirmedFor(a, idx, confirmed);
    }
  });
  return total;
}

// 한 라인이 받은 confirmed 합계
export function sumReceivedByLine(
  line: string,
  assignments: SupportAssignment[],
  confirmed: Map<string, number>
): number {
  let total = 0;
  assignments.forEach((a, idx) => {
    if (a.targetLine === line) {
      total += getConfirmedFor(a, idx, confirmed);
    }
  });
  return total;
}
