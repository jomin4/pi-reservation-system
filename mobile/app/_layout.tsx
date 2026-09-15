import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'

import { createQueryClient } from '@/api'
import { restoreSession } from '@/auth/useAuth'
import { wireAuth } from '@/auth/wire'
import { enableMocking } from '@/mocks/enable'

import '../global.css'

// ⚠️ 렌더보다 먼저, 모듈 로드 시점에 켠다.
//    목 서버가 뜨기 전에 나간 요청은 **그것만** 진짜 네트워크로 샌다.
enableMocking()

// ⚠️ 목보다 뒤, 첫 요청보다 앞. 배선이 없으면 토큰이 헤더에 안 실린다.
wireAuth()
void restoreSession()

export default function RootLayout() {
  // ⚠️ 모듈 최상단에서 만들지 않는다. Fast Refresh 때 캐시가 통째로 날아간다.
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerBackTitle: '뒤로' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ title: '로그인' }} />
        <Stack.Screen name="(auth)/signup" options={{ title: '회원가입' }} />
        <Stack.Screen name="trips/index" options={{ title: '운행 목록' }} />
        <Stack.Screen name="trips/[tripId]/seats" options={{ title: '좌석 선택' }} />
        <Stack.Screen name="holds/[holdId]/index" options={{ title: '승객 정보' }} />
        <Stack.Screen name="holds/[holdId]/payment" options={{ title: '결제' }} />
        <Stack.Screen
          name="reservations/[reservationNo]/complete"
          options={{
            title: '예약 완료',
            // ⚠️ 결제 화면으로 돌아갈 길을 막는다. 스택에서 빼는 것(replace)과
            //    함께 쓴다 — 제스처만 막으면 헤더 뒤로가기가 남는다.
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="reservations/[reservationNo]/index" options={{ title: '예약 상세' }} />
      </Stack>
    </QueryClientProvider>
  )
}
