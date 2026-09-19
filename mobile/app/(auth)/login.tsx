import { Link, router, useLocalSearchParams } from 'expo-router'
import { Text, TouchableOpacity } from 'react-native'

import { safeNext } from '@/auth/guard'
import { signIn } from '@/auth/useAuth'
import { Placeholder } from '@/ui/Placeholder'

/**
 * `M-07` 로그인 — 폼은 #46 이 채운다.
 *
 * ⚠️ **로그인 성공은 `replace` 다.** `push` 로 가면 뒤로가기로 로그인 화면이 다시 나온다.
 */
export default function Login() {
  const { next } = useLocalSearchParams<{ next?: string }>()
  const target = safeNext(next)

  return (
    <Placeholder id="M-07" title="로그인" note={`로그인 후 돌아갈 곳: ${target}`}>
      <TouchableOpacity
        onPress={() => {
          // #46 이 진짜 POST /auth/login 으로 바꾼다. 지금은 계약 모양만 맞춘다.
          void signIn({
            accessToken: 'placeholder',
            refreshToken: 'placeholder',
            accessExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          }).then(() => router.replace(target))
        }}
        className="mt-6 rounded-lg bg-sky-600 px-6 py-3"
      >
        <Text className="text-sm font-semibold text-white">로그인 (자리표)</Text>
      </TouchableOpacity>

      <Link href="/signup" className="mt-4 text-sm text-sky-600">
        회원가입 (M-08) →
      </Link>
    </Placeholder>
  )
}
