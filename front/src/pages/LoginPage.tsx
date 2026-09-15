import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useLogin } from '../api/queries'
import { ApiError, hasErrorCode } from '../api/problem'
import { setTokens } from '../auth'
import type { FromState } from '../routes/guards'
import { PATHS, safeRedirect } from '../routes'

/**
 * ⚠️ **남은 시도 횟수를 못 보여준다.**
 *
 * 와이어프레임 `W-07` 은 `(3 / 5회)` 를 그렸지만 **계약에 그 필드가 없다** —
 * `401 INVALID_CREDENTIALS` 도 `429 TOO_MANY_ATTEMPTS` 도 횟수를 주지 않는다.
 * 클라이언트가 세면 **브라우저마다 다른 숫자**가 된다(서버는 이메일 기준으로 센다).
 * **없는 값을 지어내지 않고**, 와이어프레임에 함께 있는 경고 문구만 고정으로 띄운다.
 */
function loginMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return error ? '잠시 후 다시 시도해 주세요.' : null

  if (hasErrorCode(error, 'TOO_MANY_ATTEMPTS')) {
    // ⚠️ "계정이 잠겼습니다" 가 아니다. 영구 잠금이면 재설정 수단이 없어 계정이 죽는다
    const minutes = Math.ceil((error.retryAfterSeconds ?? 300) / 60)
    return `로그인 시도가 너무 많습니다. ${minutes}분 뒤 다시 시도해 주세요.`
  }
  if (hasErrorCode(error, 'INVALID_CREDENTIALS')) {
    // ⚠️ "없는 이메일" 과 "비밀번호 틀림" 을 구분하지 않는다 — 계정 존재 여부가 샌다
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  }
  return error.problem.title
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const login = useLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // 보호 라우트가 심은 state.from(#67) 이 먼저, 그다음 와이어프레임의 ?redirect=
  const fromState = (location.state as FromState | null)?.from
  const target = safeRedirect(fromState ?? params.get('redirect'))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    login.mutate(
      { email, password },
      {
        onSuccess: (tokens) => {
          setTokens(tokens)
          void navigate(target, { replace: true })
        },
      },
    )
  }

  const message = loginMessage(login.error)

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-6"
    >
      <h1 className="text-lg font-bold">로그인</h1>

      <label className="mt-5 block">
        <span className="text-sm text-gray-600">이메일</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm text-gray-600">비밀번호</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      {message && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={login.isPending}
        className="mt-5 w-full rounded-lg bg-gray-900 py-2.5 font-medium text-white disabled:bg-gray-300"
      >
        {login.isPending ? '로그인 중…' : '로그인'}
      </button>

      <p className="mt-3 text-xs text-gray-500">5회 실패하면 5분 동안 로그인할 수 없습니다.</p>

      {/*
        ⚠️ "비밀번호를 잊으셨나요?" 링크를 넣지 않는다.
           비밀번호 재설정은 초기 범위 밖이다(폐쇄망 SMTP 회피).
           관습적으로 넣기 쉬운 자리라 와이어프레임이 따로 못 박아 뒀다.
      */}
      <p className="mt-4 text-center text-sm">
        <Link to={PATHS.signup} className="text-gray-600 underline">
          회원가입
        </Link>
      </p>
    </form>
  )
}
