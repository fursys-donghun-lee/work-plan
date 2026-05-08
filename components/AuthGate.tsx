"use client";

import { useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";
import { getAuthInstance, isFirebaseConfigured } from "@/lib/firebase";
import { Lock, LogIn } from "lucide-react";

// Firebase Email/Password 로그인 게이트.
// 로그인된 사용자만 children 렌더링.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setReady(true);
      return;
    }
    const auth = getAuthInstance();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!isFirebaseConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="card max-w-lg text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Firebase 설정 필요
          </h1>
          <p className="text-sm text-slate-600">
            <code>.env.local</code> 또는 GitHub Actions secret 에 Firebase 설정을
            추가해주세요. README 의 셋업 가이드를 참고하세요.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) return null;

  if (user) {
    return (
      <>
        {children}
        <button
          onClick={() => signOut(getAuthInstance())}
          className="fixed bottom-3 right-3 text-xs text-slate-500 hover:text-slate-800 px-2 py-1 bg-white border border-slate-200 rounded shadow-sm z-50"
          title={user.email ?? ""}
        >
          로그아웃
        </button>
      </>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(getAuthInstance(), email.trim(), password);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      if (code.includes("invalid-credential") || code.includes("wrong-password")) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else if (code.includes("too-many-requests")) {
        setError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.");
      } else if (code.includes("network")) {
        setError("네트워크 오류 — 인터넷 연결을 확인해주세요.");
      } else {
        setError(`로그인 실패: ${code || String(err)}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-6">
      <form
        onSubmit={handleLogin}
        className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-4"
      >
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mb-3">
            <Lock className="w-7 h-7 text-slate-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            안성공장 일일 근무계획
          </h1>
          <p className="text-sm text-slate-500 mt-1">로그인이 필요합니다</p>
        </div>

        <div>
          <label className="text-xs text-slate-500 font-medium">이메일</label>
          <input
            type="email"
            className="input w-full mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 font-medium">비밀번호</label>
          <input
            type="password"
            className="input w-full mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary w-full justify-center inline-flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          {submitting ? "로그인 중..." : "로그인"}
        </button>

        <p className="text-xs text-slate-400 text-center">
          계정은 관리자에게 문의해주세요.
        </p>
      </form>
    </div>
  );
}
