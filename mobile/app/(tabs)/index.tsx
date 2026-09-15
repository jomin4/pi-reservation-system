import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'

import { api, isApiError } from '@/api'
import { API_MODE } from '@/config/env'
import { Placeholder } from '@/ui/Placeholder'

interface Station {
  code: string
  name: string
}

/**
 * `M-01` 홈 · 열차 조회 — **비로그인으로도 조회는 된다** (와이어프레임 · `api.md` §5.1).
 *
 * ⚠️ 여기 남은 `GET /stations` 호출은 **목이 실제로 무는지 보는 장치**다.
 *    `msw` 가 Jest 를 통과하고 기기에서 죽었기 때문에 남겨둔다 (#91).
 *    조회 폼은 #40 이 채운다.
 */
export default function Home() {
  const stations = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.request<{ stations: Station[] }>('/stations'),
  })

  return (
    <Placeholder id="M-01" title="홈 · 열차 조회" note="구간·날짜 선택은 #40 이 채운다">
      <View className="mt-4 w-full items-center gap-1 rounded-lg bg-slate-50 py-4">
        <Text className="text-[11px] font-semibold text-slate-600">API_MODE: {API_MODE}</Text>
        {stations.isPending ? (
          <ActivityIndicator />
        ) : stations.isError ? (
          <Text className="text-xs text-red-600">
            {isApiError(stations.error)
              ? `${stations.error.code} (${stations.error.status})`
              : String(stations.error)}
          </Text>
        ) : (
          <Text className="text-xs text-slate-400">
            GET /stations → {stations.data.stations.map((s) => s.name).join(' · ')}
          </Text>
        )}
      </View>

      <Link href="/trips" className="mt-6 text-sm font-semibold text-sky-600">
        운행 목록으로 (M-02) →
      </Link>
    </Placeholder>
  )
}
