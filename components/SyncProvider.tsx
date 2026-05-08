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

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [, setHydrated] = useState(false);
  const lastWriteRef = useRef<string>("");
  const ignoreNextRemoteRef = useRef<boolean>(false);
  // 로컬 변경이 디바운스 큐에 있거나 쓰기 진행 중일 때 true.
  // 이 동안 Firestore 에서 들어오는 snapshot 은 우리 변경을 덮어쓰면 안 되므로 무시.
  const localPendingRef = useRef<boolean>(false);

  // 1) Firestore 실시간 구독 (서버 → 클라이언트)
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

        // 로컬 변경이 디바운스/전송 대기 중이면 원격 snapshot 무시 (덮어쓰기 방지)
        if (localPendingRef.current) {
          setHydrated(true);
          return;
        }

        const data = snap.data();
        const synced = pickSynced(data);
        const body = JSON.stringify(synced);
        // 우리가 방금 쓴 값이면 무시
        if (body === lastWriteRef.current) {
          setHydrated(true);
          return;
        }
        ignoreNextRemoteRef.current = true;
        useDataStore.setState(synced as never, false);
        lastWriteRef.current = body;
        setHydrated(true);
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
      } catch (e) {
        console.warn("[SyncProvider] write 실패", e);
      } finally {
        inflight = false;
        if (pending) {
          pending = false;
          flush();
        } else {
          localPendingRef.current = false;
        }
      }
    };

    const unsub = useDataStore.subscribe((curr, prev) => {
      if (ignoreNextRemoteRef.current) {
        // 원격에서 받은 변경이면 다시 쓰지 않음
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
      // 로컬 변경 발생 → flush 끝날 때까지 원격 snapshot 무시
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
