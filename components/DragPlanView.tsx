"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatHM,
  workTimeToWall,
  MAX_WORKTIME,
  type ReallocResult,
  type ReallocSegment,
} from "@/lib/calc/reallocation";

type ManualTempCell = {
  id: string;
  line: string;
  startWt: number;
  endWt: number;
  workers: string[];
};
import { RealMetricsPanel } from "@/components/RealMetricsPanel";
import { ImprovementSummary } from "@/components/ImprovementSummary";

interface Props {
  result: ReallocResult; // 라인 부하 정보용 (재배치 시뮬 결과 — 라인/부하 메타)
  rBasic: ReallocResult; // 기본 배치 결과 (개선 효과 비교용)
  lineWorkers: Record<string, string[]>; // 출근 시 라인별 작업자
}

// 11 시간 슬롯 (work-time 0..10)
const HOUR_COUNT = MAX_WORKTIME; // 11

// 1명 60% 효율, 2명 100%, 0명 0 — 자동라인은 1명도 100% (페널티 없음)
function ratePerHour(headcount: number, autoManaged = false): number {
  if (headcount <= 0) return 0;
  if (autoManaged) return headcount;
  if (headcount === 1) return 0.6;
  return 2;
}

// 수동 배치 (드래그앤드롭) — 라인별 시간 슬롯에 작업자 직접 배치
export function DragPlanView({ result, rBasic, lineWorkers }: Props) {
  // assignments[workerName] = [line at hour 0, ..., hour HOUR_COUNT-1]
  const initialAssignments = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const [line, workers] of Object.entries(lineWorkers)) {
      for (const w of workers) {
        if (!m[w]) m[w] = Array(HOUR_COUNT).fill(line);
      }
    }
    return m;
  }, [lineWorkers]);

  const [assignments, setAssignments] =
    useState<Record<string, string[]>>(initialAssignments);

  // 확정/잠금 상태 — 확정 시 현재 assignments 를 스냅샷, 다시 누르면 해제
  // 확정된 계획은 localStorage 에 저장되어 새로고침/탭전환 후에도 유지
  // (그날 24:00 전까지 또는 확정해제 후 수정시까지)
  const STORAGE_KEY = "drag-plan-confirmed-v1";
  const [confirmed, setConfirmed] = useState<Record<string, string[]> | null>(
    null
  );
  const [locked, setLocked] = useState(false);
  const [viewingBasic, setViewingBasic] = useState(false);

  // 화면에 표시할 데이터 source — 기본 보기 중이면 출근 위치 그대로
  const displayAssignments = viewingBasic ? initialAssignments : assignments;

  const readOnly = locked || viewingBasic;

  // 임시셀 — 라인을 클릭해서 작업자·시간 구성, 그 시간만큼 부하 처리에 더해줌
  const [tempCells, setTempCells] = useState<ManualTempCell[]>([]);
  const [tempCellModalLine, setTempCellModalLine] = useState<string | null>(
    null
  );

  // 임시셀 라인별 시간당 처리량 (h=0..10)
  const tcContribByLine = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const tc of tempCells) {
      if (!m[tc.line])
        m[tc.line] = Array.from({ length: MAX_WORKTIME }, () => 0);
      const rate =
        tc.workers.length <= 0 ? 0 : tc.workers.length === 1 ? 0.6 : 2;
      for (let h = 0; h < MAX_WORKTIME; h++) {
        const overlap = Math.max(
          0,
          Math.min(h + 1, tc.endWt) - Math.max(h, tc.startWt)
        );
        m[tc.line][h] += overlap * rate;
      }
    }
    return m;
  }, [tempCells]);

  // 임시셀 라인별 총 처리량 (인시)
  const tempCellDoneByLine = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tc of tempCells) {
      const span = Math.max(0, tc.endWt - tc.startWt);
      const rate =
        tc.workers.length <= 0 ? 0 : tc.workers.length === 1 ? 0.6 : 2;
      m[tc.line] = (m[tc.line] ?? 0) + span * rate;
    }
    return m;
  }, [tempCells]);

  // 임시셀 라인별 목록
  const tempCellsByLine = useMemo(() => {
    const m: Record<string, ManualTempCell[]> = {};
    for (const tc of tempCells) {
      if (!m[tc.line]) m[tc.line] = [];
      m[tc.line].push(tc);
    }
    return m;
  }, [tempCells]);

  // 모든 작업자 이름 (임시셀 모달용)
  const allWorkerNames = useMemo(() => {
    const s = new Set<string>();
    for (const ws of Object.values(lineWorkers)) for (const w of ws) s.add(w);
    return Array.from(s).sort();
  }, [lineWorkers]);

  // 워커가 임시셀에 들어가는 시각 lookup — 메인 행에서 그 시간만큼 빠짐 처리용
  const inTempCellLookup = useMemo(() => {
    const m: Record<string, Set<number>> = {};
    for (const tc of tempCells) {
      for (const w of tc.workers) {
        if (!m[w]) m[w] = new Set<number>();
        const startH = Math.floor(tc.startWt);
        const endH = Math.ceil(tc.endWt);
        for (let h = startH; h < endH; h++) m[w].add(h);
      }
    }
    return m;
  }, [tempCells]);

  // 워커별 라인별 OT 셀 카운트 (잔업 짧음 가이드 + auto-drop 둘 다 사용)
  const otCellsOfWorker = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const w of Object.keys(displayAssignments)) {
      const inner: Record<string, number> = {};
      for (let h = 8; h < MAX_WORKTIME; h++) {
        const l = displayAssignments[w]?.[h] ?? "";
        if (l) inner[l] = (inner[l] ?? 0) + 1;
      }
      m[w] = inner;
    }
    return m;
  }, [displayAssignments]);

  // 워커가 excludeLine 이 아닌 다른 라인 OT 에 2칸 이상 있는지
  const isCommittedElsewhere = (worker: string, excludeLine: string) => {
    const inner = otCellsOfWorker[worker] ?? {};
    let count = 0;
    for (const [l, c] of Object.entries(inner)) {
      if (l !== excludeLine) count += c;
    }
    return count >= 2;
  };

  // mount 시 localStorage 에서 확정계획 복원 (만료 안 됐으면)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        assignments: Record<string, string[]>;
        expiresAt: number;
      };
      if (Date.now() >= parsed.expiresAt) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setConfirmed(parsed.assignments);
      setAssignments(parsed.assignments);
      setLocked(true);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 자정에 자동 만료 (페이지 켜둔 채 24:00 넘어가면)
  useEffect(() => {
    if (!confirmed || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const { expiresAt } = JSON.parse(stored) as { expiresAt: number };
      const ms = expiresAt - Date.now();
      if (ms <= 0) {
        setConfirmed(null);
        setLocked(false);
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const handle = window.setTimeout(() => {
        setConfirmed(null);
        setLocked(false);
        window.localStorage.removeItem(STORAGE_KEY);
      }, ms);
      return () => window.clearTimeout(handle);
    } catch {
      // ignore
    }
  }, [confirmed]);

  // 확정해제 + 수정시 localStorage 정리 (잠금 풀린 상태에서 assignments 가 confirmed 와 달라지면)
  useEffect(() => {
    if (locked || !confirmed || typeof window === "undefined") return;
    if (JSON.stringify(assignments) !== JSON.stringify(confirmed)) {
      setConfirmed(null);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [assignments, confirmed, locked]);

  // 입력 순서의 라인 이름 (계산용 — sort 전 단계)
  const lineNames = useMemo(
    () => result.timelines.map((t) => t.name),
    [result.timelines]
  );

  // 라인별·시간별 현재 작업자 (확정 보기 중이면 스냅샷 기준)
  // 임시셀에 들어간 워커는 그 시각 메인 라인에서 제외 (임시셀 sub-row 에 표시됨)
  const cellWorkers = useMemo(() => {
    const m: Record<string, string[][]> = {};
    for (const line of lineNames) {
      m[line] = Array.from({ length: HOUR_COUNT }, () => [] as string[]);
    }
    for (const w of Object.keys(displayAssignments)) {
      const arr = displayAssignments[w];
      for (let h = 0; h < HOUR_COUNT; h++) {
        const line = arr[h];
        if (!line) continue;
        if (inTempCellLookup[w]?.has(h)) continue; // 임시셀 중 — 메인 라인에서 빠짐
        if (!m[line]) m[line] = Array.from({ length: HOUR_COUNT }, () => []);
        m[line][h].push(w);
      }
    }
    return m;
  }, [displayAssignments, lineNames, inTempCellLookup]);

  // 라인 부하 lookup
  const loadByLine = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of result.timelines) m[t.name] = t.loadHours;
    return m;
  }, [result.timelines]);

  // 라인 메타 (urgent, autoManaged) — tracking 보다 먼저 정의해야 함
  const lineMetaEarly = useMemo(() => {
    const m: Record<string, { urgent: boolean; autoManaged: boolean }> = {};
    for (const t of result.timelines) {
      m[t.name] = { urgent: t.urgent, autoManaged: t.autoManaged };
    }
    return m;
  }, [result.timelines]);

  // 라인별 누적 처리 부하 + 완료 시각 계산 (자동라인은 페널티 없음, 임시셀 처리량 가산)
  const tracking = useMemo(() => {
    type LineTrack = {
      byHour: number[];
      completionHour: number | null;
      total: number;
    };
    const out: Record<string, LineTrack> = {};
    for (const line of lineNames) {
      const load = loadByLine[line] ?? 0;
      const isAuto = lineMetaEarly[line]?.autoManaged ?? false;
      let cum = 0;
      let completion: number | null = null;
      const byHour: number[] = [];
      for (let h = 0; h < HOUR_COUNT; h++) {
        const cnt = (cellWorkers[line]?.[h] ?? []).length;
        cum += ratePerHour(cnt, isAuto);
        cum += tcContribByLine[line]?.[h] ?? 0;
        byHour[h] = cum;
        if (completion === null && load > 0.01 && cum >= load - 0.01) {
          completion = h;
        }
      }
      out[line] = { byHour, completionHour: completion, total: cum };
    }
    return out;
  }, [cellWorkers, lineNames, loadByLine, lineMetaEarly, tcContribByLine]);

  // 라인별 부하 영역 — 첫 작업자 배치 시점부터 2명 짝 기준 필요한 셀 수
  // (인원이 10:30부터 이동되면 10:30부터 배경 시작)
  const loadRegion = useMemo(() => {
    const m: Record<string, { start: number; end: number }> = {};
    for (const line of lineNames) {
      const load = loadByLine[line] ?? 0;
      if (load <= 0.01) {
        m[line] = { start: -1, end: -1 };
        continue;
      }
      let firstWorker = -1;
      for (let h = 0; h < HOUR_COUNT; h++) {
        if ((cellWorkers[line]?.[h] ?? []).length > 0) {
          firstWorker = h;
          break;
        }
      }
      const start = firstWorker >= 0 ? firstWorker : 0;
      const span = Math.ceil(load / 2);
      m[line] = { start, end: Math.min(HOUR_COUNT - 1, start + span - 1) };
    }
    return m;
  }, [loadByLine, lineNames, cellWorkers]);

  // 라인별 잔업 시간(셀 수) — 잔업창에서 작업자가 배치된 셀 수
  // (잔업 2시간 이하 = 잔업 셀 ≤ 2개 → 낭비, 빠지거나 다른 라인으로)
  const lineOTCellsUsed = useMemo(() => {
    const m: Record<string, number> = {};
    for (const line of lineNames) {
      let cnt = 0;
      for (let h = 8; h < HOUR_COUNT; h++) {
        if ((cellWorkers[line]?.[h] ?? []).length > 0) cnt++;
      }
      m[line] = cnt;
    }
    return m;
  }, [cellWorkers, lineNames]);

  // 라인 메타 조회용 (lineMetaEarly 위에서 정의됨, 별칭만)
  const lineMeta = lineMetaEarly;

  // 합성 ReallocResult 헬퍼 — assignments 소스를 받아 ReallocResult 생성
  // (수동 배치 / 확정 스냅샷 둘 다에서 재사용)
  const synthesizeResult = (
    src: Record<string, string[]>
  ): ReallocResult => {
    const STANDARD = 8;
    const allWorkersSet = new Set<string>();
    for (const ws of Object.values(lineWorkers))
      for (const w of ws) allWorkersSet.add(w);
    const totalPeople = allWorkersSet.size;

    // src 기준 cellWorkers (임시셀 들어간 워커는 메인 라인에서 제외)
    const cw: Record<string, string[][]> = {};
    for (const line of lineNames)
      cw[line] = Array.from({ length: HOUR_COUNT }, () => [] as string[]);
    for (const w of Object.keys(src)) {
      const arr = src[w];
      for (let h = 0; h < HOUR_COUNT; h++) {
        const line = arr[h];
        if (!line) continue;
        if (inTempCellLookup[w]?.has(h)) continue;
        if (!cw[line]) cw[line] = Array.from({ length: HOUR_COUNT }, () => []);
        cw[line][h].push(w);
      }
    }

    const timelinesOut = lineNames.map((line) => {
      const isAuto = lineMeta[line]?.autoManaged ?? false;
      const load = loadByLine[line] ?? 0;
      const segments: ReallocSegment[] = [];
      let curStart = 0;
      let curHc = (cw[line]?.[0] ?? []).length;
      for (let h = 1; h <= HOUR_COUNT; h++) {
        const hc = h < HOUR_COUNT ? (cw[line]?.[h] ?? []).length : -1;
        if (h === HOUR_COUNT || hc !== curHc) {
          if (curHc > 0) {
            segments.push({ start: curStart, end: h, base: curHc, added: 0 });
          }
          if (h < HOUR_COUNT) {
            curStart = h;
            curHc = hc;
          }
        }
      }
      let cum = 0;
      let finish: number | null = null;
      for (const seg of segments) {
        const segHours = seg.end - seg.start;
        const r = ratePerHour(seg.base + seg.added, isAuto);
        const need = load - cum;
        if (
          finish === null &&
          load > 0.01 &&
          r > 0 &&
          need > 0 &&
          need <= r * segHours + 1e-6
        ) {
          finish = seg.start + need / r;
        }
        cum += r * segHours;
      }
      // 임시셀 처리량 가산 (라인의 done 에 더해 carry 계산)
      cum += tempCellDoneByLine[line] ?? 0;
      const carry = Math.max(0, load - cum);
      return {
        name: line,
        loadHours: load,
        initialHeadcount: (cw[line]?.[0] ?? []).length,
        segments,
        finishTime: finish,
        carryHours: carry,
        urgent: lineMeta[line]?.urgent ?? false,
        autoManaged: isAuto,
      };
    });

    let regularWork = 0;
    let otWork = 0;
    let overtimePeople = 0;
    let otOperationEnd = STANDARD;
    let totalCarry = 0;
    let totalLoad = 0;
    for (const t of timelinesOut) {
      totalCarry += t.carryHours;
      totalLoad += t.loadHours;
    }
    for (const line of lineNames) {
      const isAuto = lineMeta[line]?.autoManaged ?? false;
      let otCells = 0;
      let maxOtHc = 0;
      for (let h = 0; h < HOUR_COUNT; h++) {
        const cnt = (cw[line]?.[h] ?? []).length;
        const r = ratePerHour(cnt, isAuto);
        const tcAtH = tcContribByLine[line]?.[h] ?? 0;
        if (h < STANDARD) {
          regularWork += r + tcAtH;
        } else {
          otWork += r + tcAtH;
          if (cnt > 0) {
            otCells++;
            maxOtHc = Math.max(maxOtHc, cnt);
            otOperationEnd = Math.max(otOperationEnd, h + 1);
          }
        }
      }
      if (otCells >= 2) overtimePeople += maxOtHc;
    }

    const availableLoad = totalPeople * STANDARD;
    const regularIdle = Math.max(0, availableLoad - regularWork);
    const otDuration = Math.max(0, otOperationEnd - STANDARD);
    const otIdle = Math.max(0, overtimePeople * otDuration - otWork);
    const idle = regularIdle + otIdle;

    return {
      startTime: 0,
      standardEnd: STANDARD,
      actualEnd: otOperationEnd,
      hasOvertime: otOperationEnd > STANDARD,
      overtimeHours: otDuration,
      moves: [],
      timelines: timelinesOut,
      totalLoad,
      totalPeople,
      totalCarry,
      availableLoad,
      workHours: regularWork,
      idleHours: idle,
      regularIdleHours: regularIdle,
      overtimeIdleHours: otIdle,
      overtimePeople,
      overtimePersonHours: otWork,
    };
  };

  // 현재 화면 기준 manual result (지표 패널용)
  const manualResult = useMemo<ReallocResult>(
    () => synthesizeResult(displayAssignments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      displayAssignments,
      lineNames,
      lineMeta,
      loadByLine,
      lineWorkers,
      inTempCellLookup,
      tcContribByLine,
      tempCellDoneByLine,
    ]
  );

  // 확정 스냅샷 기준 result (개선 효과 패널 비교용)
  const confirmedResult = useMemo<ReallocResult | null>(
    () => (confirmed ? synthesizeResult(confirmed) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      confirmed,
      lineNames,
      lineMeta,
      loadByLine,
      lineWorkers,
      inTempCellLookup,
      tcContribByLine,
      tempCellDoneByLine,
    ]
  );


  // 시각 atHour 에서 추천 도착 라인 — 우선순위:
  //  1) 긴급(D-1/D-2) 라인 중 2명 미만 (짝 완성 필요)
  //  ★ 홀수 결과 예외: 솔로 다 채우고 남은 인원이 홀수면 빈 라인 보내봐야
  //     새 솔로만 생김 → 차라리 부하 큰 라인 우선 (병목 해소)
  //     ex) 여유 2명 + 솔로 1개 + 빈라인 1개 → 솔로 채우고 1명 남으면 빈라인 가서 또 솔로
  //         차라리 부하 큰 쪽에 2명 같이 보내서 거기를 짝 완성
  //  2) 솔로(1명) 라인 짝 완성
  //  3) 0명 라인 가동 시작
  //  4) 그 외 잔여 부하 큰 라인 (병목)
  // 제외: 자동포장라인 / 완료 라인 / 이미 짝(2명) 라인
  const suggestionAt = (atHour: number, srcLine?: string): string | null => {
    type Cand = {
      line: string;
      hc: number;
      urgent: boolean;
      remaining: number;
    };
    const cands: Cand[] = [];
    for (const l of lineNames) {
      if (l === srcLine) continue; // 자기 자신 제외
      const meta = lineMeta[l];
      if (!meta || meta.autoManaged) continue; // 자동라인 제외
      const load = loadByLine[l] ?? 0;
      if (load <= 0.01) continue;
      const cum = tracking[l]?.byHour[atHour] ?? 0;
      if (cum >= load - 0.01) continue; // 완료 라인 제외
      const hc = (cellWorkers[l]?.[atHour] ?? []).length;
      if (hc >= 2) continue; // 이미 짝(2명) 채워진 라인 제외
      cands.push({
        line: l,
        hc,
        urgent: meta.urgent,
        remaining: load - cum,
      });
    }
    // 1) 긴급 우선 — 무조건 (홀수 예외보다 위)
    const urgentNeed = cands
      .filter((c) => c.urgent)
      .sort((a, b) => a.hc - b.hc || b.remaining - a.remaining);
    if (urgentNeed.length > 0) return urgentNeed[0].line;

    // ★ 홀수 결과 예외 검출
    //   srcCount = srcLine 의 현재 시각 인원수 (이 가이드 셀의 여유 인원수)
    //   leftover = srcCount - nSolo (솔로 다 채우고 남는 인원)
    //   leftover 가 홀수면 빈라인에 1명만 가서 새 솔로 발생 → 부하 큰 라인 우선
    if (srcLine) {
      const srcCount = (cellWorkers[srcLine]?.[atHour] ?? []).length;
      const nSolo = cands.filter((c) => c.hc === 1).length;
      const leftover = srcCount - nSolo;
      if (srcCount >= 1 && leftover > 0 && leftover % 2 === 1) {
        const byLoad = [...cands].sort(
          (a, b) => b.remaining - a.remaining || a.hc - b.hc
        );
        if (byLoad.length > 0) return byLoad[0].line;
      }
    }

    // 2) 솔로 짝 완성
    const solos = cands
      .filter((c) => c.hc === 1)
      .sort((a, b) => b.remaining - a.remaining);
    if (solos.length > 0) return solos[0].line;
    // 3) 0명 라인 가동 시작
    const zeros = cands
      .filter((c) => c.hc === 0)
      .sort((a, b) => b.remaining - a.remaining);
    if (zeros.length > 0) return zeros[0].line;
    // 4) 그 외 잔여 부하 큰 라인
    const rest = cands.sort((a, b) => b.remaining - a.remaining);
    return rest[0]?.line ?? null;
  };

  // 호환: 기존 consumed 사용처를 위해 별칭
  const consumed = useMemo(() => {
    const c: Record<string, number> = {};
    for (const line of lineNames) c[line] = tracking[line]?.total ?? 0;
    return c;
  }, [tracking, lineNames]);

  // 행 정렬: 인원배정필요(0) → 인원여유(1) → 기타(2), 각 그룹 내 이름 오름차순
  // Sticky 정책: 한 번 '인원여유(1)' 로 들어간 라인은 그 라인의 작업자가 모두
  // 빠질 때까지(maxHc=0) 인원여유 그룹에 그대로 머묾.
  //   예: 여유 2명 라인에서 1명 이동 → 남은 1명 있으니 자리 유지
  //       2명 모두 이동 → maxHc=0 → 그제서야 기타 그룹으로 내려감
  const [stickyPriorities, setStickyPriorities] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    const computeIdeal = (line: string): number => {
      const load = loadByLine[line] ?? 0;
      const done = consumed[line] ?? 0;
      const isAuto = lineMeta[line]?.autoManaged ?? false;
      if (isAuto) return 2;
      let maxHc = 0;
      for (let h = 0; h < HOUR_COUNT; h++) {
        maxHc = Math.max(maxHc, (cellWorkers[line]?.[h] ?? []).length);
      }
      if (load > 0.01 && done < load - 0.01 && maxHc < 2) return 0;
      if (maxHc > 0 && (load <= 0.01 || done >= load + 1)) return 1;
      return 2;
    };
    setStickyPriorities((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const line of lineNames) {
        const ideal = computeIdeal(line);
        const prevVal = prev[line];
        let resolved = ideal;
        // 이전이 인원여유(1) 였다면 작업자가 남아있는 한 1 유지
        if (prevVal === 1) {
          let maxHc = 0;
          for (let h = 0; h < HOUR_COUNT; h++) {
            maxHc = Math.max(maxHc, (cellWorkers[line]?.[h] ?? []).length);
          }
          if (maxHc > 0) resolved = 1;
        }
        next[line] = resolved;
        if (resolved !== prevVal) changed = true;
      }
      const prevKeys = Object.keys(prev);
      if (!changed && prevKeys.length === lineNames.length) return prev;
      return next;
    });
  }, [cellWorkers, lineNames, loadByLine, consumed, lineMeta]);

  const displayLines = useMemo(() => {
    return [...lineNames].sort((a, b) => {
      const pa = stickyPriorities[a] ?? 2;
      const pb = stickyPriorities[b] ?? 2;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
  }, [lineNames, stickyPriorities]);

  // 잔업 자동 빠짐 — 확정/보기 중에는 실행하지 않음
  // 빠짐 조건: 잔여부하(carry) < 2인시 (정규시간에 거의 다 끝났음)
  // 유지: 잔여부하 ≥ 2인시 → 잔업할 일이 있음 → 인원 그대로 잔업 진행
  // 예외 (커밋된 잔업 인원):
  //   다른 라인 OT 셀에 2칸 이상 있는 워커는 어차피 잔업하기로 한 사람이므로,
  //   carry < 2 인 라인에 1h 만 잠깐 와있어도 그 1h 잔업 유지.
  //   예) A(h=8,9) 잔업 + 그 후 B(h=10) 1h → B carry < 2 라도 유지
  useEffect(() => {
    if (readOnly) return;
    // 워커별 라인별 OT 셀 카운트 (∑h=8..10)
    const otCellsOfWorker: Record<string, Record<string, number>> = {};
    for (const w of Object.keys(assignments)) {
      const m: Record<string, number> = {};
      for (let h = 8; h < HOUR_COUNT; h++) {
        const l = assignments[w]?.[h] ?? "";
        if (l) m[l] = (m[l] ?? 0) + 1;
      }
      otCellsOfWorker[w] = m;
    }
    const isCommittedElsewhere = (w: string, excludeLine: string): boolean => {
      const m = otCellsOfWorker[w] ?? {};
      let count = 0;
      for (const [l, c] of Object.entries(m)) {
        if (l !== excludeLine) count += c;
      }
      return count >= 2;
    };

    const toClear: { worker: string; hours: number[] }[] = [];
    for (const line of lineNames) {
      const isAuto = lineMeta[line]?.autoManaged ?? false;
      if (isAuto) continue;
      let regularDone = 0;
      for (let h = 0; h < 8; h++) {
        const cnt = (cellWorkers[line]?.[h] ?? []).length;
        regularDone += ratePerHour(cnt, isAuto);
        regularDone += tcContribByLine[line]?.[h] ?? 0;
      }
      const load = loadByLine[line] ?? 0;
      const carry = Math.max(0, load - regularDone);
      let otHc = 0;
      for (let h = 8; h < HOUR_COUNT; h++) {
        otHc = Math.max(otHc, (cellWorkers[line]?.[h] ?? []).length);
      }
      if (otHc === 0) continue;
      if (carry >= 2 - 1e-6) continue;
      for (let h = 8; h < HOUR_COUNT; h++) {
        const ws = cellWorkers[line]?.[h] ?? [];
        for (const w of ws) {
          if (isCommittedElsewhere(w, line)) continue; // 잔업 커밋 인원 유지
          let entry = toClear.find((u) => u.worker === w);
          if (!entry) {
            entry = { worker: w, hours: [] };
            toClear.push(entry);
          }
          entry.hours.push(h);
        }
      }
    }
    if (toClear.length === 0) return;
    setAssignments((prev) => {
      const next = { ...prev };
      for (const { worker, hours } of toClear) {
        const arr = [...(next[worker] ?? Array(HOUR_COUNT).fill(""))];
        for (const h of hours) arr[h] = "";
        next[worker] = arr;
      }
      return next;
    });
  }, [
    cellWorkers,
    lineNames,
    lineMeta,
    loadByLine,
    assignments,
    tcContribByLine,
    readOnly,
  ]);

  // 드래그 핸들러
  const [dragging, setDragging] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, worker: string) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", worker);
    e.dataTransfer.effectAllowed = "move";
    setDragging(worker);
  };

  const handleDragEnd = () => setDragging(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // 드롭: destHour 부터 destLine 으로 propagate
  //   · 같은 oldLine 셀이 이어지는 한 (기존 동작)
  //   · 그리고 그 뒤가 빈 셀이면 같이 채움 (잔업 셀 자동 포함)
  //   예: PA-04 h=2-7 에 있던 워커를 MM-05 로 드래그(h=2) → h=2-7 (PA-04 대체)
  //       + h=8-10 (빈 셀) 도 MM-05 로 → 잔업까지 자동 연결
  //   다른 라인 셀이면 break (사용자가 명시적으로 배치한 곳은 건드리지 않음)
  const handleDrop = (
    e: React.DragEvent,
    destLine: string,
    destHour: number
  ) => {
    e.preventDefault();
    if (readOnly) return;
    const worker = e.dataTransfer.getData("text/plain");
    if (!worker) return;
    setAssignments((prev) => {
      const arr = [...(prev[worker] ?? Array(HOUR_COUNT).fill(""))];
      const oldLine = arr[destHour] ?? "";
      if (oldLine === destLine) return prev;
      for (let h = destHour; h < HOUR_COUNT; h++) {
        if (arr[h] === oldLine || arr[h] === "") arr[h] = destLine;
        else break;
      }
      return { ...prev, [worker]: arr };
    });
  };

  // 초기화 — sticky / 임시셀 도 리셋
  const handleReset = () => {
    if (readOnly) return;
    setAssignments(initialAssignments);
    setStickyPriorities({});
    setTempCells([]);
  };

  // 확정 토글 — 잠금이 풀려있으면 현재 assignments 를 스냅샷+잠금, 잠금이면 해제
  // 확정시 localStorage 에 저장 (그날 24:00 만료)
  const handleConfirmToggle = () => {
    if (locked) {
      setLocked(false);
      return;
    }
    const snap = JSON.parse(JSON.stringify(assignments)) as Record<
      string,
      string[]
    >;
    setConfirmed(snap);
    setLocked(true);
    if (typeof window !== "undefined") {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ assignments: snap, expiresAt: end.getTime() })
      );
    }
  };

  // 기본 배치 보기 토글 — 모드 전환 시 sticky 정렬 리셋
  const handleViewBasicToggle = () => {
    setViewingBasic((v) => !v);
    setStickyPriorities({});
  };

  // 화면 표시용 라인 이름 (자동포장라인 → 자동포장)
  const displayName = (line: string) =>
    line === "자동포장라인" ? "자동포장" : line;

  // 시간 슬롯 — 근무 셀과 휴게(점심·저녁) 셀이 섞여 있는 시간축
  type Slot =
    | { type: "work"; wt: number; wallStart: number; wallEnd: number; isOT: boolean; isFirstOT: boolean }
    | { type: "break"; label: string; wallStart: number; wallEnd: number };
  const slots: Slot[] = [
    { type: "work", wt: 0, wallStart: 8.5, wallEnd: 9.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 1, wallStart: 9.5, wallEnd: 10.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 2, wallStart: 10.5, wallEnd: 11.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 3, wallStart: 11.5, wallEnd: 12.5, isOT: false, isFirstOT: false },
    { type: "break", label: "점심", wallStart: 12.5, wallEnd: 13.5 },
    { type: "work", wt: 4, wallStart: 13.5, wallEnd: 14.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 5, wallStart: 14.5, wallEnd: 15.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 6, wallStart: 15.5, wallEnd: 16.5, isOT: false, isFirstOT: false },
    { type: "work", wt: 7, wallStart: 16.5, wallEnd: 17.5, isOT: false, isFirstOT: false },
    { type: "break", label: "저녁", wallStart: 17.5, wallEnd: 18.0 },
    { type: "work", wt: 8, wallStart: 18.0, wallEnd: 19.0, isOT: true, isFirstOT: true },
    { type: "work", wt: 9, wallStart: 19.0, wallEnd: 20.0, isOT: true, isFirstOT: false },
    { type: "work", wt: 10, wallStart: 20.0, wallEnd: 21.0, isOT: true, isFirstOT: false },
  ];

  return (
    <>
      {/* 개선 효과 패널 — '기본 배치' vs '확정된 배치' 비교 */}
      {confirmedResult ? (
        <ImprovementSummary rBasic={rBasic} rReal={confirmedResult} />
      ) : (
        <div className="card border-amber-200 bg-amber-50/40">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-1">
            <span className="text-amber-700">⚠</span>
            재배치 개선 효과 — 확정 후 비교
          </h2>
          <p className="text-xs text-slate-600">
            수동 배치를 마친 뒤 <b>[확정]</b> 버튼을 누르면 기본 배치와
            확정된 배치를 비교한 개선 효과가 여기에 표시됩니다.
          </p>
        </div>
      )}
      {/* 현재 화면 기준 실시간 지표 */}
      <RealMetricsPanel
        result={manualResult}
        title="수동 배치 결과 지표"
      />
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900">
          수동 배치 (드래그앤드롭)
          <span className="ml-2 text-xs font-normal text-slate-500">
            {viewingBasic
              ? "기본 배치 보는 중 (이동 없음, 읽기 전용)"
              : locked
                ? "확정 — 잠금 상태 (편집 불가, 새로고침해도 24:00까지 유지)"
                : "작업자 칩을 다른 라인·시간으로 드래그해서 직접 배치"}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={readOnly}
            className="text-xs px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            출근 위치로 초기화
          </button>
          <button
            type="button"
            onClick={handleConfirmToggle}
            disabled={viewingBasic}
            className={cn(
              "text-xs px-3 py-1.5 font-semibold rounded disabled:opacity-40 disabled:cursor-not-allowed",
              locked
                ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300"
                : "bg-blue-600 hover:bg-blue-700 text-white border border-blue-600"
            )}
            title={
              locked
                ? "다시 누르면 잠금 해제 (수정 시까지 24:00까지 유지)"
                : "현재 배치를 확정 (잠금, 새로고침 후에도 유지)"
            }
          >
            {locked ? "확정 해제" : "확정"}
          </button>
          <button
            type="button"
            onClick={handleViewBasicToggle}
            className={cn(
              "text-xs px-3 py-1.5 rounded border",
              viewingBasic
                ? "bg-sky-100 border-sky-300 text-sky-800 hover:bg-sky-200"
                : "border-slate-300 hover:bg-slate-50"
            )}
            title={
              viewingBasic
                ? "현재 작업 계획으로 돌아가기"
                : "이동 없는 출근 위치 그대로의 배치 보기"
            }
          >
            {viewingBasic ? "현재 계획 보기" : "기본 배치 보기"}
          </button>
        </div>
      </div>

      <div>
        <table className="text-xs border-collapse w-full table-fixed">
          <thead>
            <tr>
              <th className="bg-white border-b border-slate-200 pl-1 pr-0 py-1 text-left font-semibold text-slate-600 w-[4.5rem]">
                라인
              </th>
              <th className="border-b border-slate-200 px-0 py-1 text-center font-semibold text-slate-600 w-[5rem]">
                인원 상태
              </th>
              <th className="border-b border-slate-200 px-1 py-1 text-center font-semibold text-slate-600 w-[4rem]">
                처리/부하
              </th>
              {slots.map((s, idx) => {
                if (s.type === "break") {
                  return (
                    <th
                      key={`brk-${idx}`}
                      className="border-b border-slate-300 px-0 py-1 text-center w-[1.6rem] bg-slate-200/60"
                    >
                      <div className="text-[9px] font-semibold text-slate-600">
                        {s.label}
                      </div>
                    </th>
                  );
                }
                return (
                  <th
                    key={`w-${s.wt}`}
                    className={cn(
                      "border-b border-slate-200 px-0 py-1 text-center w-[4rem]",
                      s.isOT && "bg-rose-50/40",
                      s.isFirstOT && "border-l-4 border-l-rose-500"
                    )}
                  >
                    <div className="text-[10px] font-medium text-slate-700 leading-tight">
                      {formatHM(s.wallStart)}
                      <br />~{formatHM(s.wallEnd)}
                    </div>
                    {s.isFirstOT && (
                      <div className="text-[9px] text-rose-600 font-bold mt-0.5">
                        잔업 시작
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayLines.map((line) => {
              const load = loadByLine[line] ?? 0;
              const done = consumed[line] ?? 0;
              const isAuto = result.timelines.find((t) => t.name === line)
                ?.autoManaged;
              const tooltipState =
                load <= 0.01
                  ? "부하 없음"
                  : done >= load - 0.01
                    ? `완료 (여유 ${(done - load).toFixed(1)})`
                    : `이월 ${(load - done).toFixed(1)}인시`;
              // 부하 영역 내 최대 hc (이미 2명 짝 차있는지 판단용)
              let maxHcInLoad = 0;
              for (let h = 0; h < HOUR_COUNT; h++) {
                maxHcInLoad = Math.max(
                  maxHcInLoad,
                  (cellWorkers[line]?.[h] ?? []).length
                );
              }
              type StatusBadge = {
                text: string;
                tone: "rose" | "amber" | "slate";
                title: string;
              };
              let statusBadge: StatusBadge | null = null;
              if (!isAuto) {
                if (
                  load > 0.01 &&
                  done < load - 0.01 &&
                  maxHcInLoad < 2
                ) {
                  // 부족 + 짝 미완성만 → 인원배정필요 (2명 짝 차있으면 배지 미표시)
                  statusBadge = {
                    text: "인원배정필요",
                    tone: "rose",
                    title: `부하 ${load.toFixed(1)}인시 중 ${done.toFixed(1)}인시 처리 — 추가 ${(load - done).toFixed(1)}인시 필요`,
                  };
                } else if (
                  maxHcInLoad > 0 &&
                  (load <= 0.01 || done >= load + 1)
                ) {
                  statusBadge = {
                    text: "인원여유",
                    tone: "slate",
                    title:
                      load <= 0.01
                        ? `이 라인에 부하 없음 (${maxHcInLoad}명 배치됨)`
                        : `부하 ${load.toFixed(1)}인시 대비 ${done.toFixed(1)}인시 처리 — ${(done - load).toFixed(1)}인시 여유`,
                  };
                }
              }
              return (
                <tr key={line}>
                  <th
                    onClick={() =>
                      !readOnly && !isAuto && setTempCellModalLine(line)
                    }
                    className={cn(
                      "sticky left-0 bg-white border-b border-slate-100 pl-2 pr-1 py-1 text-left font-medium text-slate-700",
                      !readOnly && !isAuto && "cursor-pointer hover:bg-slate-50"
                    )}
                    title={
                      readOnly || isAuto
                        ? undefined
                        : "클릭해서 임시셀 구성"
                    }
                  >
                    <div className="truncate text-xs">
                      {result.timelines.find((t) => t.name === line)?.urgent &&
                        "● "}
                      {displayName(line)}
                    </div>
                    {tempCellsByLine[line]?.length > 0 && (
                      <div className="text-[9px] text-purple-700 font-semibold leading-tight whitespace-nowrap">
                        +임시 {(tempCellDoneByLine[line] ?? 0).toFixed(1)}인시
                      </div>
                    )}
                  </th>
                  <td className="border-b border-slate-100 pl-0 pr-1 py-1 text-center align-middle">
                    {statusBadge ? (
                      <span
                        className={cn(
                          "inline-block text-[10px] font-bold border px-1.5 py-0.5 rounded whitespace-nowrap",
                          statusBadge.tone === "rose"
                            ? "text-rose-700 bg-rose-100 border-rose-300"
                            : statusBadge.tone === "amber"
                              ? "text-amber-800 bg-amber-100 border-amber-400"
                              : "text-slate-600 bg-slate-100 border-slate-300"
                        )}
                        title={statusBadge.title}
                      >
                        {statusBadge.text}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-1 text-center text-[11px]">
                    {load > 0.01 ? (
                      <>
                        <div
                          className={cn(
                            "font-bold",
                            done >= load - 0.01
                              ? "text-emerald-700"
                              : "text-amber-700"
                          )}
                          title={tooltipState}
                        >
                          {done.toFixed(1)} / {load.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-slate-400">인시</div>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  {slots.map((s, idx) => {
                    if (s.type === "break") {
                      return (
                        <td
                          key={`brk-${idx}`}
                          className="border border-slate-300 bg-slate-200/40 w-[1.6rem]"
                          title={`${s.label} 휴게 ${formatHM(s.wallStart)}~${formatHM(s.wallEnd)}`}
                        />
                      );
                    }
                    const workers = cellWorkers[line]?.[s.wt] ?? [];
                    const tr = tracking[line];
                    const region = loadRegion[line];
                    const completion = tr?.completionHour ?? null;
                    const inLoadRegion =
                      region !== undefined &&
                      region.start >= 0 &&
                      s.wt >= region.start &&
                      s.wt <= region.end;
                    const isComplete = completion === s.wt;
                    const lineLoad = loadByLine[line] ?? 0;

                    // === 낭비(이동 가이드) 케이스 판단 ===
                    let wasteReason:
                      | "noload"
                      | "excess"
                      | "wasteOT"
                      | null = null;
                    if (workers.length > 0) {
                      if (lineLoad <= 0.01) {
                        // 부하 자체가 없는데 사람 있음 (PA-06 케이스)
                        wasteReason = "noload";
                      } else if (
                        completion !== null &&
                        s.wt > completion
                      ) {
                        // 작업 완료 후 여유
                        wasteReason = "excess";
                      } else if (
                        s.isOT &&
                        (lineOTCellsUsed[line] ?? 0) > 0 &&
                        (lineOTCellsUsed[line] ?? 0) <= 2
                      ) {
                        // 잔업이 2시간 이하 → 빠지거나 이동
                        // 단, 이 셀의 모든 워커가 다른 라인 OT 에 커밋돼있으면
                        // (= 이미 잔업하기로 한 인원) 짧음 표시 안함
                        const allCommitted = workers.every((w) =>
                          isCommittedElsewhere(w, line)
                        );
                        if (!allCommitted) {
                          wasteReason = "wasteOT";
                        }
                      }
                    }
                    const wasteful = wasteReason !== null;
                    const suggested = wasteful ? suggestionAt(s.wt, line) : null;
                    return (
                      <td
                        key={`w-${s.wt}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, line, s.wt)}
                        className={cn(
                          "border border-slate-200 p-0.5 align-top h-14 relative",
                          s.isFirstOT && "border-l-4 border-l-rose-500",
                          s.isOT && "bg-rose-50/20",
                          // 부하 영역 배경 (완료 셀도 같은 배경 유지)
                          (inLoadRegion || isComplete) &&
                            !wasteful &&
                            "bg-blue-200/50",
                          // 완료 셀: 같은 배경 + emerald 테두리만 강조
                          isComplete &&
                            !wasteful &&
                            "border-2 border-emerald-500",
                          // 낭비/이동 가이드 셀
                          wasteful && "border-2 border-amber-400 bg-amber-50"
                        )}
                        title={`${formatHM(s.wallStart)}~${formatHM(s.wallEnd)} ${s.isOT ? "(잔업)" : ""}`}
                      >
                        <div className="flex flex-wrap gap-0.5">
                          {workers.map((w) => (
                            <div
                              key={w}
                              draggable={!readOnly}
                              onDragStart={(e) => handleDragStart(e, w)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap",
                                readOnly ? "cursor-default" : "cursor-move",
                                workers.length >= 2
                                  ? "bg-blue-500 text-white"
                                  : "bg-yellow-200 border border-yellow-400 text-slate-800",
                                dragging === w &&
                                  "ring-2 ring-orange-500 opacity-50"
                              )}
                              title={
                                readOnly
                                  ? w
                                  : `${w} — 드래그해서 다른 라인·시간으로 이동`
                              }
                            >
                              {w}
                            </div>
                          ))}
                        </div>
                        {/* 완료 표시 (낭비 아닌 경우만) */}
                        {isComplete && !wasteful && (
                          <div className="absolute bottom-0 right-0.5 text-[10px] font-extrabold text-emerald-900 leading-none">
                            ✓ 완료
                          </div>
                        )}
                        {/* 이동 가이드 */}
                        {wasteful && (
                          <div className="absolute bottom-0 left-0 right-0 text-[9px] leading-tight px-0.5">
                            <div className="text-amber-700 font-bold whitespace-nowrap">
                              {wasteReason === "noload"
                                ? `부하 없음 (${workers.length}명)`
                                : wasteReason === "wasteOT"
                                  ? `잔업 ${lineOTCellsUsed[line]}h 짧음`
                                  : `여유 ${workers.length}명`}
                            </div>
                            {suggested ? (
                              <div className="text-blue-700 whitespace-nowrap">
                                → {suggested}
                              </div>
                            ) : (
                              <div className="text-slate-500 whitespace-nowrap">
                                → 빠지기
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
            .reduce<React.ReactNode[]>((acc, node, idx) => {
              acc.push(node);
              const line = displayLines[idx];
              const cells = tempCellsByLine[line] ?? [];
              for (const tc of cells) {
                const tcSpan = Math.max(0, tc.endWt - tc.startWt);
                const tcRate =
                  tc.workers.length <= 0
                    ? 0
                    : tc.workers.length === 1
                      ? 0.6
                      : 2;
                const tcProcessed = tcSpan * tcRate;
                acc.push(
                  <tr
                    key={`${line}-tc-${tc.id}`}
                    className="bg-purple-50/40"
                  >
                    <th className="sticky left-0 bg-purple-50/40 border-b border-slate-200 pl-2 pr-1 py-1 text-left">
                      <div className="text-[9px] text-purple-700 font-semibold truncate">
                        ↳ 임시셀
                      </div>
                    </th>
                    <td className="border-b border-slate-200 px-0 py-1 text-center text-[9px] text-purple-700">
                      {tc.workers.length}명
                    </td>
                    <td className="border-b border-slate-200 px-1 py-1 text-center text-[10px] text-purple-800 font-semibold">
                      {tcProcessed.toFixed(1)}
                    </td>
                    {slots.map((s, sIdx) => {
                      if (s.type === "break") {
                        return (
                          <td
                            key={`tc-${tc.id}-brk-${sIdx}`}
                            className="border-b border-slate-200 bg-slate-200/30"
                          />
                        );
                      }
                      const inCell =
                        s.wt >= tc.startWt && s.wt < tc.endWt;
                      return (
                        <td
                          key={`tc-${tc.id}-w-${s.wt}`}
                          className={cn(
                            "border-b border-slate-200 px-0 py-0.5 text-center align-middle",
                            inCell && "bg-purple-100/60"
                          )}
                        >
                          {inCell && tc.workers.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 justify-center px-0.5">
                              {tc.workers.map((w) => (
                                <div
                                  key={w}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 border-2 border-dashed border-purple-500 text-purple-800 whitespace-nowrap"
                                  title={`임시셀 — ${w}`}
                                >
                                  {w}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              }
              return acc;
            }, [])}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500 inline-block" />
          짝(2명)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-400 inline-block" />
          솔로(1명·60%)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-200/50 border border-slate-300 inline-block" />
          부하 영역 (작업 필요 시간)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[10px] font-extrabold text-emerald-900">
            ✓ 완료
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-50 border-2 border-amber-400 inline-block" />
          여유 (인원이동 가이드 표시)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-purple-100 border-2 border-dashed border-purple-500 inline-block" />
          임시셀 (라인 클릭으로 구성)
        </span>
        <span className="w-full" />
        <span>· 드래그로 작업자 이동 · 드롭 시 그 시각부터 같은 라인이 이어지는 한 자동 전파</span>
        <span>· 라인 라벨 클릭해서 임시셀 구성</span>
      </div>
    </div>
    {/* 임시셀 구성 모달 */}
    {tempCellModalLine && (
      <TempCellModal
        line={tempCellModalLine}
        displayName={displayName(tempCellModalLine)}
        allWorkers={allWorkerNames}
        existing={tempCellsByLine[tempCellModalLine] ?? []}
        onAdd={(tc) => setTempCells((prev) => [...prev, tc])}
        onRemove={(id) =>
          setTempCells((prev) => prev.filter((t) => t.id !== id))
        }
        onClose={() => setTempCellModalLine(null)}
      />
    )}
    </>
  );
}

// 임시셀 구성 모달 — 라인을 누르면 열리고 작업자·시간 선택해서 부하 처리에 더함
function TempCellModal({
  line,
  displayName,
  allWorkers,
  existing,
  onAdd,
  onRemove,
  onClose,
}: {
  line: string;
  displayName: string;
  allWorkers: string[];
  existing: ManualTempCell[];
  onAdd: (tc: ManualTempCell) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [startWt, setStartWt] = useState(8);
  const [endWt, setEndWt] = useState(11);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);

  const span = Math.max(0, endWt - startWt);
  const rate =
    selectedWorkers.length <= 0
      ? 0
      : selectedWorkers.length === 1
        ? 0.6
        : 2;
  const processed = span * rate;

  const toggleWorker = (w: string) => {
    setSelectedWorkers((prev) =>
      prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]
    );
  };

  const handleAdd = () => {
    if (selectedWorkers.length === 0 || span <= 0) return;
    onAdd({
      id: `tc-${line}-${startWt}-${endWt}-${selectedWorkers.join("_")}-${existing.length}`,
      line,
      startWt,
      endWt,
      workers: [...selectedWorkers],
    });
    setSelectedWorkers([]);
  };

  // 시작 시각 옵션 — wt=4, 8 은 휴게 직후(=다음 작업 시작) 시각으로 표시
  //   · wt=4 → 13:30 (점심 후 시작), wt=8 → 18:00 (저녁 후 잔업 시작)
  const startOptions: { wt: number; label: string }[] = [];
  for (let t = 0; t < MAX_WORKTIME; t++) {
    let wall = workTimeToWall(t);
    if (t === 4) wall = 13.5;
    if (t === 8) wall = 18.0;
    startOptions.push({ wt: t, label: formatHM(wall) });
  }
  // 종료 시각 옵션 — 휴게 직전(=직전 작업 종료) 시각 그대로
  //   · wt=4 → 12:30 (점심 직전 종료), wt=8 → 17:30 (저녁 직전 종료)
  const endOptions: { wt: number; label: string }[] = [];
  for (let t = 1; t <= MAX_WORKTIME; t++) {
    endOptions.push({ wt: t, label: formatHM(workTimeToWall(t)) });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-5 max-w-xl w-full m-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-slate-900">
            {displayName} — 임시셀 구성
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
            title="닫기"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          작업자와 시간을 선택하면 그 시간만큼 해당 라인의 부하가 처리됩니다.
        </p>

        {/* 새 임시셀 추가 */}
        <div className="border border-slate-200 rounded p-3 mb-3 bg-slate-50/50">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-xs">
              <span className="text-slate-500 block mb-1">시작 시각</span>
              <select
                value={startWt}
                onChange={(e) => setStartWt(Number(e.target.value))}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1"
              >
                {startOptions.map((o) => (
                  <option key={o.wt} value={o.wt}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-slate-500 block mb-1">종료 시각</span>
              <select
                value={endWt}
                onChange={(e) => setEndWt(Number(e.target.value))}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1"
              >
                {endOptions
                  .filter((o) => o.wt > startWt)
                  .map((o) => (
                    <option key={o.wt} value={o.wt}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="mb-3">
            <div className="text-xs text-slate-500 mb-1">
              작업자 (여러명 가능)
            </div>
            <div className="flex flex-wrap gap-1">
              {allWorkers.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => toggleWorker(w)}
                  className={cn(
                    "text-xs px-2 py-1 rounded border font-medium",
                    selectedWorkers.includes(w)
                      ? "bg-purple-500 text-white border-purple-500"
                      : "border-slate-300 hover:bg-slate-50 text-slate-700"
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-600">
              {span}h × {selectedWorkers.length}명 →{" "}
              <b className="text-emerald-700">{processed.toFixed(1)}인시</b>
              {selectedWorkers.length === 1 && " (1인 60%)"}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={selectedWorkers.length === 0 || span <= 0}
              className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              임시셀 추가
            </button>
          </div>
        </div>

        {/* 기존 임시셀 목록 */}
        {existing.length > 0 ? (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">
              현재 임시셀 ({existing.length}개)
            </h4>
            <ul className="space-y-1">
              {existing.map((tc) => {
                const tcSpan = Math.max(0, tc.endWt - tc.startWt);
                const tcRate =
                  tc.workers.length <= 0
                    ? 0
                    : tc.workers.length === 1
                      ? 0.6
                      : 2;
                const tcProcessed = tcSpan * tcRate;
                return (
                  <li
                    key={tc.id}
                    className="flex justify-between items-center bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5"
                  >
                    <div className="text-xs text-slate-700">
                      <b>{formatHM(workTimeToWall(tc.startWt))}</b>~
                      <b>{formatHM(workTimeToWall(tc.endWt))}</b>
                      <span className="text-slate-500"> · </span>
                      {tc.workers.join(", ")}
                      <span className="text-slate-500"> · </span>
                      <span className="text-emerald-700 font-semibold">
                        {tcProcessed.toFixed(1)}인시
                      </span>
                    </div>
                    <button
                      onClick={() => onRemove(tc.id)}
                      className="text-slate-400 hover:text-rose-600 text-sm"
                      title="삭제"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-2">
            등록된 임시셀이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
