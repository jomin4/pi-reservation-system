/**
 * 실행 모드 스위치 — `api.md` §7.2
 *
 * ⚠️ Expo 는 `EXPO_PUBLIC_` 접두가 붙은 것만 클라이언트 번들에 주입한다.
 *    접두를 안 맞추면 값이 `undefined` 로 들어오고 조용히 `real` 로 떨어진다.
 *    백엔드가 없는데 mock 이 안 붙는 게 이 실수의 증상이다.
 *
 * 그래서 여기서 한 번만 읽고, 읽을 때 검증한다.
 */

export type ApiMode = 'mock' | 'real'

const RAW_MODE = process.env.EXPO_PUBLIC_API_MODE

function readMode(raw: string | undefined): ApiMode {
  if (raw === 'mock' || raw === 'real') return raw

  // 조용히 real 로 떨어지지 않는다. 설정이 안 읽힌 것과 real 을 고른 것은 다른 상황이다.
  throw new Error(
    `EXPO_PUBLIC_API_MODE 가 'mock' 도 'real' 도 아니다 (받은 값: ${JSON.stringify(raw)}). ` +
      `.env.example 을 .env 로 복사했는지, 접두가 EXPO_PUBLIC_ 인지 확인한다.`,
  )
}

export const API_MODE: ApiMode = readMode(RAW_MODE)

export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? '/api/v1'

export const isMock = API_MODE === 'mock'
