// === 회사 ===
// "전체" = 안성공장 통합 뷰 (디폴트). 그 외는 개별 회사.
export type Company = "전체" | "우성산업" | "다호산업" | "대림산업";

// 회사 분기 로직용 (전체 제외, 진짜 회사들)
export const COMPANIES: Exclude<Company, "전체">[] = [
  "우성산업",
  "다호산업",
  "대림산업",
];

// 셀렉터에 보일 옵션 (전체 포함)
export const COMPANY_OPTIONS: Company[] = ["전체", ...COMPANIES];

// === 라인 / 작업그룹 ===
export type SupportTargetLine =
  | ""
  | "포장1라인"
  | "포장2라인"
  | "도장1라인"
  | "도장2라인";

export const SUPPORT_LINES: SupportTargetLine[] = [
  "포장1라인",
  "포장2라인",
  "도장1라인",
  "도장2라인",
];

export const MAIN_LINES = [
  "우성 사장님",
  "사무업무대행",
  "가공라인",
  "포장1라인",
  "포장2라인",
  "도장1라인",
  "도장2라인",
] as const;

export type MainLine = (typeof MAIN_LINES)[number];

// 부하 계산 제외 라인 (출근 표시만)
export const NON_LOAD_LINES: MainLine[] = ["우성 사장님", "사무업무대행"];

// === 근무기준 (Employee Master) ===
export interface Employee {
  empCode: string;       // 사원코드 (e.g., WS180402)
  name: string;          // 사원명
  department: string;    // 부서명 (e.g., 우성산업(가공라인))
  workType: string;      // 업무구분 (직접/간접)
  position: string;      // 직책
  payType: string;       // 급여구분
  category: string;      // 구분 (= 작업라인)
  baseLocation: string;  // 기본근무위치
  remark: string;
}

// === 근태 (Attendance) ===
export interface AttendanceRecord {
  empCode: string;
  name: string;
  workDate: string;
  startTime: number | string | null;  // 엑셀 decimal or HH:MM
  isPresent: boolean;
}

// === 설비기준 (Equipment Master) ===
export interface Equipment {
  groupName: string;     // 라인 (= 작업그룹, A열)
  basePeople: number;    // 인원 (B열)
  workersRaw: string;    // 작업자 원본 (C열, 줄바꿈 구분)
  workers: string[];     // 작업자 정규화 (지원 표기 제거)
  equipmentName: string; // 설비명 (D열)
  affiliation: string;   // 소속 (E열, 가공라인 등)
  capa8h: number;        // 8시간 CAPA (F열)
  capaOvertime: number;  // 잔업 CAPA (G열)
}

// === 라인별 부하 공정 (Load Plan) ===
export interface LoadPlanRow {
  no: string;
  source: string;        // 생산처 (B열)
  process: string;       // 공정 (C열)
  equipmentName: string; // 설비 (D열)
  carryQty: number;      // 이월계획량 (E열)
  carryHours: number;    // 이월계획시간 (F열)
  todayQty: number;      // 당일 계획량 (G열)
  todayHours: number;    // 당일 계획시간 (H열)
}

// === 긴급생산리스트 (Urgent Production) ===
// C열 출고일은 공백이면 위 행에서 forward-fill 됨.
// 출고일 < 근무일자 → D-1, 출고일 == 근무일자 → D-2 긴급건.
export interface UrgentProductionRow {
  no: string;
  shipDate: string;        // 출고일 (forward-filled, YYYY-MM-DD)
  productCode: string;     // 단품코드 (D열)
  color: string;           // 색상 (E열)
  packagePlanDate: string; // 포장계획일 (F열)
  packageLine: string;     // 포장라인 (G열, 그룹 매핑 키)
  planQty: number;         // 계획량 (H열)
  shipQty: number;         // 출고수량 (I열)
}

// === 업로드 로그 (감사용) ===
// 어떤 자료가 언제 업로드/수정됐는지 기록.
export interface UploadLogEntry {
  category:
    | "근무기준"
    | "설비기준"
    | "로드바 정보"
    | "포장라인 기본근무위치"
    | "라인 기준인원"
    | "근태"
    | "라인별 공정 부하"
    | "도장계획"
    | "라인별 포장 부하"
    | "긴급생산리스트";
  scope: "기준자료" | "일일자료";
  fileName: string;
  uploadedAt: string; // ISO timestamp
  rowCount: number;
}

// === 라인별 포장 부하 (Package Load) ===
export interface PackageLoadRow {
  no: string;
  source: string;     // 생산처 (B열, 포장1라인(안성)/포장2라인(안성))
  line: string;       // 라인 (C열, 포장1(CR1)/MA-01 등)
  carryQty: number;   // 이월계획량 (E열)
  carryHours: number; // 이월계획시간 (F열)
  todayQty: number;   // 당일 계획량 (G열)
  todayHours: number; // 당일 계획시간 (H열)
}

