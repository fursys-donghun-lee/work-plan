"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AttendanceRecord,
  Company,
  Employee,
  Equipment,
  LineBaseHeadcount,
  LoadBarInfo,
  LoadPlanRow,
  PackageGroupMerges,
  PackageLoadRow,
  PackagePosition,
  PackageWorkerOverrides,
  PaintPlanRow,
  SupportAssignment,
  SupportRedirect,
  SupportTargetLine,
  UploadLogEntry,
  UrgentProductionRow,
  WorkGroup,
  WorkLogEntry,
  CurrentLineOverrides,
  SupportTargetMap,
  SupportTargetLineName,
} from "@/lib/types";
import { DEFAULT_WORK_GROUPS } from "@/lib/calc/defaultGroups";

interface UploadMeta {
  fileName: string;
  uploadedAt: string;
}

interface DataState {
  // 회사 선택
  selectedCompany: Company;
  // 시작화면(랜딩 선택)에서 회사를 골랐는지 여부 — false면 selector 화면을 보여줌
  companyChosen: boolean;
  // 관리자 비밀번호 통과 여부 (세션 단위, 새로고침 시 초기화)
  isAdmin: boolean;
  // sessionStorage 복원 완료 여부 (복원 전 selector flash 방지용)
  sessionReady: boolean;

  // 기준자료
  employees: Employee[];
  equipment: Equipment[];
  workGroups: WorkGroup[];
  loadBar: LoadBarInfo[];
  packagePosition: PackagePosition[];
  lineBase: LineBaseHeadcount[];
  workStandardMeta: UploadMeta | null;
  equipmentMeta: UploadMeta | null;
  loadBarMeta: UploadMeta | null;
  packagePositionMeta: UploadMeta | null;
  lineBaseMeta: UploadMeta | null;

  // 일일자료
  attendance: AttendanceRecord[];
  loadPlan: LoadPlanRow[];
  paintPlan: PaintPlanRow[];
  packageLoad: PackageLoadRow[];
  urgentProduction: UrgentProductionRow[];
  workDate: string;
  attendanceMeta: UploadMeta | null;
  loadPlanMeta: UploadMeta | null;
  paintPlanMeta: UploadMeta | null;
  packageLoadMeta: UploadMeta | null;
  urgentProductionMeta: UploadMeta | null;

  // 사용자 입력
  supportAssignments: SupportAssignment[];
  supportRedirects: SupportRedirect[];
  packageWorkerOverrides: PackageWorkerOverrides;
  // 포장1라인 지원 슬롯 배치: 인덱스(0~N-1) → 그룹명 (빈 문자열이면 미배치)
  packageSupportPlacements: string[];
  // 포장1라인 그룹 병합: 사용자가 묶은 그룹들의 배열 (각 묶음은 2개 이상의 그룹명)
  packageGroupMerges: PackageGroupMerges;
  // 포장2라인 (대림) 전용
  package2WorkerOverrides: PackageWorkerOverrides;
  package2SupportPlacements: string[];
  package2GroupMerges: PackageGroupMerges;
  // 오늘 잔업 확정된 사원코드 (라인/회사 구분 없이 통합 — 화면에서 필터링)
  overtimeConfirmed: string[];

  // 수동 배치 (대림 포장2라인 /plan 페이지) 산출 잔업 인원
  manualPlanOvertimeBasic: number;
  manualPlanOvertimeConfirmed: number;
  manualPlanFeederOvertimeBasic: number;
  manualPlanFeederOvertimeConfirmed: number;
  // 수동 배치 (대림 포장2라인) — 포장철물 잔업확정 (메인 대시보드 표시)
  manualPlanPCMOvertimeConfirmed: number;
  // 수동 배치 (다호 포장1라인 /plan 페이지) 산출 잔업 인원
  dohoPlanOvertimeBasic: number;
  dohoPlanOvertimeConfirmed: number;
  dohoPlanFeederOvertimeBasic: number;
  dohoPlanFeederOvertimeConfirmed: number;

  // 업로드 로그 (최근 50개 유지)
  uploadLog: UploadLogEntry[];

