/// <reference types="vite/client" />

// api.md §7.2 — 앱 코드는 그대로 두고 이 스위치 하나로 MSW 를 켜고 끈다
interface ImportMetaEnv {
  readonly VITE_API_MODE: 'mock' | 'real'
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
