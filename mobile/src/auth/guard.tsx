import { Redirect, usePathname } from 'expo-router'
import type { ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'

import { useAuthStatus } from './useAuth'

/**
 * 로그인이 필요한 화면을 감싼다.
 *
 * ⚠️ **원래 가려던 곳을 `next` 로 넘긴다.** 이게 없으면 예매 도중 `401` 이 났을 때
 *    로그인 후 홈으로 떨어져 **좌석 선택을 처음부터 다시** 하게 된다.
 *
 * ⚠️ **`loading` 을 `anon` 으로 보면 안 된다.** 앱을 막 켠 순간 SecureStore 를
 *    아직 못 읽었는데 그때 튕기면 **앱을 껐다 켤 때마다 로그아웃된 것처럼** 보인다.
 *
 * ⚠️ **클라이언트 가드는 UX 이지 보안이 아니다.** 소유권 판정은 서버가 한다
 *    (`F-31` · `api.md` §5). 여기서 막는 건 "빈 화면을 보여주지 않는 것" 뿐이다.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStatus()
  const pathname = usePathname()

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    )
  }

  if (status === 'anon') {
    return <Redirect href={{ pathname: '/login', params: { next: pathname } }} />
  }

  return <>{children}</>
}

/**
 * 로그인 성공 후 돌아갈 곳.
 *
 * ⚠️ **오픈 리다이렉트를 막는다.** `next` 는 URL 이 아니라 **앱 내부 경로**여야 한다 —
 *    `//evil.com` 이나 `https://…` 를 그대로 태우면 외부로 튕긴다.
 *    모바일이라 브라우저만큼 위험하진 않지만, **딥링크로 들어오는 값**이라 같은 처리를 한다.
 */
export function safeNext(next: unknown, fallback = '/'): string {
  if (typeof next !== 'string') return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//')) return fallback
  return next
}