  // 인원별 근무 로그 (출근/퇴근/지원/이동 시간 기록)
  workLog: WorkLogEntry[];
  // 사원코드 → 현재 라인 (출근 후 변경된 위치)
  currentLineOverrides: CurrentLineOverrides;
  // 현장 대시보드 수동 출근 — 사원코드 → 출근 ISO timestamp
  //   일일자료 근태와 별개로, 이름 클릭한 인원만 기록
  manualClockIns: Record<string, string>;
  // 사원코드 → 지원 대상 라인 (override 가 '지원' 일 때 어느 라인 지원하는지)
  supportTargetMap: SupportTargetMap;
  // 마지막 일일 초기화 날짜 (YYYY-MM-DD) — 자정 넘어가면 reset 실행 트리거
  lastDailyReset: string;
  // 삭제된 workLog id 추적 (미출근 처리 시 다른 PC 의 스냅샷이 복원 못 하도록)
  //   일일 초기화 때 함께 정리됨
  deletedWorkLogIds: string[];

  // Actions
  setSelectedCompany: (company: Company) => void;
  setCompanyChosen: (chosen: boolean) => void;
  setIsAdmin: (b: boolean) => void;
  setSessionReady: (b: boolean) => void;
  setEmployees: (data: Employee[], meta: UploadMeta) => void;
  setEquipment: (data: Equipment[], meta: UploadMeta) => void;
  setLoadBar: (data: LoadBarInfo[], meta: UploadMeta) => void;
  updateLoadBar: (index: number, patch: Partial<LoadBarInfo>) => void;
  addLoadBar: (item: LoadBarInfo) => void;
  deleteLoadBar: (index: number) => void;
  setPackagePosition: (data: PackagePosition[], meta: UploadMeta) => void;
  updatePackagePosition: (index: number, patch: Partial<PackagePosition>) => void;
  addPackagePosition: (item: PackagePosition) => void;
  deletePackagePosition: (index: number) => void;
  setLineBase: (data: LineBaseHeadcount[], meta: UploadMeta) => void;
  updateLineBase: (index: number, patch: Partial<LineBaseHeadcount>) => void;
  addLineBase: (item: LineBaseHeadcount) => void;
  deleteLineBase: (index: number) => void;
  setAttendance: (data: AttendanceRecord[], workDate: string, meta: UploadMeta) => void;
  clockInEmployee: (empCode: string, name: string, line?: string) => void;
  clockOutEmployee: (
    empCode: string,
    name: string,
    line?: string,
    action?: "미출근" | "퇴근"
  ) => void;
  logSupport: (empCode: string, name: string, line: string, targetLine: SupportTargetLineName) => void;
  moveWorkerLine: (empCode: string, name: string, fromLine: string, toLine: string) => void;
  returnFromSupport: (empCode: string, name: string, defaultLine: string) => void;
  // 일괄 출근 — 한 번에 여러 명 출근 처리
  bulkClockIn: (
    workers: Array<{ empCode: string; name: string; line: string }>
  ) => void;
  // 일일 초기화 — 다음날이 되면 현장 대시보드 상태 모두 리셋
  resetDailyClockInState: (today: string) => void;
  setWorkDate: (workDate: string) => void;
  setLoadPlan: (data: LoadPlanRow[], meta: UploadMeta) => void;
  setPaintPlan: (data: PaintPlanRow[], meta: UploadMeta) => void;
  setPackageLoad: (data: PackageLoadRow[], meta: UploadMeta) => void;
  setUrgentProduction: (data: UrgentProductionRow[], meta: UploadMeta) => void;
  updateEmployee: (index: number, patch: Partial<Employee>) => void;
  updateEquipment: (index: number, patch: Partial<Equipment>) => void;
  updateWorkGroup: (name: string, patch: Partial<WorkGroup>) => void;
  setSupportAssignment: (group: string, patch: Partial<SupportAssignment>) => void;
  addSupportRow: (group: string) => void;
  updateSupportRow: (id: string, patch: Partial<SupportAssignment>) => void;
  deleteSupportRow: (id: string) => void;
  setSupportRedirect: (receivingLine: SupportTargetLine, targetGroup: string) => void;
  setPackageWorkerOverride: (empCode: string, groupName: string) => void;
  clearPackageWorkerOverride: (empCode: string) => void;
  resetPackageWorkerOverrides: () => void;
  setPackageSupportPlacement: (index: number, groupName: string) => void;
  clearPackageSupportPlacement: (index: number) => void;
  resetPackageSupportPlacements: () => void;
  addPackageGroupMerge: (groups: string[]) => void;
  removePackageGroupMerge: (mergeIndex: number) => void;
  resetPackageGroupMerges: () => void;
  // 포장2라인 액션
  setPackage2WorkerOverride: (empCode: string, groupName: string) => void;
  clearPackage2WorkerOverride: (empCode: string) => void;
  resetPackage2WorkerOverrides: () => void;
  setPackage2SupportPlacement: (index: number, groupName: string) => void;
  clearPackage2SupportPlacement: (index: number) => void;
  resetPackage2SupportPlacements: () => void;
  addPackage2GroupMerge: (groups: string[]) => void;
  removePackage2GroupMerge: (mergeIndex: number) => void;
  resetPackage2GroupMerges: () => void;
  toggleOvertimeConfirmed: (empCode: string) => void;
  clearOvertimeConfirmed: () => void;
  setManualPlanOvertime: (
    basic: number,
    confirmed: number,
    feederBasic: number,
    feederConfirmed: number
  ) => void;
  setManualPlanPCMOvertimeConfirmed: (count: number) => void;
  setDohoPlanOvertime: (
    basic: number,
    confirmed: number,
    feederBasic: number,
    feederConfirmed: number
  ) => void;
  addUploadLog: (entry: UploadLogEntry) => void;
  clearUploadLog: () => void;
  clearAllData: () => void;
}

