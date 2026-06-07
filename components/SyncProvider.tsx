"use client";

import { useEffect, useRef, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { getDb, getAuthInstance, isFirebaseConfigured } from "@/lib/firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";

// Firestore 단일 문서 (state/main) 에 store 데이터를 통째로 저장.
// 변경 시 onSnapshot 으로 모든 클라이언트에 즉시 반영.
const STATE_DOC_PATH = ["state", "main"] as const;

const SYNCED_KEYS = [
  "employees",
  "equipment",
  "workGroups",
  "loadBar",
  "packagePosition",
  "lineBase",
  "workStandardMeta",
  "equipmentMeta",
  "loadBarMeta",
  "packagePositionMeta",
  "lineBaseMeta",
  "attendance",
  "loadPlan",
  "paintPlan",
  "packageLoad",
  "urgentProduction",
  "workDate",
  "attendanceMeta",
  "loadPlanMeta",
  "paintPlanMeta",
  "packageLoadMeta",
  "urgentProductionMeta",
  "supportAssignments",
  "supportRedirects",
  "packageWorkerOverrides",
  "packageSupportPlacements",
  "packageGroupMerges",
  "package2WorkerOverrides",
  "package2SupportPlacements",
  "package2GroupMerges",
  "overtimeConfirmed",
  "manualPlanOvertimeBasic",
  "manualPlanOvertimeConfirmed",
  "manualPlanFeederOvertimeBasic",
  "manualPlanFeederOvertimeConfirmed",
  "uploadLog",
] as const;

function pickSynced(state: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_KEYS) {
    if (k in state) out[k] = (state as any)[k];
  }
  return out;
}

function shallowEqualSynced(
  a: Record<string, unknown>,
  b: Record<string, unknown>
) {
  for (const k of SYNCED_KEYS) {
    if ((a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
}

// Firestore 가 undefined 값을 거부하므로 null 로 치환.
function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeForFirestore(v);
    }
    return out;
  }
  return value;
}

// "비어있다"로 간주되는 값 — 이런 값으로 로컬의 의미있는 값을 덮어쓰지 않음
function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === "object" && v !== null && Object.keys(v as object).length === 0)
    return true;
  return false;
}

// 업로드 자료(data) ↔ 메타(meta) 쌍. meta.uploadedAt 시각으로 newer 쪽 우선.
const META_PAIRS: { data: string; meta: string }[] = [
  { data: "employees", meta: "workStandardMeta" },
  { data: "equipment", meta: "equipmentMeta" },
  { data: "loadBar", meta: "loadBarMeta" },
  { data: "packagePosition", meta: "packagePositionMeta" },
  { data: "lineBase", meta: "lineBaseMeta" },
  { data: "attendance", meta: "attendanceMeta" },
  { data: "loadPlan", meta: "loadPlanMeta" },
  { data: "paintPlan", meta: "paintPlanMeta" },
  { data: "packageLoad", meta: "packageLoadMeta" },
  { data: "urgentProduction", meta: "urgentProductionMeta" },
];

