import { Navigate, Route, Routes } from 'react-router'
import { AppLayout } from '../layout/AppLayout'
import {
  HoldPage,
  HomePage,
  LoginPage,
  MePage,
  PaymentPage,
  ReservationCompletePage,
  ReservationPage,
  ReservationsPage,
  SeatsPage,
  SignupPage,
  TripsPage,
} from '../pages'
import { RequireAnonymous, RequireAuth } from './guards'
import { PATHS } from './paths'

/**
 * 라우트 11개 (`docs/wireframes/web.html`).
 *
 * ⚠️ **`E-01`~`E-03` 은 여기 없다.** 화면이 아니라 상태다 — `E-01` 은 `W-03` 안에서,
 * `E-03` 은 `W-05` 안에서 산다. 별도 경로를 만들면 와이어프레임과 다른 앱이 된다.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 공개 — 로그인 없이 운행과 좌석을 본다 (api.md §5.1) */}
        <Route path={PATHS.home} element={<HomePage />} />
        <Route path={PATHS.trips} element={<TripsPage />} />
        {/* ⚠️ 좌석 선택도 공개다. 로그인을 요구하는 건 선점 버튼이다 */}
        <Route path={PATHS.seats} element={<SeatsPage />} />

        <Route
          path={PATHS.login}
          element={
            <RequireAnonymous>
              <LoginPage />
            </RequireAnonymous>
          }
        />
        <Route
          path={PATHS.signup}
          element={
            <RequireAnonymous>
              <SignupPage />
            </RequireAnonymous>
          }
        />

        <Route
          path={PATHS.hold}
          element={
            <RequireAuth>
              <HoldPage />
            </RequireAuth>
          }
        />
        <Route
          path={PATHS.payment}
          element={
            <RequireAuth>
              <PaymentPage />
            </RequireAuth>
          }
        />
        {/* ⚠️ /reservations/:no 보다 먼저 와야 한다 — 안 그러면 "complete" 를 예약번호로 먹는다 */}
        <Route
          path={PATHS.reservationComplete}
          element={
            <RequireAuth>
              <ReservationCompletePage />
            </RequireAuth>
          }
        />
        <Route
          path={PATHS.reservations}
          element={
            <RequireAuth>
              <ReservationsPage />
            </RequireAuth>
          }
        />
        <Route
          path={PATHS.reservation}
          element={
            <RequireAuth>
              <ReservationPage />
            </RequireAuth>
          }
        />
        <Route
          path={PATHS.me}
          element={
            <RequireAuth>
              <MePage />
            </RequireAuth>
          }
        />

        {/* 없는 경로는 홈으로 — 404 화면은 범위 밖이다 */}
        <Route path="*" element={<Navigate to={PATHS.home} replace />} />
      </Route>
    </Routes>
  )
}
