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

## 토큰과 멱등키 — SecureStore (#84)

| 값 | 어디 | 왜 |
|---|---|---|
| Access (15분) | **메모리** | 짧고, Refresh 로 되살린다 |
| **Refresh** (14일) | **SecureStore** | 앱을 껐다 켜는 게 일상이다 |
| **멱등키** | **SecureStore** · `holdId` 에 묶임 | 앱이 죽으면 메모리 키가 사라져 **이중 결제** |

### ⚠️ Refresh 회전은 **동시에 두 번 하면 안 된다**

계약이 **회전 + 재사용 탐지**를 한다 (`openapi.yaml` `/auth/refresh`). 폐기된 토큰이 다시 오면 **탈취로 보고 그 회원 토큰을 전부 폐기**한다.

> 좌석맵·예약목록·프로필이 한 화면에서 동시에 `401` 을 받는 건 흔하다. 각자 회전하면 **두 번째가 이미 죽은 토큰을 들고 가** 사용자가 아무 잘못 없이 **통째로 로그아웃**된다.

`session.ts` 의 **단일 비행**이 그걸 막는다. 진행 중인 회전이 있으면 **그 약속을 같이 기다린다.**

### 선제 갱신

계약이 `accessExpiresAt` 을 주는 이유다 — **`401` 을 받고 갱신하면 사용자 동작 하나가 이미 실패한 뒤**다.

## SSE — 어댑터 한 장 뒤에 둔다 (#82)

`api.md` §7.4 가 「SSE 는 인터페이스로 감싼다」 로 정해뒀다. **그 결정이 두 번 값을 했다.**

| | |
|---|---|
| 목 | `FakeSeatEvents` 가 **백엔드 없이** 좌석맵을 움직인다 |
| ⚠️ 교체 | **`react-native-sse` 는 2024-03-05 이후 무릴리스.** 갈아끼울 때 **어댑터 한 장**이면 된다 |

### ⚠️ 브라우저가 해주던 두 가지를 우리가 한다

| | 브라우저 | **RN** |
|---|---|---|
| `Last-Event-ID` | **자동** (SSE 표준) | ⚠️ **헤더에 직접 싣는다** |
| 재연결 | 자동 (`retry:` 지시) | ⚠️ **직접 한다** (`pollingInterval: 0`) |

> **계약이 「브라우저가 자동으로 붙인다」 를 전제로 쓰여 있다** (`api.md` §6.3). 모바일엔 그 전제가 없다 — **재개가 조용히 안 되면 좌석맵에 구멍이 남는다.**
>
> 라이브러리 자동 재연결을 켜두면 **옛 `Last-Event-ID` 로 다시 붙어** 그 사이 이벤트를 통째로 잃는다.

### 하트비트 감시가 어댑터의 절반이다

모바일에서 TCP 는 **죽어도 조용하다** — 지하로 들어가면 소켓은 열린 채로 아무것도 안 온다. **45초 무수신이면 끊긴 것으로 본다** (`api.md` §6.7).

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
| ⚠️ **Refresh 를 동시에 두 번 회전** | **재사용 탐지에 걸려 전부 폐기된다.** `session.ts` 의 단일 비행을 우회하지 말 것 |
| **갱신 실패 후 또 갱신** | 폐기된 토큰을 다시 보내는 것이다. `401` 은 **한 번만** 되살린다 |
| 가드에서 `loading` 을 `anon` 으로 | 앱을 켤 때마다 **로그아웃된 것처럼** 보인다 |
| ⚠️ **SSE 자동 재연결을 라이브러리에 맡기기** | **옛 `Last-Event-ID` 로 붙어 그 사이가 빈다.** `pollingInterval: 0` |
| **`resume-failed` 후 자동 재연결** | 같은 실패를 무한 반복한다. **전체 재조회 후** 다시 `subscribe` |
| 인터벌로 TTL 카운트 | 백그라운드에서 멈춘다 |
| 결제 결과 조회를 `POST`로 | **`GET`이다. 이중 결제** |
| ⚠️ **전역 `fetch`를 모듈 로드 시점에 캡처** | **MSW가 조용히 깨진다** — `status`도 `text()`도 `undefined`인 Response ([트러블슈팅](../docs/troubleshooting/mobile/2026-09-14-msw-returns-half-dead-response.md)) |
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

## Mock — 자체 `fetch` 인터셉터 (2026-09-15 · #95)

**`msw` 는 Hermes 에서 안 돈다.** 모듈 평가 시점에 없는 Web API 를 참조해 **앱이 첫 화면도 못 그리고 죽었다** — `MessageEvent` → `BroadcastChannel` → 스트림 계열. 그래서 **모바일만 자체 인터셉터**로 간다.

