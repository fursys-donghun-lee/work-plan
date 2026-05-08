# 안성공장 일일 근무계획 대시보드

Next.js 정적 export + Firebase Firestore + GitHub Pages 로 운영되는 다중 사용자 근무관리 대시보드.

## 아키텍처

- **프론트**: Next.js 14 (App Router, static export `output: "export"`)
- **데이터**: Firebase Firestore (단일 문서 `state/main` 에 store 통째로 저장, 실시간 onSnapshot 동기화)
- **인증**: Firebase Auth (Email/Password)
- **호스팅**: GitHub Pages (정적 파일)
- **CI/CD**: GitHub Actions

## 최초 1회 셋업

### 1. Firebase 프로젝트 생성

1. https://console.firebase.google.com 에서 새 프로젝트 생성
2. **Firestore Database** 활성화 → "프로덕션 모드 시작" → 리전 `asia-northeast3 (서울)` 권장
3. **Authentication** → "시작하기" → "Email/Password" 공급업체 사용 설정
4. Authentication → "사용자" 탭에서 사용자 계정 추가 (관리자/현장 관리자 각각)

### 2. Firestore 보안 규칙

콘솔 → Firestore Database → 규칙:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 로그인된 사용자만 모든 문서 읽기/쓰기 가능
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 3. Firebase 웹 SDK config 복사

콘솔 → ⚙️ 프로젝트 설정 → "내 앱" 영역에서 **웹 앱 추가** (없으면 등록).
설정 화면 하단의 `firebaseConfig` 객체에 표시되는 6개 값을 메모해주세요:

```js
{
  apiKey: "...",
  authDomain: "....firebaseapp.com",
  projectId: "...",
  storageBucket: "....firebasestorage.app",
  messagingSenderId: "...",
  appId: "1:..."
}
```

### 4. GitHub 저장소 생성 + secret 등록

1. GitHub 에서 새 저장소 생성 (이름은 자유, 예: `factory-dashboard`)
2. 저장소 Settings → Secrets and variables → Actions → "New repository secret" 으로 6개 등록:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`

### 5. GitHub Pages 활성화

저장소 Settings → Pages → "Build and deployment" → Source: **GitHub Actions** 선택

### 6. 코드 푸시

`web/` 폴더 내용을 GitHub 저장소 root 로 push:

```bash
cd web
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

푸시되면 GitHub Actions 가 자동으로 빌드 + 배포. 1~2분 후 다음 URL 에서 접속 가능:

```
https://<USER>.github.io/<REPO>/
```

### 7. Firebase 인증 도메인 추가

배포 URL 에서 로그인이 작동하려면 Firebase 콘솔 → Authentication → Settings → "승인된 도메인" 에 GitHub Pages 호스트(`<USER>.github.io`) 추가.

## 로컬 개발

```bash
cp .env.local.example .env.local
# .env.local 에 Firebase 값 채우기
npm install
npm run dev
```

기본 `http://localhost:3000` (포트 변경 시 `next dev -p 3001`).

## 데이터 구조

- Firestore: `/state/main` 문서 1개 — store.json 통째로 직렬화
- 첫 사용자 접속 시 빈 상태이면 자동으로 초기 push
- 다른 사용자가 변경 → onSnapshot 으로 실시간 반영

50MB 정도까지 단일 문서로 충분합니다. 더 커지면 컬렉션 분할(employees/attendance/etc) 권장.

## 주의 사항

- `apiKey` 등 Firebase config 는 클라이언트 번들에 포함되며 공개돼도 안전합니다 (실제 보안은 Firestore 규칙).
- 사용자 계정 추가는 Firebase 콘솔의 Authentication → 사용자 메뉴에서 직접 생성.
- `NEXT_PUBLIC_BASE_PATH` 는 프로젝트 사이트(`<user>.github.io/<repo>`) 일 때만 사용; 사용자 사이트(루트 도메인)면 빈 값.
