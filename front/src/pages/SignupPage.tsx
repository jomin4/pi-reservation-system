import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useEmailAvailability, useSignup } from '../api/queries'
import { ApiError, hasErrorCode } from '../api/problem'
import { PATHS } from '../routes'

/** 계약이 정한 값이다 (`auth.yaml`) — 프론트가 정하는 게 아니다 */
const PASSWORD_MIN = 8
/** ⚠️ BCrypt 가 72바이트를 넘는 입력을 **조용히 자른다.** 막지 않으면 "73번째 글자부터는 아무거나 통과" 가 된다 */
const PASSWORD_MAX = 72
const PHONE = /^01[0-9]-[0-9]{3,4}-[0-9]{4}$/

export function SignupPage() {
  const navigate = useNavigate()
  const signup = useSignup()
  const availability = useEmailAvailability()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const passwordTooShort = password !== '' && password.length < PASSWORD_MIN
  const mismatch = confirm !== '' && password !== confirm
  const phoneInvalid = phone !== '' && !PHONE.test(phone)

  const canSubmit =
    email !== '' &&
    password.length >= PASSWORD_MIN &&
    password === confirm &&
    name !== '' &&
    PHONE.test(phone) &&
    !signup.isPending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    signup.mutate(
      { email, password, name, phone },
      {
        // 계약이 토큰을 주지 않는다 — 가입은 됐고 로그인은 따로 한다
        onSuccess: () => void navigate(PATHS.login, { replace: true }),
      },
    )
  }

  const signupMessage = (() => {
    const e = signup.error
    if (!(e instanceof ApiError)) return e ? '잠시 후 다시 시도해 주세요.' : null
    if (hasErrorCode(e, 'EMAIL_ALREADY_EXISTS')) return '이미 가입된 이메일입니다.'
    return e.problem.title
  })()

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-6"
    >
      <h1 className="text-lg font-bold">회원가입</h1>

      <label className="mt-5 block">
        <span className="text-sm text-gray-600">이메일</span>
        <div className="mt-1 flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              availability.reset()
            }}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <button
            type="button"
            disabled={email === '' || availability.isPending}
            onClick={() => availability.mutate(email)}
            className="shrink-0 rounded-lg border border-gray-300 px-3 text-sm disabled:text-gray-400"
          >
            중복확인
          </button>
        </div>
      </label>

      {availability.isSuccess && (
        <p
          className={
            availability.data.available
              ? 'mt-2 text-sm text-green-700'
              : 'mt-2 text-sm text-red-700'
          }
        >
          {availability.data.available
            ? '사용 가능한 이메일입니다.'
            : '이미 사용 중인 이메일입니다.'}
        </p>
      )}

      <label className="mt-4 block">
        <span className="text-sm text-gray-600">비밀번호 ({PASSWORD_MIN}자 이상)</span>
        <input
          type="password"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      {passwordTooShort && (
        <p className="mt-1 text-sm text-red-700">{PASSWORD_MIN}자 이상이어야 합니다.</p>
      )}

      <label className="mt-4 block">
        <span className="text-sm text-gray-600">비밀번호 확인</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      {mismatch && <p className="mt-1 text-sm text-red-700">비밀번호가 일치하지 않습니다.</p>}

      <label className="mt-4 block">
        <span className="text-sm text-gray-600">이름</span>
        <input
          type="text"
          required
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="홍길동"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm text-gray-600">연락처</span>
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-0000-0000"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      {phoneInvalid && (
        <p className="mt-1 text-sm text-red-700">010-0000-0000 형식이어야 합니다.</p>
      )}

      {signupMessage && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {signupMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-5 w-full rounded-lg bg-gray-900 py-2.5 font-medium text-white disabled:bg-gray-300"
      >
        {signup.isPending ? '가입 중…' : '가입하기'}
      </button>

      {/*
        ⚠️ 중복확인은 폼 편의용이다. 최종 판정은 가입 요청의 DB unique 제약이고,
           확인과 가입 사이에 남이 채가면 409 가 난다 — 그게 정상이다 (api.md §5.5).
      */}
      <p className="mt-3 text-xs text-gray-500">
        중복확인은 참고용입니다. 가입 시점에 이미 사용 중일 수 있습니다.
      </p>

      <p className="mt-4 text-center text-sm">
        <Link to={PATHS.login} className="text-gray-600 underline">
          로그인으로
        </Link>
      </p>
    </form>
  )
}
