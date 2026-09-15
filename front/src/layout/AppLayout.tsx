import { useEffect } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { hasSession, onSessionEnd, useLogout } from '../auth'
import { PATHS } from '../routes/paths'

/**
 * 공통 레이아웃. 헤더 · 로그인 상태 · 로그아웃.
 *
 * ⚠️ **세션 종료를 여기서 한 번만 구독한다.** 갱신 실패(#69)와 명시적 로그아웃(#70)이
 * `onSessionEnd` 라는 같은 문을 쓰므로, 화면마다 처리를 흩을 이유가 없다.
 */
export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useLogout()
  const loggedIn = hasSession()

  useEffect(() => {
    return onSessionEnd(() => {
      // 튕겨나간 자리를 들고 간다 — 다시 로그인하면 그 화면으로 돌아온다
      const from = `${location.pathname}${location.search}`
      void navigate(PATHS.login, { state: { from }, replace: true })
    })
  }, [navigate, location.pathname, location.search])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link to={PATHS.home} className="font-bold">
            좌석 예매
          </Link>
          <div className="flex-1" />
          {loggedIn ? (
            <>
              <Link to={PATHS.reservations} className="text-sm text-gray-600">
                예약 내역
              </Link>
              <Link to={PATHS.me} className="text-sm text-gray-600">
                마이페이지
              </Link>
              <button type="button" onClick={() => void logout()} className="text-sm text-gray-600">
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link to={PATHS.login} className="text-sm text-gray-600">
                로그인
              </Link>
              <Link to={PATHS.signup} className="text-sm text-gray-600">
                회원가입
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
