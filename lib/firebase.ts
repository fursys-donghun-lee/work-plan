// Firebase 초기화 (웹 SDK)
// 실제 config 값은 .env.local 또는 GitHub Actions secret 으로 주입.
// 이 파일은 클라이언트 전용 — apiKey 는 공개돼도 안전 (보안은 Firestore rules 가 담당).

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (!firebaseConfig.projectId) {
    throw new Error(
      "Firebase 설정이 누락되었습니다. .env.local 또는 GitHub Actions secret 을 확인해주세요."
    );
  }
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  return app;
}

export function getAuthInstance(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

export function getDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getFirebaseApp());
  return _db;
}

export function isFirebaseConfigured(): boolean {
  return !!firebaseConfig.projectId && !!firebaseConfig.apiKey;
}
