import { Text, View } from 'react-native'

import { API_BASE_URL, API_MODE } from '@/config/env'

/**
 * 스캐폴드 확인용 화면. `M-01` 홈·열차 조회가 이 자리를 가져간다 (#40).
 *
 * 지금 보여주는 건 하나다 — **NativeWind 가 실제로 적용됐는가**와
 * **EXPO_PUBLIC_ 스위치가 읽혔는가**. 둘 다 스캐폴드에서만 틀어지는 것들이다.
 */
export default function Home() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-white">
      <Text className="text-2xl font-bold text-slate-900">pi-reservation</Text>
      <Text className="text-sm text-slate-500">
        API_MODE: <Text className="font-semibold">{API_MODE}</Text>
      </Text>
      <Text className="text-xs text-slate-400">{API_BASE_URL}</Text>
    </View>
  )
}