| | |
|---|---|
| 가로채는 것 | **전역 `fetch` 를 한 겹 감싼다** (`src/mocks/intercept.ts`) |
| 켜는 법 | `EXPO_PUBLIC_API_MODE=mock` — `app/_layout.tsx` 가 렌더 전에 부른다 |
| 시나리오 | **`EXPO_PUBLIC_MOCK_SCENARIO`** — 모바일엔 주소창이 없다 |
| 웹과 같은 것 | `fixtures.ts` · `scenario.ts` · 핸들러 **로직** |

> **바뀐 건 「누가 가로채나」 뿐이다.** 앱이 진짜 `fetch` 를 부르고 `status`·`delay` 를 조작한다는 것은 웹과 같다 (`api.md` §7.2).

⚠️ **매칭 안 되는 요청은 404 를 지어내지 않고 원본으로 통과시킨다.** 목이 모르는 요청은 진짜로 나가야 **"목이 답한 건지 서버가 없는 건지" 가 구분된다.**

## 개발 루프 — 화면이 있는 작업은 에뮬레이터를 띄운 채로

⚠️ **정적 검사 4종이 전부 초록인데 앱이 안 뜨는 일이 실제로 두 번 있었다.** `tsc` · `eslint` · `jest` · `expo-doctor` 중 **번들러를 돌리는 건 하나도 없다.**

| 단계 | 명령 |
|---|---|
| 0 | `cp .env.example .env` — ⚠️ 없으면 앱이 뜨다 죽는다 |
| 1 | `emulator -avd <AVD>` · `adb devices` 로 확인 |
| 2 | `pnpm exec expo start --android` — 상주시킨다 |
| 3 | 코드 수정 → **Fast Refresh** 로 1~2초 |
| 4 | `adb exec-out screencap -p > screen.png` — **화면을 직접 본다** |
| 5 | 와이어프레임(`docs/wireframes/mobile.html`)과 맞으면 커밋 |

⚠️ **`CI=1` 로 `expo start` 를 띄우지 말 것.**

```
Metro is running in CI mode, reloads are disabled.
```

**watch mode 가 꺼져 Fast Refresh 가 안 실린다.** 포트 프롬프트를 피하려고 넣기 쉬운데, **수정이 화면에 안 반영되는 원인의 대부분이 이것이었다** — 있지도 않은 버그를 쫓게 된다. 포트는 **`--port 8081`** 로 넘긴다.

| 함정 | |
|---|---|
| 포트 8081 점유 | 이전 Metro 가 살아 있다. 죽이고 다시 |
| 새 파일을 안 집어간다 | **`--clear`** 로 캐시를 비우고 재시작 |
| 에러가 화면에만 뜬다 | `adb logcat` 말고 **Metro 출력**에 `ERROR` 로 같이 찍힌다 |
| **앱이 스피너에서 안 넘어간다** | `adb reverse tcp:8081 tcp:8081` 이 풀렸다. 에뮬레이터를 다시 띄우면 매번 설정한다 |
| `am start` 로 프로젝트가 안 열린다 | Expo Go 홈만 뜬다. **「Recent history」 의 프로젝트를 탭**한다 |
| ⚠️ **브랜치를 바꿨다** | **Metro 를 `--clear` 로 다시 띄운다.** 캐시가 옛 브랜치 코드를 들고 있어 **없는 함수를 `undefined` 로** 준다 |

⚠️ **화면이 기대와 다르면 먼저 번들 횟수**(Metro 의 `Android Bundled` 줄 수)**를 센다.** 안 늘었으면 **코드 문제가 아니라 전달 문제**다.

**2026-09-15 에 이걸로 세 번 헛짚었다.**

| 증상 | 진짜 원인 |
|---|---|
| 탭 아이콘이 ⧅ | 낡은 번들 (`CI=1`) |
| `API_MODE` 가 빈칸 | 〃 |
| **`TypeError: undefined is not a function`** | **브랜치 전환 후 Metro 캐시** — 새 브랜치에만 있는 함수가 `undefined` 였다 |

> **마지막 게 가장 위험하다.** 코드가 멀쩡한데 **런타임 에러가 나므로** 코드를 의심하게 된다.

> ⚠️ **「Jest 초록」 을 「동작한다」 로 읽지 않는다.** 엔진이 다르면 없는 전역도 다르다. **런타임에 기대는 결론은 에뮬레이터에서 한 번 보고 적는다.**
