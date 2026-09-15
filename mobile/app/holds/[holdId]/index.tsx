import { Link, router, useLocalSearchParams, useNavigation } from 'expo-router'
import { useEffect } from 'react'
import { Alert, BackHandler } from 'react-native'

import { RequireAuth } from '@/auth/guard'
import { Placeholder } from '@/ui/Placeholder'

/**
 * `M-04` 선점 완료 · 승객 정보.
 *
 * ⚠️ **이 화면에서 뒤로 가면 선점이 붕 뜬다** (와이어프레임).
 *    좌석은 잡혀 있는데 화면은 떠나므로 **TTL 10분 동안 아무도 못 쓴다.**
 *    확인 시트를 띄우고, 사용자가 원하면 좌석 선택으로 돌려보내되 **선점은 유지**한다.
 *    해제(`F-06`)는 #43 이 붙인다.
 */
function HoldDetail() {
  const { holdId } = useLocalSearchParams<{ holdId: string }>()
  const navigation = useNavigation()

  // ⚠️ 안드로이드 하드웨어 뒤로가기. 헤더 뒤로가기와 별개 경로다 —
  //    둘 다 막지 않으면 한쪽으로 새어 나간다.
  useEffect(() => {
    const onBack = () => {
      Alert.alert('선점을 유지할까요?', '좌석 선택으로 돌아가도 선점은 10분간 유지됩니다.', [
        { text: '머무르기', style: 'cancel' },
        { text: '좌석 선택으로', onPress: () => navigation.goBack() },
      ])
      return true // 기본 동작을 막는다
    }

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack)
    return () => sub.remove()
  }, [navigation])

  return (
    <Placeholder
      id="M-04"
      title="선점 완료 · 승객 정보"
      note={`선점 ${holdId} · TTL 10분 · E-02 가 여기 뜬다 (#43)`}
    >
      <Link
        href={`/holds/${holdId}/payment`}
        className="mt-6 text-sm font-semibold text-sky-600"
        onPress={() => router.push(`/holds/${holdId}/payment`)}
      >
        결제로 (M-05) →
      </Link>
    </Placeholder>
  )
}

export default function Screen() {
  return (
    <RequireAuth>
      <HoldDetail />
    </RequireAuth>
  )
}
