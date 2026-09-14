import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'

import { createQueryClient } from '@/api'
import { enableMocking } from '@/mocks/enable'

import '../global.css'

// ⚠️ 렌더보다 먼저, 모듈 로드 시점에 켠다.
//    목 서버가 뜨기 전에 나간 요청은 **그것만** 진짜 네트워크로 샌다.
enableMocking()

export default function RootLayout() {
  // ⚠️ 모듈 최상단에서 만들지 않는다. Fast Refresh 때 캐시가 통째로 날아간다.
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  )
}
