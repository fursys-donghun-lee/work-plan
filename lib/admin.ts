// 관리자 비밀번호.
// 저장소가 public 이라 소스에서 보일 수 있지만,
// 일반 사용자(현장 관리자)의 우발적 진입을 막는 용도로 충분합니다.
// 변경하려면 이 값만 수정하고 push 하면 됩니다.
export const ADMIN_PASSWORD = "fursys2026";

export function checkAdminPassword(input: string): boolean {
  return input === ADMIN_PASSWORD;
}
