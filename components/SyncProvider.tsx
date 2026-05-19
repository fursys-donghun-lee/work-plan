"use client";

import { useEffect, useRef, useState } from "react";
import { useDataStore } from "@/lib/store/useDataStore";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

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

  // 1. 일단 모든 필드를 원격 기본값으로
  for (const k of SYNCED_KEYS) {
    merged[k] = (remote as any)[k];
  }

  // 2. data+meta 쌍은 uploadedAt 비교
  for (const { data, meta } of META_PAIRS) {
    const localTime = getMetaTime((local as any)[meta]);
    const remoteTime = getMetaTime((remote as any)[meta]);
    if (localTime > remoteTime) {
      merged[data] = (local as any)[data];
      merged[meta] = (local as any)[meta];
      preservedFromLocal = true;
    }
  }

  // 3. workDate 는 attendanceMeta 따라가기
  {
    const localTime = getMetaTime((local as any).attendanceMeta);
    const remoteTime = getMetaTime((remote as any).attendanceMeta);
    if (localTime > remoteTime) {
      merged.workDate = (local as any).workDate;
    }
  }

  // 4. 그 외 필드 — 원격이 비어있으면 로컬 보존
  for (const k of SYNCED_KEYS) {
    if (isEmptyValue(merged[k]) && !isEmptyValue((local as any)[k])) {
      merged[k] = (local as any)[k];
      preservedFromLocal = true;
    }
  }

  return { merged, preservedFromLocal };
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [, setHydrated] = useState(false);
  const lastWriteRef = useRef<string>("");
  const ignoreNextRemoteRef = useRef<boolean>(false);
  // 로컬 변경이 디바운스/전송 진행 중. 이 동안 원격 snapshot 무시.
  // (clear는 우리 자신의 write 가 snapshot 으로 돌아왔을 때만 — 또는 에러 시)
  const localPendingRef = useRef<boolean>(false);

  // 1) Firestore 실시간 구독
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      console.warn(
        "[SyncProvider] Firebase 설정이 없습니다. localStorage 만 사용합니다."
      );
      setHydrated(true);
      return;
    }

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
        useDataStore.setState(merged as never, false);
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
  }, []);

  // 2) store 변경 → Firestore 쓰기 (디바운스)
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const db = getDb();
    const ref = doc(db, ...STATE_DOC_PATH);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let inflight = false;
    let pending = false;

    const flush = async () => {
      const state = useDataStore.getState() as unknown as Record<string, unknown>;
      const synced = pickSynced(state);
      const body = JSON.stringify(synced);
      if (body === lastWriteRef.current) {
        // 이미 같은 값이 서버에 있음 — pending 해제
        localPendingRef.current = false;
        return;
      }
      if (inflight) {
        pending = true;
        return;
      }
      inflight = true;
      try {
        await setDoc(ref, {
          ...(sanitizeForFirestore(synced) as Record<string, unknown>),
          _updatedAt: serverTimestamp(),
        });
        lastWriteRef.current = body;
        // pending 은 우리 자신의 snapshot 이 돌아올 때 onSnapshot 에서 해제
      } catch (e) {
        console.warn("[SyncProvider] write 실패", e);
        // 실패 시 pending 해제 (안 그러면 영원히 막힘)
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
  }, []);

  return <>{children}</>;
}
