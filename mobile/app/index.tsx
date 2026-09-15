import { useQuery } from '@tanstack/react-query'
import { ActivityIndicator, Text, View } from 'react-native'

import { api, isApiError } from '@/api'
import { API_BASE_URL, API_MODE } from '@/config/env'

interface Station {
  code: string
  name: string
}

/**
 * 스캐폴드 확인용 화면. `M-01` 홈·열차 조회가 이 자리를 가져간다 (#40).
 *
 * 지금 보여주는 건 셋이다 — **NativeWind 가 적용됐는가** · **`EXPO_PUBLIC_` 스위치가
 * 읽혔는가** · ⚠️ **목 인터셉터가 Hermes 에서 실제로 무는가.**
 *
 * > 마지막이 이 화면의 존재 이유다. `msw` 는 Jest 를 통과하고 **기기에서 죽었다**
 * > (트러블슈팅 2026-09-14). **화면에 뜨는 역 이름이 그 증거**가 된다.
 */
export default function Home() {
  const stations = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.request<{ stations: Station[] }>('/stations'),
  })

  return (
    <View className="flex-1 items-center justify-center gap-2 bg-white px-6">
      <Text className="text-2xl font-bold text-slate-900">pi-reservation</Text>
      <Text className="text-sm font-semibold text-slate-500">API_MODE: {API_MODE}</Text>
      <Text className="text-xs text-slate-400">{API_BASE_URL}</Text>

      <View className="mt-6 w-full items-center gap-1 rounded-lg bg-slate-50 py-4">
        {stations.isPending ? (
          <ActivityIndicator />
        ) : stations.isError ? (
          <Text className="text-center text-xs text-red-600">
            {isApiError(stations.error)
              ? `${stations.error.code} (${stations.error.status})`
              : String(stations.error)}
          </Text>
        ) : (
          <>
            <Text className="text-xs font-semibold text-slate-600">
              GET /stations → {stations.data.stations.length}개
            </Text>
            <Text className="text-xs text-slate-400">
              {stations.data.stations.map((s) => s.name).join(' · ')}
            </Text>
          </>
        )}
      </View>
    </View>
  )
}
