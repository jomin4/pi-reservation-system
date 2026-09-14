# mobile — 모바일 트랙

> 루트 [CLAUDE.md](../CLAUDE.md)의 규칙이 먼저다. 여기는 이 트랙만의 것.

## 스택

| 구분 | 값 |
|---|---|
| 언어 | TypeScript **5.9.3** |
| 프레임워크 | **React Native + Expo SDK 57** |
| 대상 | **Android APK만** — iOS는 범위 밖 |
| 라우터 | **`expo-router`** — 파일 기반 |
| 서버 상태 | TanStack Query |
| 타입 생성 | **`openapi-typescript`** ← `docs/api/openapi.yaml` |
| SSE | **`react-native-sse`** (`EventSource` 아님) |
| 토큰 저장 | **Expo SecureStore** |
| 스타일 | NativeWind + **Tailwind 3** ⚠️ **웹은 4다** (`tech.md`) |
| 린트 | `eslint-config-expo` + **ESLint 9** ⚠️ **웹은 10이다** (`tech.md`) |
| 테스트 | `jest-expo` + **Jest 29** — 웹은 `vitest` |
| 빌드 | **EAS Build** (클라우드) |
| 배포 | **GitHub Releases** — APK 직접 |

⚠️ **버전은 `tech.md` §프론트 계열 「버전 고정」 모바일 표가 진실이다.** `latest`로 깔지 않는다 — **`expo`의 `bundledNativeModules.json`이 `react-native`·`react`를 결정하고** 어긋나면 `expo-doctor`가 CI에서 잡는다.

> **웹과 숫자가 다른 게 셋이다** — Tailwind · ESLint · 테스트 러너. **전부 의도다.** 맞추려 들면 셋 다 깨진다.

## 패키지 매니저 — `pnpm@10.34.5`

⚠️ **`pnpm` 을 아무 버전으로나 쓰지 않는다.** CI 가 `pnpm/action-setup@v4` 로 **10** 을 깔고 `--frozen-lockfile` 로 읽는다. **11 로 설치하면 lockfile 포맷이 올라가 CI 가 읽지 못한다.**

```bash
npx pnpm@10.34.5 install      # 로컬 pnpm 이 11 이면 이렇게
```

`package.json` 의 `packageManager` 필드가 그 값을 박아둔 자리다. 생성된 lockfile 은 **`lockfileVersion: '9.0'`** 이어야 한다.

**`front`와 workspace로 묶지 않는다.** Expo metro resolver 이슈를 피한다 (`tech.md`).

## 배포가 두 갈래다

| 트리거 | 동작 |
|---|---|
| **`develop` 머지** | **EAS Update (OTA)** — 앱 재시작만으로 갱신 |
| **태그 `v*`** | **EAS Build → APK → Release 첨부** |

> **JS만 바뀌면 APK를 다시 안 깔아도 된다.** 네이티브가 바뀌면(Expo SDK 상향·네이티브 모듈 추가) 태그를 찍어야 한다 (`deploy.md` §8.2).

⚠️ **로컬에서 Android 빌드를 하지 않는다.** Gradle이 4GB+를 먹는데 그 8GB 호스트는 서버로 돌고 있다.

## ⚠️ `.env` 가 없으면 앱이 뜨다 죽는다 — 의도다

```bash
cp .env.example .env
```

`src/config/env.ts` 가 `EXPO_PUBLIC_API_MODE` 를 **읽을 때 검증하고 아니면 던진다.** 조용히 `real` 로 떨어지면 **"백엔드가 없는데 mock 이 안 붙는다"** 는 증상으로만 드러나고 원인이 안 보인다.

Jest 에는 `.env` 가 없으므로 `jest.setup.js` 가 같은 값을 주입한다.

## API 클라이언트 — 웹과 갈리는 지점 셋

| | 웹 | **모바일** |
|---|---|---|
| UUID | `crypto.randomUUID()` | **`expo-crypto`** — Hermes 에 `crypto` 가 없다 |
| 환경변수 | `import.meta.env.VITE_*` | **`EXPO_PUBLIC_*`** |
| **타임아웃** | 브라우저가 건다 | ⚠️ **직접 건다** — RN `fetch` 는 영원히 기다린다 |

