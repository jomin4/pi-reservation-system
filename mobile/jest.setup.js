// ⚠️ src/config/env.ts 는 EXPO_PUBLIC_API_MODE 가 없으면 던진다 — 의도된 동작이다
//    (조용히 real 로 떨어지면 "백엔드가 없는데 mock 이 안 붙는다" 로만 드러난다).
//
//    실기기·시뮬레이터에서는 .env 가 그 값을 준다. Jest 에는 .env 가 없으므로
//    여기서 주입한다. 값은 .env.example 과 같아야 한다.
process.env.EXPO_PUBLIC_API_MODE = 'mock'
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://test/api/v1'
