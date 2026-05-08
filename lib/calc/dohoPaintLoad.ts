import type {
  AttendanceRecord,
  DohoColorDetail,
  DohoGroupLoad,
  DohoGroupName,
  Employee,
  LoadBarInfo,
  LoadPlanRow,
  PaintPlanRow,
  SupportAssignment,
  SupportRedirect,
  SupportTargetLine,
  UnmatchedPaintItem,
} from "@/lib/types";
import { buildPresentEmpCodes } from "./groupLoad";

// 라인별 CAPA (총원 기준 8시간 로드바 수량)
// 도장1라인: 13명이 8시간 일했을 때 1,100 로드바 처리
// 도장2라인: 8명이 8시간 일했을 때 750 로드바 처리
const CAPA_LINE1 = 1100;
const CAPA_LINE2 = 750;
const LINE1_BASE_PEOPLE = 13;
const LINE2_BASE_PEOPLE = 8;
const STANDARD_WORK_HOURS = 8;

// 도장1라인 색상 (그 외는 도장2라인)
const LINE1_COLORS = new Set(["WW", "TS"]);

// 도장2라인 자동 색상 (그 외 색상은 수동)
const LINE2_AUTO_COLORS = new Set(["BK", "FK", "PW", "MM"]);

// 색상 변경 추가 로드바 (색상수-1) × 20
const COLOR_CHANGE_BARS = 20;
// 미매칭 품목 기본 로드바당 품목수
const DEFAULT_QTY_PER_BAR = 2;

// 쇼트 그룹에 속하는 작업자 (소속이 도장1라인이지만 실제로는 쇼트 인원)
const SHOT_WORKERS = ["김상균"];

// 라인별 부하 공정에서 #쇼트 설비 행을 식별하기 위한 키
const SHOT_EQUIPMENT_NAMES = ["#쇼트", "#쇼트공정"];