// === 작업그룹 정의 (사용자 편집 가능) ===
export interface WorkGroup {
  name: string;
  workers: string[];          // 작업자 이름 (사원코드 매칭은 Employee.name으로)
  minPeople: number;
  equipmentNames: string[];   // 이 그룹에 속하는 설비명 목록
}

// === 지원 배정 (사용자 입력) ===
// 하나의 그룹이 여러 라인으로 나눠 보낼 수 있도록 같은 group 의 행이 여러 개 가능.
// id 로 행을 식별 (옵셔널 — 옛 데이터 호환을 위해 자동 부여).
export interface SupportAssignment {
  id?: string;
  group: string;                   // 작업그룹명
  targetLine: SupportTargetLine;
  selectedCount: number;           // 사용자가 선택한 인원
}

// === 받은 지원 인원의 작업그룹 재배치 ===
// 가공라인 → 도장1라인으로 1명 보내면, 도장1라인이 받은 그 1명을 어느 작업그룹에 배치할지 선택
export interface SupportRedirect {
  receivingLine: SupportTargetLine;  // 받는 라인 (포장1/2/도장1/2)
  targetGroup: string;                 // 실제 배치되는 작업그룹명 (예: 쇼트/도장1라인/도장2라인)
}

// === 계산 결과 ===
export interface EquipmentLoadRow {
  groupName: string;       // 매칭된 작업그룹명 (없으면 "미지정")
  affiliation: string;     // 소속
  workersRaw: string;
  workers: string[];
  equipmentName: string;
  capa8h: number;
  todayQty: number;
  capaRatio: number;       // todayQty / capa8h
  rawHours: number;        // 원부하시간
  factor: number;          // 반영계수 (1 or 0.5)
  appliedHours: number;    // 반영부하시간
}

export interface GroupLoadRow {
  group: string;
  workers: string[];
  presentWorkers: string[];
  absentWorkers: string[];
  totalLoadHours: number;
  availableHours: number;
  diffHours: number;
  judgement: "정상" | "잔업필요" | "지원가능";
  minPeople: number;
  overtimePeople: number;
  supportablePeople: number;
}

export interface LineSummary {
  lineName: MainLine;
  baseCount: number;
  attendanceCount: number;
  absentCount: number;
  absentNames: string[];
  overtimePeople: number;
  supportablePeople: number;
  receivedSupportCount: number;
  sentSupportCount: number;
  finalAvailableCount: number;
}

// === 업로드 알림 ===
export interface UploadAlert {
  level: "error" | "warning" | "info";
  message: string;
  detail?: string;
}

// === 다호 도장 부하 ===
export type DohoGroupName = "쇼트" | "도장1라인" | "도장2라인";

export interface DohoColorDetail {
  color: string;
  loadbarQty: number;       // 로드바 수량 (품목별 로드바수량 × 계획량 합)
  productionQty: number;    // 생산수량 (계획량 합)
  itemCount: number;        // 해당 색상 품목 수 (L+M unique)
  isAuto?: boolean;         // 자동(true) / 수동(false). 구분 없는 라인은 undefined
}

export interface DohoGroupLoad {
  group: DohoGroupName;
  workers: string[];
  presentWorkers: string[];
  absentWorkers: string[];
  totalLoadHours: number;
  availableHours: number;
  diffHours: number;
  overtimePeople: number;       // 잔업필요인원 (반올림 부족/3)
  supportNeededPeople: number;  // 지원필요인원 (올림 부족/8)
  supportablePeople: number;    // 지원가능인원 (내림 여유/8)
  receivedSupportCount: number; // 다른 라인에서 받은 후 이 그룹으로 재배치된 인원
  // 도장1, 도장2 라인 전용
  baseLoadbarQty?: number;
  colorChangeBars?: number;
  itemChangeBars?: number;
  totalLoadbarQty?: number;
  capa?: number;
  colorBreakdown?: DohoColorDetail[];
}

export interface UnmatchedPaintItem {
  partCode: string;
  partColor: string;
  totalQty: number;     // 해당 품목 누적 계획량
  rowCount: number;     // 등장 행수
}

// === 로드바 정보 (기준자료) ===
export interface LoadBarInfo {
  combo: string;       // 조합 (예: A01-1A-0025L-MM)
  itemCd: string;      // ITEMCD
  itemCol: string;     // ITEMCOL (색상)
  qtyPerBar: number;   // 로드바당품목수
}

// === 라인 기준인원 (기준자료) ===
// A열 라인명과 일치하는 라인의 부하시간에 B열 인원을 곱해서 인시(person-hours)로 환산
export interface LineBaseHeadcount {
  line: string;       // 라인명 (예: 포장1(CR1), PA-01, MM-01 등)
  headcount: number;  // 인원
}

// === 포장라인 기본근무위치 (기준자료) ===
export interface PackagePosition {
  empCode: string;     // 사원코드
  name: string;        // 사원명
  department: string;  // 부서명 (다호산업 / 대림산업 등)
  category: string;    // 구분 (포장1라인 / 포장2라인 / 물류 등)
  position: string;    // 기본근무위치 (포장1(CR1) / 피더 등)
  movement: string;    // 이동여부 (고정 / 유동)
}