### ⚠️ `ApiTimeoutError` 와 `ApiError` 는 다른 것이다

| | 뜻 | 해야 할 일 |
|---|---|---|
| `ApiError` | **서버가 답을 줬다** | `code` 로 분기 |
| **`ApiTimeoutError`** | **답이 없다.** 서버가 처리했는지 모른다 | ⚠️ **결제는 `POST` 재시도 금지.** `GET /holds/{id}/payment` 로 결과를 묻는다 (`E-03`) |

> **`202 PAYMENT_PENDING` 은 2xx 인데도 던진다.** 반환값으로 주면 호출부가 완료 화면으로 넘어간다 (`api.md` §4.3).

## 이 트랙만의 것 — `E-04` 백그라운드 복귀

**모바일에만 있는 예외 화면이다.**

| 상황 | 해야 할 일 |
|---|---|
| 앱이 백그라운드에서 돌아옴 | **SSE 재연결** + **좌석맵 전체 재조회** |
| 선점 타이머 | ⚠️ **`expiresAt`으로 재계산.** 인터벌 카운트는 백그라운드에서 멈춘다 |
| 멱등키 | ⚠️ **영속 저장.** 앱이 죽으면 메모리 키가 사라져 **이중 결제** |

## 이 트랙의 금지

| 금지 | 근거 |
|---|---|
| ⚠️ **함수 안에서 가짜 데이터 `return`** | `api.md` §7.2 — 로딩·에러 화면을 만들 계기가 없어진다 |
| 타입을 손으로 고치기 | 생성물이다. `openapi.yaml`을 고치고 재생성 |
| ⚠️ **Tailwind를 4로 올려 웹과 맞추기** | `tech.md` — **엔진(`react-native-css-interop`)이 `~3`으로 막는다.** 갈린 건 의도다 |
| ⚠️ **ESLint를 10으로 올려 웹과 맞추기** | **린트가 규칙 로딩에서 죽는다** — `eslint-plugin-react`가 9까지다 ([트러블슈팅](../docs/troubleshooting/mobile/2026-09-12-eslint-config-expo-caps-eslint-at-9.md)) |
| ⚠️ **`typescript`를 6으로 올리기** | Expo는 6을 기대하지만 **타입 생성과 린트가 동시에 깨진다.** `expo.install.exclude`로 예외 처리돼 있다 |
| **로컬 `pnpm` 11로 설치** | lockfile 포맷이 올라가 **CI의 `--frozen-lockfile`이 깨진다.** `npx pnpm@10.34.5` |
| `VITE_` 접두 환경변수 | **Expo는 `EXPO_PUBLIC_`만 번들에 주입한다** (`api.md` §7.2) |
| **멱등키를 메모리에만** | 앱 종료 시 사라진다 (`api.md` §2) |
| 인터벌로 TTL 카운트 | 백그라운드에서 멈춘다 |
| 결제 결과 조회를 `POST`로 | **`GET`이다. 이중 결제** |
| ⚠️ **타임아웃을 `ApiError`로 뭉뚱그리기** | **답이 없는 것과 답이 온 것은 다르다.** 결제에서 이 차이가 이중 결제를 가른다 |
| **`202`를 성공으로 반환** | 호출부가 **완료 화면으로 넘어간다** (`api.md` §4.3) |
| `4xx` 자동 재시도 | 다시 물어도 같은 답이다 (`query-client.ts`) |
| AAB로 빌드 | **APK다** — Play Store에 안 올린다 |

## 읽어야 할 문서

| 언제 | 어디 |
|---|---|
| 화면을 만들 때 | **`docs/wireframes/mobile.html`** — 11화면 + **예외 4** |
| API를 부를 때 | **`docs/api/openapi.yaml`** · `api.md` §5 |
| SSE를 붙일 때 | `api.md` §6 |
| Mock 전략 | **`api.md` §7** |
| 배포 | `deploy.md` §8 |

⚠️ **React Native에서 MSW가 동작하는지 세팅 때 확인할 것.** 안 되면 이 트랙만 다른 Mock 방식으로 간다 (`api.md` §7.2).