function makeSupportId(): string {
  return `sa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const initialAssignments = (): SupportAssignment[] =>
  DEFAULT_WORK_GROUPS.map((g) => ({
    id: makeSupportId(),
    group: g.name,
    targetLine: "" as SupportTargetLine,
    selectedCount: 0,
  }));

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      selectedCompany: "전체" as Company,
      companyChosen: false,
      isAdmin: false,
      sessionReady: false,
      employees: [],
      equipment: [],
      workGroups: DEFAULT_WORK_GROUPS,
      loadBar: [],
      packagePosition: [],
      lineBase: [],
      workStandardMeta: null,
      equipmentMeta: null,
      loadBarMeta: null,
      packagePositionMeta: null,
      lineBaseMeta: null,
      attendance: [],
      loadPlan: [],
      paintPlan: [],
      packageLoad: [],
      urgentProduction: [],
      workDate: "",
      attendanceMeta: null,
      loadPlanMeta: null,
      paintPlanMeta: null,
      packageLoadMeta: null,
      urgentProductionMeta: null,
      supportAssignments: initialAssignments(),
      supportRedirects: [],
      packageWorkerOverrides: {},
      packageSupportPlacements: [],
      packageGroupMerges: [],
      package2WorkerOverrides: {},
      package2SupportPlacements: [],
      package2GroupMerges: [],
      overtimeConfirmed: [],
      manualPlanOvertimeBasic: 0,
      manualPlanOvertimeConfirmed: 0,
      manualPlanFeederOvertimeBasic: 0,
      manualPlanFeederOvertimeConfirmed: 0,
      manualPlanPCMOvertimeConfirmed: 0,
      dohoPlanOvertimeBasic: 0,
      dohoPlanOvertimeConfirmed: 0,
      dohoPlanFeederOvertimeBasic: 0,
      dohoPlanFeederOvertimeConfirmed: 0,
      uploadLog: [],
      workLog: [],
      currentLineOverrides: {},
      manualClockIns: {},
      supportTargetMap: {},
      lastDailyReset: "",
      deletedWorkLogIds: [],

      setSelectedCompany: (company) => set({ selectedCompany: company }),
      setCompanyChosen: (chosen) => set({ companyChosen: chosen }),
      setIsAdmin: (b) => set({ isAdmin: b }),
      setSessionReady: (b) => set({ sessionReady: b }),
      setEmployees: (data, meta) => set({ employees: data, workStandardMeta: meta }),
      setEquipment: (data, meta) => set({ equipment: data, equipmentMeta: meta }),
      setLoadBar: (data, meta) => set({ loadBar: data, loadBarMeta: meta }),
      updateLoadBar: (index, patch) =>
        set((state) => {
          const next = [...state.loadBar];
          if (next[index]) next[index] = { ...next[index], ...patch };
          return { loadBar: next };
        }),
      addLoadBar: (item) =>
        set((state) => ({ loadBar: [item, ...state.loadBar] })),
      deleteLoadBar: (index) =>
        set((state) => ({
          loadBar: state.loadBar.filter((_, i) => i !== index),
        })),
      setPackagePosition: (data, meta) =>
        set({ packagePosition: data, packagePositionMeta: meta }),
      updatePackagePosition: (index, patch) =>
        set((state) => {
          const next = [...state.packagePosition];
          if (next[index]) next[index] = { ...next[index], ...patch };
          return { packagePosition: next };
        }),
      addPackagePosition: (item) =>
        set((state) => ({ packagePosition: [item, ...state.packagePosition] })),
      deletePackagePosition: (index) =>
        set((state) => ({
          packagePosition: state.packagePosition.filter((_, i) => i !== index),
        })),
      setLineBase: (data, meta) =>
        set({ lineBase: data, lineBaseMeta: meta }),
      updateLineBase: (index, patch) =>
        set((state) => {
          const next = [...state.lineBase];
          if (next[index]) next[index] = { ...next[index], ...patch };
          return { lineBase: next };
        }),
      addLineBase: (item) =>
        set((state) => ({ lineBase: [item, ...state.lineBase] })),
      deleteLineBase: (index) =>
        set((state) => ({
          lineBase: state.lineBase.filter((_, i) => i !== index),
        })),
      // setAttendance: 파일의 workDate 는 무시 (오늘 날짜는 SessionState 가 관리)
      setAttendance: (data, _workDate, meta) =>
        set({ attendance: data, attendanceMeta: meta }),
      // 출근 — manualClockIns + workLog + attendance (재배치 계획·메인 대시보드 반영)
      //   현장 대시보드는 manualClockIns 만 보지만, 다른 화면은 attendance 를 보므로 둘 다 갱신
      clockInEmployee: (empCode, name, line) =>
        set((state) => {
          const now = new Date();
          const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const logEntry: WorkLogEntry = {
            id: `${now.getTime()}-${empCode}-${Math.random().toString(36).slice(2, 8)}`,
            empCode,
            name,
            workDate: state.workDate,
            timestamp: now.toISOString(),
            action: "출근",
            line: line || "",
          };
          // attendance 갱신
          const idx = state.attendance.findIndex((a) => a.empCode === empCode);
          let nextAttendance: AttendanceRecord[];
          if (idx >= 0) {
            nextAttendance = [...state.attendance];
            nextAttendance[idx] = {
              ...nextAttendance[idx],
              startTime: hhmm,
              isPresent: true,
              name: nextAttendance[idx].name || name,
            };
          } else {
            nextAttendance = [
              ...state.attendance,
              {
                empCode,
                name,
                workDate: state.workDate,
                startTime: hhmm,
                isPresent: true,
              },
            ];
          }
          const nextOverrides = line
            ? { ...state.currentLineOverrides, [empCode]: line }
            : state.currentLineOverrides;
          return {
            attendance: nextAttendance,
            workLog: [...state.workLog, logEntry],
            manualClockIns: {
              ...state.manualClockIns,
              [empCode]: now.toISOString(),
            },
            currentLineOverrides: nextOverrides,
          };
        }),
      // 미출근/퇴근 — manualClockIns + attendance + override 모두 정리
      //   미출근 = 안 옴 (오늘 그 사람의 workLog 전체 제거 — 흔적 없음)
      //   퇴근   = 왔다가 감 (퇴근 entry 추가)
      clockOutEmployee: (empCode, name, line, action = "미출근") =>
        set((state) => {
          const now = new Date();
          let nextWorkLog: WorkLogEntry[];
          let nextDeletedIds = state.deletedWorkLogIds;
          if (action === "미출근") {
            // 오늘 그 사람의 모든 workLog entry 제거 (출근·이동·지원 다 삭제)
            const deletedIds: string[] = [];
            nextWorkLog = state.workLog.filter((e) => {
              if (e.empCode === empCode && e.workDate === state.workDate) {
                deletedIds.push(e.id);
                return false;
              }
              return true;
            });
            // 다른 PC 의 스냅샷이 union 으로 복원 못 하도록 ID 추적
            if (deletedIds.length > 0) {
              nextDeletedIds = [...state.deletedWorkLogIds, ...deletedIds];
            }
          } else {
            const logEntry: WorkLogEntry = {
              id: `${now.getTime()}-${empCode}-${Math.random().toString(36).slice(2, 8)}`,
              empCode,
              name,
              workDate: state.workDate,
              timestamp: now.toISOString(),
              action: "퇴근",
              line: line || "",
            };
            nextWorkLog = [...state.workLog, logEntry];
          }
          const idx = state.attendance.findIndex((a) => a.empCode === empCode);
          let nextAttendance = state.attendance;
          if (idx >= 0) {
            nextAttendance = [...state.attendance];
            nextAttendance[idx] = {
              ...nextAttendance[idx],
              isPresent: false,
              startTime: null,
            };
          }
          const nextClockIns = { ...state.manualClockIns };
          delete nextClockIns[empCode];
          const nextOverrides = { ...state.currentLineOverrides };
          delete nextOverrides[empCode];
          const nextSupport = { ...state.supportTargetMap };
          delete nextSupport[empCode];
          return {
            attendance: nextAttendance,
            workLog: nextWorkLog,
            deletedWorkLogIds: nextDeletedIds,
            manualClockIns: nextClockIns,
            currentLineOverrides: nextOverrides,
            supportTargetMap: nextSupport,
          };
        }),
      // 지원 — workLog 기록 + 라인에서 빠짐(override='지원') + supportTargetMap 에 대상 라인 기록
      logSupport: (empCode, name, line, targetLine) =>
        set((state) => {
          const now = new Date();
          const logEntry: WorkLogEntry = {
            id: `${now.getTime()}-${empCode}-${Math.random().toString(36).slice(2, 8)}`,
            empCode,
            name,
            workDate: state.workDate,
            timestamp: now.toISOString(),
            action: "지원",
            line: line || "",
            toLine: targetLine,
          };
          return {
            workLog: [...state.workLog, logEntry],
            currentLineOverrides: {
              ...state.currentLineOverrides,
              [empCode]: "지원",
            },
            supportTargetMap: {
              ...state.supportTargetMap,
              [empCode]: targetLine,
            },
          };
        }),
      // 드래그앤드롭 이동 — workLog 에 이동 기록 + currentLineOverrides 갱신
      moveWorkerLine: (empCode, name, fromLine, toLine) =>
        set((state) => {
          if (fromLine === toLine) return state;
          const now = new Date();
          const logEntry: WorkLogEntry = {
            id: `${now.getTime()}-${empCode}-${Math.random().toString(36).slice(2, 8)}`,
            empCode,
            name,
            workDate: state.workDate,
            timestamp: now.toISOString(),
            action: "이동",
            fromLine,
            toLine,
          };
          // 라인 이동만 처리 — supportTargetMap 은 건드리지 않음 (받은 지원 인원이
          //   슬롯에 배치돼도 우리 라인 지원 상태 유지)
          return {
            workLog: [...state.workLog, logEntry],
            currentLineOverrides: {
              ...state.currentLineOverrides,
              [empCode]: toLine,
            },
          };
        }),
      // 지원 → 본인 기본 라인 복귀 (홈 회사 대시보드에서만 호출)
      returnFromSupport: (empCode, name, defaultLine) =>
        set((state) => {
          const now = new Date();
          const logEntry: WorkLogEntry = {
            id: `${now.getTime()}-${empCode}-${Math.random().toString(36).slice(2, 8)}`,
            empCode,
            name,
            workDate: state.workDate,
            timestamp: now.toISOString(),
            action: "이동",
            fromLine: "지원",
            toLine: defaultLine,
          };
          const nextSupport = { ...state.supportTargetMap };
          delete nextSupport[empCode];
          return {
            workLog: [...state.workLog, logEntry],
            currentLineOverrides: {
              ...state.currentLineOverrides,
              [empCode]: defaultLine,
            },
            supportTargetMap: nextSupport,
          };
        }),
      // 일괄 출근 — 여러 명 한꺼번에 출근 처리 (한 번의 setState 로 처리)
      bulkClockIn: (workers) =>
        set((state) => {
          const now = new Date();
          const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
          const newLogEntries: WorkLogEntry[] = [];
          const nextAttendance = [...state.attendance];
          const nextClockIns = { ...state.manualClockIns };
          const nextOverrides = { ...state.currentLineOverrides };

          for (const { empCode, name, line } of workers) {
            if (state.manualClockIns[empCode]) continue; // 이미 출근 — skip
            newLogEntries.push({
              id: `${now.getTime()}-${empCode}-${Math.random().toString(36).slice(2, 8)}`,
              empCode,
              name,
              workDate: state.workDate,
              timestamp: now.toISOString(),
              action: "출근",
              line: line || "",
            });
            const idx = nextAttendance.findIndex((a) => a.empCode === empCode);
            if (idx >= 0) {
              nextAttendance[idx] = {
                ...nextAttendance[idx],
                startTime: hhmm,
                isPresent: true,
                name: nextAttendance[idx].name || name,
              };
            } else {
              nextAttendance.push({
                empCode,
                name,
                workDate: state.workDate,
                startTime: hhmm,
                isPresent: true,
              });
            }
            nextClockIns[empCode] = now.toISOString();
            if (line) nextOverrides[empCode] = line;
          }

          return {
            attendance: nextAttendance,
            workLog: [...state.workLog, ...newLogEntries],
            manualClockIns: nextClockIns,
            currentLineOverrides: nextOverrides,
          };
        }),
      // 일일 초기화 — 모든 현장 대시보드 상태 리셋 (출근/이동/지원/attendance.isPresent)
      //   workLog 는 보존 (날짜별 필터되는 히스토리)
      resetDailyClockInState: (today) =>
        set((state) => ({
          lastDailyReset: today,
          manualClockIns: {},
          currentLineOverrides: {},
          supportTargetMap: {},
          deletedWorkLogIds: [],
          attendance: state.attendance.map((a) => ({
            ...a,
            isPresent: false,
            startTime: null,
          })),
        })),
      setWorkDate: (workDate) => set({ workDate }),
      setLoadPlan: (data, meta) => set({ loadPlan: data, loadPlanMeta: meta }),
      setPaintPlan: (data, meta) => set({ paintPlan: data, paintPlanMeta: meta }),
      setPackageLoad: (data, meta) => set({ packageLoad: data, packageLoadMeta: meta }),
      setUrgentProduction: (data, meta) =>
        set({ urgentProduction: data, urgentProductionMeta: meta }),
      updateEmployee: (index, patch) =>
        set((state) => {
          const next = [...state.employees];
          if (next[index]) next[index] = { ...next[index], ...patch };
          return { employees: next };
        }),
      updateEquipment: (index, patch) =>
        set((state) => {
          const next = [...state.equipment];
          if (next[index]) next[index] = { ...next[index], ...patch };
          return { equipment: next };
        }),
      updateWorkGroup: (name, patch) =>
        set((state) => ({
          workGroups: state.workGroups.map((g) =>
            g.name === name ? { ...g, ...patch } : g
          ),
        })),
      setSupportAssignment: (group, patch) =>
        set((state) => {
          // 같은 group 의 첫 번째 row 를 수정 (없으면 새로 추가). 분할 지원은 addSupportRow 로 사용.
          const idx = state.supportAssignments.findIndex((a) => a.group === group);
          const next = [...state.supportAssignments];
          if (idx >= 0) {
            const cur = next[idx];
            next[idx] = {
              ...cur,
              id: cur.id ?? makeSupportId(),
              ...patch,
            };
          } else {
            next.push({
              id: makeSupportId(),
              group,
              targetLine: "" as SupportTargetLine,
              selectedCount: 0,
              ...patch,
            } as SupportAssignment);
          }
          return { supportAssignments: next };
        }),
      addSupportRow: (group) =>
        set((state) => ({
          supportAssignments: [
            ...state.supportAssignments,
            {
              id: makeSupportId(),
              group,
              targetLine: "" as SupportTargetLine,
              selectedCount: 0,
            },
          ],
        })),
      updateSupportRow: (id, patch) =>
        set((state) => ({
          supportAssignments: state.supportAssignments.map((a) =>
            (a.id ?? "") === id ? { ...a, ...patch } : a
          ),
        })),
      deleteSupportRow: (id) =>
        set((state) => ({
          supportAssignments: state.supportAssignments.filter(
            (a) => (a.id ?? "") !== id
          ),
        })),
      setSupportRedirect: (receivingLine, targetGroup) =>
        set((state) => {
          const filtered = state.supportRedirects.filter(
            (r) => r.receivingLine !== receivingLine
          );
          if (targetGroup) {
            filtered.push({ receivingLine, targetGroup });
          }
          return { supportRedirects: filtered };
        }),
      setPackageWorkerOverride: (empCode, groupName) =>
        set((state) => ({
          packageWorkerOverrides: {
            ...state.packageWorkerOverrides,
            [empCode]: groupName,
          },
        })),
      clearPackageWorkerOverride: (empCode) =>
        set((state) => {
          const next = { ...state.packageWorkerOverrides };
          delete next[empCode];
          return { packageWorkerOverrides: next };
        }),
      resetPackageWorkerOverrides: () => set({ packageWorkerOverrides: {} }),
      setPackageSupportPlacement: (index, groupName) =>
        set((state) => {
          const next = [...state.packageSupportPlacements];
          while (next.length <= index) next.push("");
          next[index] = groupName;
          return { packageSupportPlacements: next };
        }),
      clearPackageSupportPlacement: (index) =>
        set((state) => {
          const next = [...state.packageSupportPlacements];
          if (index < next.length) next[index] = "";
          return { packageSupportPlacements: next };
        }),
      resetPackageSupportPlacements: () =>
        set({ packageSupportPlacements: [] }),
      addPackageGroupMerge: (groups) =>
        set((state) => {
          // 이미 다른 묶음에 속한 그룹은 그 묶음에서 빼고 새 묶음으로 이동
          const cleaned = state.packageGroupMerges
            .map((m) => m.filter((g) => !groups.includes(g)))
            .filter((m) => m.length >= 2); // 1개만 남으면 묶음 의미 없음
          return {
            packageGroupMerges: [...cleaned, [...groups]],
          };
        }),
      removePackageGroupMerge: (mergeIndex) =>
        set((state) => ({
          packageGroupMerges: state.packageGroupMerges.filter(
            (_, i) => i !== mergeIndex
          ),
        })),
      resetPackageGroupMerges: () => set({ packageGroupMerges: [] }),
      // 포장2라인 액션 (포장1과 동일 패턴)
      setPackage2WorkerOverride: (empCode, groupName) =>
        set((state) => ({
          package2WorkerOverrides: {
            ...state.package2WorkerOverrides,
            [empCode]: groupName,
          },
        })),
      clearPackage2WorkerOverride: (empCode) =>
        set((state) => {
          const next = { ...state.package2WorkerOverrides };
          delete next[empCode];
          return { package2WorkerOverrides: next };
        }),
      resetPackage2WorkerOverrides: () =>
        set({ package2WorkerOverrides: {} }),
      setPackage2SupportPlacement: (index, groupName) =>
        set((state) => {
          const next = [...state.package2SupportPlacements];
          while (next.length <= index) next.push("");
          next[index] = groupName;
          return { package2SupportPlacements: next };
        }),
      clearPackage2SupportPlacement: (index) =>
        set((state) => {
          const next = [...state.package2SupportPlacements];
          if (index < next.length) next[index] = "";
          return { package2SupportPlacements: next };
        }),
      resetPackage2SupportPlacements: () =>
        set({ package2SupportPlacements: [] }),
      addPackage2GroupMerge: (groups) =>
        set((state) => {
          const cleaned = state.package2GroupMerges
            .map((m) => m.filter((g) => !groups.includes(g)))
            .filter((m) => m.length >= 2);
          return { package2GroupMerges: [...cleaned, [...groups]] };
        }),
      removePackage2GroupMerge: (mergeIndex) =>
        set((state) => ({
          package2GroupMerges: state.package2GroupMerges.filter(
            (_, i) => i !== mergeIndex
          ),
        })),
      resetPackage2GroupMerges: () => set({ package2GroupMerges: [] }),
      toggleOvertimeConfirmed: (empCode) =>
        set((state) => {
          const next = new Set(state.overtimeConfirmed);
          if (next.has(empCode)) next.delete(empCode);
          else next.add(empCode);
          return { overtimeConfirmed: Array.from(next) };
        }),
      clearOvertimeConfirmed: () => set({ overtimeConfirmed: [] }),
      setManualPlanOvertime: (basic, confirmed, feederBasic, feederConfirmed) =>
        set({
          manualPlanOvertimeBasic: basic,
          manualPlanOvertimeConfirmed: confirmed,
          manualPlanFeederOvertimeBasic: feederBasic,
          manualPlanFeederOvertimeConfirmed: feederConfirmed,
        }),
      setManualPlanPCMOvertimeConfirmed: (count) =>
        set({ manualPlanPCMOvertimeConfirmed: count }),
      setDohoPlanOvertime: (basic, confirmed, feederBasic, feederConfirmed) =>
        set({
          dohoPlanOvertimeBasic: basic,
          dohoPlanOvertimeConfirmed: confirmed,
          dohoPlanFeederOvertimeBasic: feederBasic,
          dohoPlanFeederOvertimeConfirmed: feederConfirmed,
        }),
      addUploadLog: (entry) =>
        set((state) => ({
          uploadLog: [entry, ...state.uploadLog].slice(0, 50),
        })),
      clearUploadLog: () => set({ uploadLog: [] }),
      clearAllData: () =>
        set({
          selectedCompany: "전체" as Company,
          employees: [],
          loadBar: [],
          loadBarMeta: null,
          packagePosition: [],
          packagePositionMeta: null,
          lineBase: [],
          lineBaseMeta: null,
          paintPlan: [],
          paintPlanMeta: null,
          packageLoad: [],
          packageLoadMeta: null,
          equipment: [],
          workGroups: DEFAULT_WORK_GROUPS,
          workStandardMeta: null,
          equipmentMeta: null,
          attendance: [],
          loadPlan: [],
          urgentProduction: [],
          workDate: "",
          attendanceMeta: null,
          loadPlanMeta: null,
          urgentProductionMeta: null,
          supportAssignments: initialAssignments(),
          supportRedirects: [],
          packageWorkerOverrides: {},
          packageSupportPlacements: [],
          packageGroupMerges: [],
          package2WorkerOverrides: {},
          package2SupportPlacements: [],
          package2GroupMerges: [],
          overtimeConfirmed: [],
          uploadLog: [],
        }),
    }),
    {
      name: "woosung-dashboard-store",
      version: 1,
      // companyChosen / isAdmin / sessionReady 는 localStorage persist 제외.
      // 대신 SessionState 컴포넌트가 sessionStorage 로 탭 단위 관리:
      // - 새 탭/창: 선택화면부터
      // - 같은 탭 내 페이지 이동(풀 리로드 포함): 선택 상태 유지
      partialize: (state) => {
        const {
          companyChosen: _companyChosen,
          isAdmin: _isAdmin,
          sessionReady: _sessionReady,
          ...rest
        } = state;
        void _companyChosen;
        void _isAdmin;
        void _sessionReady;
        return rest;
      },
    }
  )
);