interface Args {
  paintPlan: PaintPlanRow[];
  loadPlan: LoadPlanRow[];
  loadBar: LoadBarInfo[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  supportAssignments: SupportAssignment[];
  supportRedirects: SupportRedirect[];
}

export interface ReceivingLineSummary {
  line: SupportTargetLine;
  receivedCount: number;            // 받은 인원 합계
  redirectGroup: string;            // 현재 배치된 그룹 (기본값: line 자체)
}

export interface DohoPaintLoadResult {
  groups: DohoGroupLoad[];
  unmatchedItems: UnmatchedPaintItem[];
  receivingLines: ReceivingLineSummary[]; // 도장1라인 / 도장2라인이 받은 인원
}

const DOHO_RECEIVING_LINES: SupportTargetLine[] = ["도장1라인", "도장2라인"];
const DOHO_GROUP_NAMES: DohoGroupName[] = ["쇼트", "도장1라인", "도장2라인"];

export function computeDohoPaintLoad(args: Args): DohoPaintLoadResult {
  const {
    paintPlan,
    loadPlan,
    loadBar,
    employees,
    attendance,
    supportAssignments,
    supportRedirects,
  } = args;
  const presentCodes = buildPresentEmpCodes(attendance, employees);

  // ---- 1) 인원 분류 (다호 직원만) ----
  // 김상균은 도장1라인 소속이지만 쇼트 그룹으로 분리
  const dohoEmployees = employees.filter(
    (e) => e.department.includes("다호산업") || e.category === "도장1라인" || e.category === "도장2라인"
  );

  const shotWorkers: Employee[] = dohoEmployees.filter((e) => SHOT_WORKERS.includes(e.name));
  const line1Workers: Employee[] = dohoEmployees.filter(
    (e) => e.category === "도장1라인" && !SHOT_WORKERS.includes(e.name)
  );
  const line2Workers: Employee[] = dohoEmployees.filter((e) => e.category === "도장2라인");

  // ---- 2) 쇼트 부하 (라인별 부하 공정에서 #쇼트 설비의 H열 합계) ----
  const shotLoadHours = round1(
    loadPlan
      .filter((r) => SHOT_EQUIPMENT_NAMES.includes(r.equipmentName))
      .reduce((s, r) => s + r.todayHours, 0)
  );

  // ---- 3) 도장1라인 / 도장2라인 부하 (도장계획 기반) ----
  const loadBarMap = buildLoadBarMap(loadBar);
  const allUnmatched = new Map<string, UnmatchedPaintItem>();

  const line1Calc = computeLineLoad({
    rows: paintPlan.filter((r) => LINE1_COLORS.has(r.partColor.toUpperCase())),
    loadBarMap,
    capa: CAPA_LINE1,
    basePeople: LINE1_BASE_PEOPLE,
    unmatched: allUnmatched,
    line: 1,
  });
  const line2Calc = computeLineLoad({
    rows: paintPlan.filter((r) => r.partColor && !LINE1_COLORS.has(r.partColor.toUpperCase())),
    loadBarMap,
    capa: CAPA_LINE2,
    basePeople: LINE2_BASE_PEOPLE,
    unmatched: allUnmatched,
    line: 2,
  });

  // ---- 4) 받은 지원 인원 집계 (도장1·도장2 라인이 받은 인원) ----
  const receivingLines: ReceivingLineSummary[] = DOHO_RECEIVING_LINES.map((line) => {
    const receivedCount = supportAssignments
      .filter((a) => a.targetLine === line)
      .reduce((sum, a) => sum + Math.max(0, a.selectedCount), 0);
    const redirect = supportRedirects.find((r) => r.receivingLine === line);
    const redirectGroup = redirect?.targetGroup || line;
    return { line, receivedCount, redirectGroup };
  });

  // 그룹별 받은 인원 합계 (재배치 후)
  const groupReceivedMap = new Map<string, number>();
  for (const rl of receivingLines) {
    if (rl.receivedCount <= 0) continue;
    const target = DOHO_GROUP_NAMES.includes(rl.redirectGroup as DohoGroupName)
      ? rl.redirectGroup
      : rl.line; // 잘못된 그룹명이면 기본값(line)
    groupReceivedMap.set(target, (groupReceivedMap.get(target) ?? 0) + rl.receivedCount);
  }

  // ---- 5) 그룹별 결과 합치기 (받은 인원 반영) ----
  const shotGroup = buildGroupLoad(
    "쇼트",
    shotWorkers,
    shotLoadHours,
    presentCodes,
    groupReceivedMap.get("쇼트") ?? 0
  );

  const line1Group: DohoGroupLoad = {
    ...buildGroupLoad(
      "도장1라인",
      line1Workers,
      line1Calc.totalLoadHours,
      presentCodes,
      groupReceivedMap.get("도장1라인") ?? 0
    ),
    baseLoadbarQty: line1Calc.baseLoadbarQty,
    colorChangeBars: line1Calc.colorChangeBars,
    itemChangeBars: line1Calc.itemChangeBars,
    totalLoadbarQty: line1Calc.totalLoadbarQty,
    capa: CAPA_LINE1,
    colorBreakdown: line1Calc.colorBreakdown,
  };

  const line2Group: DohoGroupLoad = {
    ...buildGroupLoad(
      "도장2라인",
      line2Workers,
      line2Calc.totalLoadHours,
      presentCodes,
      groupReceivedMap.get("도장2라인") ?? 0
    ),
    baseLoadbarQty: line2Calc.baseLoadbarQty,
    colorChangeBars: line2Calc.colorChangeBars,
    itemChangeBars: line2Calc.itemChangeBars,
    totalLoadbarQty: line2Calc.totalLoadbarQty,
    capa: CAPA_LINE2,
    colorBreakdown: line2Calc.colorBreakdown,
  };

  return {
    groups: [shotGroup, line1Group, line2Group],
    unmatchedItems: Array.from(allUnmatched.values()).sort((a, b) => b.totalQty - a.totalQty),
    receivingLines,
  };
}

// ---- helpers ----

function buildLoadBarMap(loadBar: LoadBarInfo[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const lb of loadBar) {
    const key = makeKey(lb.itemCd, lb.itemCol);
    m.set(key, lb.qtyPerBar);
  }
  return m;
}

function makeKey(itemCd: string, itemCol: string): string {
  return `${itemCd.trim().toUpperCase()}::${itemCol.trim().toUpperCase()}`;
}

interface LineLoadResult {
  baseLoadbarQty: number;
  colorChangeBars: number;
  itemChangeBars: number;
  totalLoadbarQty: number;
  totalLoadHours: number;
  colorBreakdown: DohoColorDetail[];
}

function computeLineLoad(args: {
  rows: PaintPlanRow[];
  loadBarMap: Map<string, number>;
  capa: number;
  basePeople: number;
  unmatched: Map<string, UnmatchedPaintItem>;
  line: 1 | 2;
}): LineLoadResult {
  const { rows, loadBarMap, capa, basePeople, unmatched, line } = args;

  let baseLoadbarQty = 0;
  // 색상별 집계: 색상 → 합계
  const colorMap = new Map<
    string,
    { loadbarQty: number; productionQty: number; items: Set<string> }
  >();
  // 품목 종류 (L+M unique)
  const itemSet = new Set<string>();

  for (const r of rows) {
    if (!r.partCode) continue;
    // 계획량은 도장계획 O열(planQty)을 사용
    const planQty = r.planQty;
    const key = makeKey(r.partCode, r.partColor);
    const matched = loadBarMap.get(key);
    // qtyPerBar가 0 또는 음수인 경우도 기본값으로 fallback (분모 0 방지)
    const isMatched = matched !== undefined && matched > 0;
    const qtyPerBar = isMatched ? matched! : DEFAULT_QTY_PER_BAR;
    // 행별 로드바 = 올림(계획량 / 로드바당 품목수)
    // 한 로드바에 N개씩 걸 수 있다면 계획량을 N으로 나눈 (올림한) 수만큼 로드바 필요
    const bars = planQty > 0 ? Math.ceil(planQty / qtyPerBar) : 0;
    baseLoadbarQty += bars;

    if (matched === undefined) {
      const um = unmatched.get(key);
      if (um) {
        um.totalQty += planQty;
        um.rowCount += 1;
      } else {
        unmatched.set(key, {
          partCode: r.partCode,
          partColor: r.partColor,
          totalQty: planQty,
          rowCount: 1,
        });
      }
    }

    const colorKey = r.partColor || "(미지정)";
    if (!colorMap.has(colorKey)) {
      colorMap.set(colorKey, { loadbarQty: 0, productionQty: 0, items: new Set() });
    }
    const c = colorMap.get(colorKey)!;
    c.loadbarQty += bars;
    c.productionQty += planQty;
    c.items.add(r.partCode);

    itemSet.add(key);
  }

  const colorCount = colorMap.size;
  const itemCount = itemSet.size;
  const colorChangeBars = colorCount > 1 ? (colorCount - 1) * COLOR_CHANGE_BARS : 0;
  const itemChangeBars = itemCount;
  const totalLoadbarQty = baseLoadbarQty + colorChangeBars + itemChangeBars;
  // 총부하시간(인시) = 총로드바 × (총원기준 가용시간) / 로드바 CAPA
  //   = 총로드바 × (basePeople × 8) / CAPA
  // 예) 도장1라인: 1100 로드바 = 13명 × 8h = 104 인시
  const totalLoadHours =
    capa > 0
      ? round1((totalLoadbarQty * basePeople * STANDARD_WORK_HOURS) / capa)
      : 0;

  const colorBreakdown: DohoColorDetail[] = Array.from(colorMap.entries())
    .map(([color, info]) => {
      // 도장2라인만 자동/수동 구분 (도장1라인은 undefined)
      const isAuto =
        line === 2 ? LINE2_AUTO_COLORS.has(color.toUpperCase()) : undefined;
      return {
        color,
        loadbarQty: info.loadbarQty,
        productionQty: info.productionQty,
        itemCount: info.items.size,
        isAuto,
      };
    })
    .sort((a, b) => {
      // 도장2라인: 자동(true) 먼저, 그 안에서 생산수량 내림차순
      if (a.isAuto !== undefined && b.isAuto !== undefined && a.isAuto !== b.isAuto) {
        return a.isAuto ? -1 : 1;
      }
      // 그 외: 생산수량(계획량) 내림차순
      return b.productionQty - a.productionQty;
    });

  return {
    baseLoadbarQty,
    colorChangeBars,
    itemChangeBars,
    totalLoadbarQty,
    totalLoadHours,
    colorBreakdown,
  };
}

// 잔업 1인당 추가 가능 시간 (고정)
const OVERTIME_HOURS_PER_PERSON = 3;
// 지원 1인당 가능 시간 (8시간)
const SUPPORT_HOURS_PER_PERSON = 8;

function buildGroupLoad(
  group: DohoGroupName,
  workers: Employee[],
  totalLoadHours: number,
  presentCodes: Set<string>,
  receivedSupportCount: number = 0
): DohoGroupLoad {
  const presentWorkers: string[] = [];
  const absentWorkers: string[] = [];
  for (const e of workers) {
    if (presentCodes.has(e.empCode)) presentWorkers.push(e.name);
    else absentWorkers.push(e.name);
  }
  const presentCount = presentWorkers.length;
  // 가용시간 = (출근인원 + 받은 지원인원) × 8
  const effectivePeople = presentCount + receivedSupportCount;
  const availableHours = effectivePeople * 8;
  const diffHours = round1(availableHours - totalLoadHours);
  const shortageHours = diffHours < 0 ? Math.abs(diffHours) : 0;

  // 1순위: 잔업으로 부족시간 채우기 — 잔업 가능 인원은 출근작업자 수까지로 제한
  const overtimePeople =
    shortageHours > 0
      ? Math.min(Math.ceil(shortageHours / OVERTIME_HOURS_PER_PERSON), presentCount)
      : 0;
  const overtimeCoveredHours = overtimePeople * OVERTIME_HOURS_PER_PERSON;

  // 2순위: 잔업으로 못 채운 나머지 부족분만 지원필요인원으로 계산
  const remainingShortage = Math.max(0, round1(shortageHours - overtimeCoveredHours));
  const supportNeededPeople =
    remainingShortage > 0
      ? Math.ceil(remainingShortage / SUPPORT_HOURS_PER_PERSON)
      : 0;

  // 여유시간 → 지원가능인원 (받은 인원 제외하고 자기 인원만 보낼 수 있음)
  const supportablePeople =
    diffHours > 0 ? Math.min(Math.floor(diffHours / 8), presentCount) : 0;

  return {
    group,
    workers: workers.map((e) => e.name),
    presentWorkers,
    absentWorkers,
    totalLoadHours,
    availableHours,
    diffHours,
    overtimePeople,
    supportNeededPeople,
    supportablePeople,
    receivedSupportCount,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
