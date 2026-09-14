import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'

import { createQueryClient } from '@/api'

import '../global.css'

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
