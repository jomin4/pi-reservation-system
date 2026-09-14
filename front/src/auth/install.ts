import { setAccessTokenProvider, setRefreshHandler } from '../api/client'
import { createRefresher } from './session'
import { getAccessToken } from './token-store'

/**
 * 기본 `api` 인스턴스에 토큰 공급자와 갱신 훅을 꽂는다.
 *
 * ⚠️ **`client.ts` 가 `src/auth` 를 import 하지 않는 이유가 이 파일이다.**
 * `session.ts` 가 `client.ts` 를 쓰므로 반대 방향 import 를 넣으면 순환이 된다.
 * 연결은 **앱 부팅에서 한 번** 한다 (`main.tsx`).
 */
export function installAuth(): void {
  setAccessTokenProvider(getAccessToken)
  setRefreshHandler(createRefresher())
}

/** 테스트 격리용 */
export function uninstallAuth(): void {
  setAccessTokenProvider(() => null)
  setRefreshHandler(null)
}
