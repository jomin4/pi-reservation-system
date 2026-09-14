import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App.tsx'
import { createQueryClient } from './api'
import { enableMocking } from './mocks/enable'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root 를 찾지 못했다')

// ⚠️ 워커 등록을 render 앞에서 await 한다. 먼저 렌더하면 첫 요청이
//    가로채지기 전에 나가 진짜 네트워크로 샌다 (api.md §7.2).
await enableMocking()

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
