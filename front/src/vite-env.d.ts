/// <reference types="vite/client" />

// api.md §7.2 — 앱 코드는 그대로 두고 이 스위치 하나로 MSW 를 켜고 끈다
// ⚠️ .env 는 커밋되지 않는다 (.env.example 만 있다). 없을 수 있다는 걸 타입에 남긴다 —
//    string 으로 선언하면 "undefined/trips" 로 요청이 나가는 걸 컴파일러가 못 잡는다.
interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'real'
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