// === 포장1라인 그룹 정의 ===
export const PACKAGE1_GROUPS = [
  "포장1(CR1)",
  "포장1(CR2)",
  "포장1(기타1)",
  "포장1(HSOD)",
  "포장1(마감1)",
  "포장1(기타2)",
  "포장1(마감2)",
  "포장1(침대)",
  "포장1(타일1)",
  "피더",
] as const;

export type Package1Group = (typeof PACKAGE1_GROUPS)[number];

// === 포장2라인 그룹 정의 (대림산업) ===
export const PACKAGE2_GROUPS = [
  "PA-01",
  "PA-02",
  "PA-03",
  "PA-04",
  "PA-05",
  "PA-06",
  "PA-07",
  "MM-01",
  "MM-02",
  "MM-03",
  "MA-01",
  "MA-02",
  "MA-03",
  "MM-04",
  "MM-05",
  "자동포장(파이프)",
  "피더",
] as const;

// 포장2라인 피더(간접) 그룹에 자동 배치되는 작업자 (이름 기준)
export const PACKAGE2_FEEDER_WORKERS = ["김성욱", "진영기", "박동호", "유인섭"];

export type Package2Group = (typeof PACKAGE2_GROUPS)[number];

// 포장2라인 그룹 부하 결과 (포장1과 동일 구조)
export interface Package2GroupLoad {
  group: Package2Group;
  members: PackagePosition[];
  presentMembers: PackagePosition[];
  absentMembers: PackagePosition[];
  loadHours: number;
  todayQty: number;
  availableHours: number;
  diffHours: number;
  overtimePeople: number;
  supportNeededPeople: number;
  supportablePeople: number;
  supportCount: number;
}

// 사원코드 → 그룹명 재배치 매핑 (기본근무위치 override)
export type PackageWorkerOverrides = Record<string, string>;

// 사용자가 묶은 그룹 합치기 (각 묶음은 그룹명 배열)
// 예: [["포장1(기타1)", "포장1(HSOD)"], ["포장1(마감1)", "포장1(마감2)"]]
export type PackageGroupMerges = string[][];

// 포장1라인 그룹 부하 결과
export interface Package1GroupLoad {
  group: Package1Group;
  members: PackagePosition[];        // 이 그룹에 배치된 직원 (override 반영)
  presentMembers: PackagePosition[];
  absentMembers: PackagePosition[];
  loadHours: number;                 // 라인별 포장 부하 todayHours 합
  todayQty: number;                  // 라인별 포장 부하 todayQty 합
  availableHours: number;            // (출근 + 받은 지원인원) × 8
  diffHours: number;
  overtimePeople: number;            // 잔업필요인원
  supportNeededPeople: number;       // 지원필요인원
  supportablePeople: number;         // 지원가능인원
  supportCount: number;              // 다른 라인에서 받아 이 그룹에 배치된 지원인원 수
}

// === 출근/이동 로그 (인원별 근무관리) ===
export type WorkLogAction = "출근" | "퇴근" | "지원" | "이동";

export interface WorkLogEntry {
  id: string;            // 고유 ID (timestamp + empCode + random)
  empCode: string;
  name: string;
  workDate: string;      // YYYY-MM-DD
  timestamp: string;     // ISO datetime
  action: WorkLogAction;
  line?: string;         // 출근/퇴근/지원 시 당시 위치
  fromLine?: string;     // 이동 시 출발 라인
  toLine?: string;       // 이동 시 도착 라인
}

// 사원코드 → 현재 라인 위치 (출근 후 드래그앤드롭/지원으로 변경 가능)
export type CurrentLineOverrides = Record<string, string>;

// === 도장계획 (다호산업 일일자료) ===
export interface PaintPlanRow {
  no: string;            // A: 번호
  shiftPaint: string;    // C: SHIFT_가공
  available: string;     // D: 작업가능여부 Y/N
  priority: number;      // E: 가공우선순위
  cardNo: string;        // F: 부품이동카드번호
  inputType: string;     // H: 투입구분
  inputDate: string;     // I: 투입일자
  partCode: string;      // L: 부품코드
  partColor: string;     // M: 부품색상
  partName: string;      // N: 부품명
  planQty: number;       // O: 계획량
  inputQty: number;      // P: 투입량
  prodQty: number;       // Q: 생산수량
  defectQty: number;     // R: 불량수량
  planMinutes: number;   // S: 생산계획시간 (분)
  paintLine: string;     // AJ: 작업설비 (#도장 1라인 / #도장 2라인)
  productCode: string;   // AN: 제품코드
  productName: string;   // AP: 제품명
  currentProcess: string; // AT: 현공정
  workStatus: string;    // AU: 이동카드출력여부 (대기 등)
  packageLine: string;   // AZ: 포장라인 (포장1(CR1) 등)
  manager: string;       // AE: 청구자
  ticketNo: string;      // AF: 관리번호
}
