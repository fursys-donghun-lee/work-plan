// Firebase 초기화 (웹 SDK)
// firebaseConfig 는 클라이언트 번들에 포함되어 누구나 볼 수 있지만, 노출돼도 안전합니다.
// 실제 보안은 Firestore 규칙(Auth 로그인 사용자만 R/W)이 담당합니다.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// =============================================================
//  여기에 Firebase 콘솔 → ⚙️ 프로젝트 설정 → 일반 → 내 앱 → SDK 구성
//  화면의 firebaseConfig 객체 값을 그대로 붙여넣으세요.
// =============================================================
const firebaseConfig = {
  apiKey: "AIzaSyC1rBZna4wFHZw3IdTx5TTtYcB15goq8r8",
  authDomain: "work-plan-985d6.firebaseapp.com",
  projectId: "work-plan-985d6",
  storageBucket: "work-plan-985d6.firebasestorage.app",
  messagingSenderId: "564119984864",
  appId: "1:564119984864:web:746ff2e7ec6bcea38b8e85",
};

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
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
  return (
    !!firebaseConfig.projectId &&
    firebaseConfig.projectId !== "PASTE_HERE" &&
    !!firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "PASTE_HERE"
  );
}
