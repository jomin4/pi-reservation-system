/**
 * 로그인 뒤 돌아갈 자리.
 *
 * 두 경로로 온다 — 보호 라우트가 심은 `state.from`(#67), 그리고 와이어프레임 `W-07` 이
 * 그린 `?redirect=`. **둘 다 받는다.**
 *
 * ⚠️ **검증 없이 쓰면 오픈 리다이렉트다.** `?redirect=https://evil.com` 을 그대로
 * 따라가면 로그인 직후 남의 사이트로 보낸다. **같은 오리진의 경로만** 통과시킨다.
 */
export function safeRedirect(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback
  // `//evil.com` 은 프로토콜 상대 URL 이라 외부로 나간다
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}