// setState 에 undefined 가 들어가면 store 의 기존 값이 undefined 로 덮여 컴포넌트가
// 터질 수 있음 → 항상 undefined 키 제거 후 setState.
function stripUndefined(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function getMetaTime(meta: unknown): number {
  if (!meta || typeof meta !== "object") return 0;
  const at = (meta as { uploadedAt?: string }).uploadedAt;
  if (!at) return 0;
  const t = new Date(at).getTime();
  return Number.isFinite(t) ? t : 0;
}

// 원격(Firestore) ← 로컬 병합.
// 1) data+meta 쌍은 meta.uploadedAt 비교 → newer 쪽 채택
// 2) workDate 는 attendanceMeta 와 같은 쪽
// 3) 그 외 필드: 원격이 비어있고 로컬에 있으면 로컬 보존 (멀티유저 동기화 손실 방지)
function mergePreserveLocal(
  remote: Record<string, unknown>,
  local: Record<string, unknown>
): { merged: Record<string, unknown>; preservedFromLocal: boolean } {
  const merged: Record<string, unknown> = {};
  let preservedFromLocal = false;

  // 1. 모든 필드를 원격 → 로컬 순으로 채우기.
  //    원격에 undefined 면 로컬 값으로 폴백 (undefined 가 setState 되어 컴포넌트 터지는 것 방지)
  for (const k of SYNCED_KEYS) {
    const r = (remote as any)[k];
    if (r !== undefined) {
      merged[k] = r;
    } else {
      merged[k] = (local as any)[k];
      if ((local as any)[k] !== undefined) preservedFromLocal = true;
    }
  }

  // 2. data+meta 쌍은 uploadedAt 비교
  for (const { data, meta } of META_PAIRS) {
    const localTime = getMetaTime((local as any)[meta]);
    const remoteTime = getMetaTime((remote as any)[meta]);
    if (localTime > remoteTime) {
      const ld = (local as any)[data];
      const lm = (local as any)[meta];
      if (ld !== undefined) merged[data] = ld;
      if (lm !== undefined) merged[meta] = lm;
      preservedFromLocal = true;
    }
  }

  // 3. workDate 는 attendanceMeta 따라가기
  {
    const localTime = getMetaTime((local as any).attendanceMeta);
    const remoteTime = getMetaTime((remote as any).attendanceMeta);
    const lwd = (local as any).workDate;
    if (localTime > remoteTime && lwd !== undefined) {
      merged.workDate = lwd;
    }
  }

  // 4. 그 외 필드 — 결과가 비어있고 로컬에 있으면 로컬 보존
  for (const k of SYNCED_KEYS) {
    if (isEmptyValue(merged[k]) && !isEmptyValue((local as any)[k])) {
      merged[k] = (local as any)[k];
      preservedFromLocal = true;
    }
  }

  return { merged, preservedFromLocal };
}

// 동기화 상태 — 우상단 작은 배지로 노출
type SyncStatus =
  | { kind: "init" }
  | { kind: "auth-waiting" }
  | { kind: "auth-failed"; reason: string }
  | { kind: "ok" }
  | { kind: "writing" }
  | { kind: "write-failed"; reason: string }
  | { kind: "no-config" };

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [, setHydrated] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ kind: "init" });
  const [authReady, setAuthReady] = useState(false);
  const lastWriteRef = useRef<string>("");
  const ignoreNextRemoteRef = useRef<boolean>(false);
  const localPendingRef = useRef<boolean>(false);

  // 0) 익명 인증 — Firestore 규칙(request.auth != null) 통과용
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setStatus({ kind: "no-config" });
      setHydrated(true);
      setAuthReady(true);
      return;
    }
    setStatus({ kind: "auth-waiting" });
    const auth = getAuthInstance();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthReady(true);
        setStatus({ kind: "ok" });
      } else {
        // 미로그인이면 익명 로그인 시도
        signInAnonymously(auth).catch((e) => {
          const code = (e as { code?: string })?.code ?? String(e);
          console.error("[SyncProvider] anonymous sign-in failed", e);
          setStatus({
            kind: "auth-failed",
            reason:
              code === "auth/operation-not-allowed"
                ? "Firebase 콘솔에서 익명 인증을 활성화 해주세요 (Auth → Sign-in method → Anonymous)"
                : code,
          });
          setHydrated(true);
          setAuthReady(false);
        });
      }
    });
    return () => unsub();
  }, []);

  // 1) Firestore 실시간 구독
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      console.warn(
        "[SyncProvider] Firebase 설정이 없습니다. localStorage 만 사용합니다."
      );
      setHydrated(true);
      return;
    }
    if (!authReady) return; // 인증 완료 후 구독

    const db = getDb();
    const ref = doc(db, ...STATE_DOC_PATH);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          // 첫 사용자 — 현재 localStorage 상태를 푸시
          const cur = pickSynced(
            useDataStore.getState() as unknown as Record<string, unknown>
          );
          if (
            Object.values(cur).some(
              (v) => Array.isArray(v) && (v as unknown[]).length > 0
            )
          ) {
            void setDoc(ref, {
              ...(sanitizeForFirestore(cur) as Record<string, unknown>),
              _updatedAt: serverTimestamp(),
            }).catch((e) => console.warn("[SyncProvider] initial push", e));
            lastWriteRef.current = JSON.stringify(cur);
          }
          setHydrated(true);
          return;
        }

        // 로컬 변경이 디바운스/전송 진행 중이면 원격 snapshot 검사:
        // - 우리 자신의 write 가 돌아왔으면 ack 처리 (pending 해제)
        // - 그 외 stale snapshot 은 무시
        const data = snap.data();
        const synced = pickSynced(data);
        const remoteBody = JSON.stringify(synced);

        if (localPendingRef.current) {
          if (remoteBody === lastWriteRef.current) {
            localPendingRef.current = false;
            setHydrated(true);
          }
          // 다른 stale snapshot 은 무시
          return;
        }

        // 비어있는 원격 값으로 로컬 의미있는 값을 덮어쓰지 않기
        const local = useDataStore.getState() as unknown as Record<
          string,
          unknown
        >;
        const { merged, preservedFromLocal } = mergePreserveLocal(synced, local);
        const body = JSON.stringify(merged);

        if (body === lastWriteRef.current) {
          setHydrated(true);
          return;
        }

        ignoreNextRemoteRef.current = true;
        useDataStore.setState(stripUndefined(merged) as never, false);
        lastWriteRef.current = body;
        setHydrated(true);

        // 원격이 비어있어 로컬을 보존했다면, 그 값을 Firestore 에 다시 push
        // (다음 사용자도 동일 데이터 보게 함)
        if (preservedFromLocal) {
          void setDoc(ref, {
            ...(sanitizeForFirestore(merged) as Record<string, unknown>),
            _updatedAt: serverTimestamp(),
          }).catch((e) =>
            console.warn("[SyncProvider] preserve-local push", e)
          );
        }
      },
      (err) => {
        console.warn("[SyncProvider] onSnapshot 에러", err);
        setHydrated(true);
      }
    );
    return () => unsub();
  }, [authReady]);

  // 2) store 변경 → Firestore 쓰기 (디바운스)
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (!authReady) return;
    const db = getDb();
    const ref = doc(db, ...STATE_DOC_PATH);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let inflight = false;
    let pending = false;

    // 비-meta 필드(사용자 편집 필드) — 로컬 변경 감지로 충돌 방지
    const NON_META_FIELDS = SYNCED_KEYS.filter(
      (k) =>
        !META_PAIRS.some((p) => p.data === k || p.meta === k) &&
        k !== "workDate"
    );

    const flush = async () => {
      const localState = useDataStore.getState() as unknown as Record<
        string,
        unknown
      >;
      const localSynced = pickSynced(localState);
      const localBody = JSON.stringify(localSynced);
      if (localBody === lastWriteRef.current) {
        localPendingRef.current = false;
        return;
      }
      if (inflight) {
        pending = true;
        return;
      }
      inflight = true;
      setStatus({ kind: "writing" });
      try {
        // 1) 마지막으로 sync 된 값 복원 (변경 감지 기준점)
        let lastWritten: Record<string, unknown> = {};
        if (lastWriteRef.current) {
          try {
            lastWritten = JSON.parse(lastWriteRef.current);
          } catch {}
        }

        // 2) Firestore 의 현재 최신 상태 가져오기
        const snap = await getDoc(ref);
        const remoteSynced: Record<string, unknown> = snap.exists()
          ? pickSynced(snap.data() as Record<string, unknown>)
          : {};

        // 3) meta 시각 기반 병합 (paired data+meta + workDate)
        const { merged } = mergePreserveLocal(remoteSynced, localSynced);

        // 4) 비-meta(사용자 편집) 필드: 로컬에서 변경된 항목만 덮어쓰기,
        //    아니면 원격 최신값 유지
        for (const k of NON_META_FIELDS) {
          const localChanged =
            JSON.stringify((localSynced as any)[k]) !==
            JSON.stringify((lastWritten as any)[k]);
          if (localChanged) {
            merged[k] = (localSynced as any)[k];
          }
        }

        // 5) merged 가 로컬과 다르면 로컬에 적용 (원격에서 가져온 새 필드 반영)
        const mergedBody = JSON.stringify(merged);
        if (mergedBody !== localBody) {
          ignoreNextRemoteRef.current = true;
          useDataStore.setState(stripUndefined(merged) as never, false);
        }

        // 6) merged 가 원격과 같으면 쓰기 생략 (이미 동기화됨)
        const remoteBody = JSON.stringify(remoteSynced);
        if (mergedBody === remoteBody) {
          lastWriteRef.current = mergedBody;
          localPendingRef.current = false;
          setStatus({ kind: "ok" });
          return;
        }

        // 7) Firestore 에 merged 푸시
        await setDoc(ref, {
          ...(sanitizeForFirestore(merged) as Record<string, unknown>),
          _updatedAt: serverTimestamp(),
        });
        lastWriteRef.current = mergedBody;
        setStatus({ kind: "ok" });
      } catch (e) {
        const code = (e as { code?: string })?.code ?? String(e);
        console.error("[SyncProvider] write 실패", e);
        setStatus({
          kind: "write-failed",
          reason:
            code === "permission-denied"
              ? "Firestore 권한 오류 — 보안 규칙 확인 필요"
              : code.includes("resource-exhausted")
                ? "Firestore 용량 초과 — 문서가 너무 큼 (1MB 제한)"
                : code,
        });
        // 5초 후 자동 재시도 (전송 실패 후에도 다음 변경 기다리지 않고 복구)
        setTimeout(() => {
          if (!inflight) flush();
        }, 5000);
        localPendingRef.current = false;
      } finally {
        inflight = false;
        if (pending) {
          pending = false;
          flush();
        }
      }
    };

    const unsub = useDataStore.subscribe((curr, prev) => {
      if (ignoreNextRemoteRef.current) {
        ignoreNextRemoteRef.current = false;
        return;
      }
      if (
        shallowEqualSynced(
          curr as unknown as Record<string, unknown>,
          prev as unknown as Record<string, unknown>
        )
      ) {
        return;
      }
      // 로컬 변경 → flush 끝나고 snapshot ack 받을 때까지 원격 무시
      localPendingRef.current = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 800);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [authReady]);

  return (
    <>
      {children}
      <SyncStatusBadge status={status} />
    </>
  );
}

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  if (status.kind === "ok") {
    return (
      <div
        className="fixed bottom-3 left-3 text-[10px] px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 z-50 pointer-events-none"
        title="모든 PC 동기화 정상"
      >
        ● 동기화 OK
      </div>
    );
  }
  if (status.kind === "writing") {
    return (
      <div className="fixed bottom-3 left-3 text-[10px] px-2 py-1 rounded bg-sky-50 border border-sky-200 text-sky-700 z-50 pointer-events-none">
        ⟳ 저장 중…
      </div>
    );
  }
  if (status.kind === "auth-waiting" || status.kind === "init") {
    return (
      <div className="fixed bottom-3 left-3 text-[10px] px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-600 z-50 pointer-events-none">
        ⟳ 연결 중…
      </div>
    );
  }
  if (status.kind === "auth-failed") {
    return (
      <div
        className="fixed bottom-3 left-3 text-[11px] px-3 py-2 rounded bg-rose-50 border border-rose-300 text-rose-800 z-50 max-w-md shadow"
        title={status.reason}
      >
        <div className="font-bold">⚠ 동기화 인증 실패</div>
        <div className="text-[10px]">{status.reason}</div>
      </div>
    );
  }
  if (status.kind === "write-failed") {
    return (
      <div
        className="fixed bottom-3 left-3 text-[11px] px-3 py-2 rounded bg-rose-50 border border-rose-300 text-rose-800 z-50 max-w-md shadow"
        title={status.reason}
      >
        <div className="font-bold">⚠ 저장 실패</div>
        <div className="text-[10px]">{status.reason}</div>
      </div>
    );
  }
  if (status.kind === "no-config") {
    return (
      <div className="fixed bottom-3 left-3 text-[10px] px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 z-50 pointer-events-none">
        ⚠ Firebase 미설정 — 로컬만 저장
      </div>
    );
  }
  return null;
}
