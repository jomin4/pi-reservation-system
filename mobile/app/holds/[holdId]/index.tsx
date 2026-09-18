import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'

import { api, isApiError } from '@/api'
import { RequireAuth } from '@/auth/guard'
import {
  HoldTimer,
  toDeadline,
  unitFare,
  useCountdown,
  type Hold,
  type MemberProfile,
} from '@/features/hold'
import { seatLabel } from '@/features/seats'
import { formatFare } from '@/features/trips'

/**
 * `M-04` 선점 완료 · 승객 정보 (`F-05` · `F-06`).
 *
 * > **타이머가 도는 화면**이다 (와이어프레임). 나머지는 읽기 전용이라,
 * > 이 화면의 설계는 사실상 **「남은 시간을 어떻게 정확히 보여주는가」** 하나다.
 *
 * ⚠️ **좌석이 10분 동안 묶인다.** 사용자가 그냥 나가면 그 10분 내내 아무도
 *    그 좌석을 못 산다 — 그래서 **나가는 길마다 물어본다.**
 */
function HoldDetail() {
  const { holdId } = useLocalSearchParams<{ holdId: string }>()
  const navigation = useNavigation()
  const queryClient = useQueryClient()

  /**
   * ⚠️ **넘겨받은 값을 쓰지 않고 서버에 다시 묻는다.**
   *
   * `M-03` 이 `POST /holds` 로 이미 같은 형태를 받았지만, 이 화면은 **앱이
   * 죽었다 살아나거나 딥링크로 바로 들어와도 같아야 한다.** 무엇보다
   * **만료 판정이 서버 몫**이다 — `expires_at` 이 지났으면 DB 가 아직 `HELD`
   * 여도 `410` 이다 (계약의 lazy 만료).
   *
   * 도착 시각을 같이 들고 다닌다. **기한을 기기 시계로 옮기는 데 쓴다.**
   */
  const hold = useQuery({
    queryKey: ['hold', holdId],
    queryFn: async () => ({
      data: await api.request<Hold>(`/holds/${holdId}`),
      receivedAt: Date.now(),
    }),
  })

  /**
   * ⚠️ **예매자 정보를 입력받지 않는다** (와이어프레임: 「회원 정보에서 자동으로
   *    채워집니다」). 예약의 `passengerName`·`passengerPhone` 은 **회원 정보의
   *    스냅샷**이다 (`data.md` §3). 여기서 따로 받으면 **내 예약인데 다른 이름**이
   *    찍힌다. 고치는 자리는 마이 화면이다.
   */
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.request<MemberProfile>('/me') })

  const deadline = hold.data === undefined ? null : toDeadline(hold.data.data, hold.data.receivedAt)
  const remaining = useCountdown(deadline)

  // 서버가 이미 죽었다고 답한 경우도 만료다 — 두 경로가 한 화면으로 모인다
  const expiredByServer = isApiError(hold.error) && hold.error.status === 410
  const expired = expiredByServer || (deadline !== null && remaining === 0)

  const tripId = hold.data?.data.tripId

  /**
   * 나간다. **좌석맵을 버리고** 간다 — 돌아간 화면이 방금 놓은 좌석을 여전히
   * `HELD` 로 그리면 사용자는 자기가 방금 푼 좌석을 남의 것으로 본다.
   */
  const leavingRef = useRef(false)
  const leave = useCallback((): void => {
    leavingRef.current = true
    if (tripId !== undefined) {
      void queryClient.invalidateQueries({ queryKey: ['seat-map', String(tripId)] })
    }
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [queryClient, tripId])

  /**
   * `F-06` 선점 해제 — **만료를 기다리지 않고 즉시 좌석을 돌려놓는다.**
   *
   * ⚠️ **`204` 는 멱등이다** (계약). 이미 만료·해제된 선점을 지워도 `410` 이
   *    아니라 `204` 다 — 덕분에 **「만료된 뒤 취소를 눌렀다」가 에러가 아니고**
   *    화면이 그 분기를 갖지 않는다.
   */
  const release = useMutation({
    mutationFn: () => api.request<void>(`/holds/${holdId}`, { method: 'DELETE' }),
    onSuccess: leave,
    onError: (error) =>
      Alert.alert(
        '선점을 해제하지 못했습니다',
        isApiError(error) ? `${error.code} · ${error.requestId}` : String(error),
      ),
  })

  const confirmRelease = useCallback((): void => {
    Alert.alert('선점을 취소할까요?', '좌석이 즉시 다른 분에게 열립니다.', [
      { text: '유지하기', style: 'cancel' },
      { text: '선점 취소', style: 'destructive', onPress: () => release.mutate() },
    ])
  }, [release])

  /**
   * ⚠️ **뒤로가기가 세 갈래다** — 헤더 버튼 · 스와이프 제스처 · 안드로이드
   *    하드웨어 키. `BackHandler` 는 **셋 중 하나만** 잡아서 나머지 둘로
   *    선점이 그대로 샜다. `beforeRemove` 는 **화면이 스택에서 빠지는 순간**을
   *    잡으므로 셋이 한 곳으로 모인다.
   *
   * 와이어프레임은 「확인 시트를 띄우거나 좌석 선택으로 돌아가되 선점은
   * 유지한다」로 **둘 다** 적어뒀다 — 둘 다 준다. **유지를 고르면 선점이 붕
   * 뜨므로**(진행 중인 선점으로 돌아오는 길은 `M-09` 상단 배너 · #48)
   * 문구로 선점이 살아 있다는 것을 분명히 말한다.
   */
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      // 우리가 보낸 이동(해제 완료 · 만료 후 나가기)은 그대로 통과시킨다
      if (leavingRef.current || expired) return

      e.preventDefault()
      Alert.alert('선점한 좌석이 있습니다', '나가도 선점은 남은 시간 동안 유지됩니다.', [
        { text: '머무르기', style: 'cancel' },
        { text: '선점 취소하고 나가기', style: 'destructive', onPress: () => release.mutate() },
        {
          text: '유지하고 나가기',
          onPress: () => {
            leavingRef.current = true
            navigation.dispatch(e.data.action)
          },
        },
      ])
    })

    return sub
  }, [navigation, expired, release])

  /** 만료되면 그 좌석은 이미 남의 것일 수 있다 — 좌석맵을 믿지 않는다 */
  useEffect(() => {
    if (!expired || tripId === undefined) return
    void queryClient.invalidateQueries({ queryKey: ['seat-map', String(tripId)] })
  }, [expired, tripId, queryClient])

  if (hold.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    )
  }

  if (hold.isError && !expiredByServer) {
    return (
      <View className="flex-1 gap-3 bg-white px-6 pt-10">
        <Text className="text-base font-bold text-slate-900">선점 정보를 불러오지 못했습니다</Text>
        <Text className="text-xs text-slate-500">
          {isApiError(hold.error)
            ? `${hold.error.code} · ${hold.error.requestId}`
            : String(hold.error)}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void hold.refetch()}
          className="mt-1 self-start rounded-lg bg-sky-600 px-4 py-2"
        >
          <Text className="text-xs font-semibold text-white">다시 시도</Text>
        </Pressable>
      </View>
    )
  }

  /**
   * ⚠️ **`E-02` 선점 만료 화면은 #52 가 만든다.** 여기서는 **조용히 넘어가지
   *    않는 것**까지만 한다 — 결제 버튼을 지우고 돌아갈 길을 준다.
   */
  if (expired) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
        <Text className="text-2xl font-bold text-slate-900">선점이 만료되었습니다</Text>
        <Text className="text-center text-sm leading-6 text-slate-500">
          10분이 지나 좌석이 반환되었습니다. 다시 선택해 주세요.
        </Text>
        <Pressable
          testID="back-to-seats"
          accessibilityRole="button"
          onPress={leave}
          className="mt-2 rounded-xl bg-sky-600 px-6 py-3"
        >
          <Text className="text-sm font-bold text-white">좌석 다시 고르기</Text>
        </Pressable>
      </View>
    )
  }

  // 위 세 분기(로딩 · 실패 · 만료)를 지나면 데이터가 있다. 타입에는 그게 안 보인다
  if (hold.data === undefined) return null

  const data = hold.data.data
  const perSeat = unitFare(data)

  return (
    <View className="flex-1 bg-slate-50">
      <HoldTimer remainingMs={remaining} />

      <ScrollView contentContainerClassName="p-4 gap-4">
        <View className="gap-1 rounded-xl border border-slate-200 bg-white px-4 py-4">
          <Text className="pb-1 text-xs font-semibold text-slate-400">선점한 좌석</Text>
          {data.seats.map((seat) => (
            <View
              key={`${seat.carNo}-${seat.rowNo}-${seat.colLetter}`}
              className="flex-row items-center justify-between py-1"
            >
              <Text className="text-sm font-semibold text-slate-900">{seatLabel(seat)}</Text>
              <Text className="text-sm text-slate-600">{formatFare(perSeat)}</Text>
            </View>
          ))}
        </View>

        <View className="gap-1 rounded-xl border border-slate-200 bg-white px-4 py-4">
          <Text className="pb-1 text-xs font-semibold text-slate-400">예매자 정보</Text>
          {me.isPending ? (
            <ActivityIndicator />
          ) : me.isError ? (
            <Text className="py-1 text-sm text-red-600">회원 정보를 불러오지 못했습니다</Text>
          ) : (
            <>
              <Row label="이름" value={me.data.name} />
              <Row label="연락처" value={me.data.phone} />
            </>
          )}
          <Text className="pt-2 text-[11px] text-slate-400">
            회원 정보에서 자동으로 채워집니다.
          </Text>
        </View>
      </ScrollView>

      {/* 하단 고정 — 타이머와 함께 스크롤 밖에 둔다 */}
      <View className="flex-row gap-2 border-t border-slate-200 bg-white px-4 pb-6 pt-3">
        <Pressable
          testID="release-hold"
          accessibilityRole="button"
          disabled={release.isPending}
          onPress={confirmRelease}
          className="items-center justify-center rounded-xl border border-slate-300 px-5 py-4"
        >
          <Text className="text-sm font-semibold text-slate-600">선점 취소</Text>
        </Pressable>

        <Pressable
          testID="to-payment"
          accessibilityRole="button"
          disabled={release.isPending}
          onPress={() => router.push(`/holds/${holdId}/payment`)}
          className={`flex-1 items-center rounded-xl py-4 ${
            release.isPending ? 'bg-slate-200' : 'bg-sky-600'
          }`}
        >
          <Text
            className={`text-base font-bold ${release.isPending ? 'text-slate-400' : 'text-white'}`}
          >
            결제 · {formatFare(data.totalFare)}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-sm text-slate-500">{label}</Text>
      <Text className="text-sm font-semibold text-slate-900">{value}</Text>
    </View>
  )
}

export default function Screen() {
  return (
    <RequireAuth>
      <HoldDetail />
    </RequireAuth>
  )
}
