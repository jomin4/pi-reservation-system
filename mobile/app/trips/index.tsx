import { useQuery } from '@tanstack/react-query'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'

import { api, isApiError } from '@/api'
import { toBusinessDate } from '@/features/search'
import {
  formatDuration,
  formatFare,
  shiftBusinessDate,
  toKstTime,
  toShortDate,
} from '@/features/trips'

interface Trip {
  tripId: number
  trainNo: string
  departAt: string
  arriveAt: string
  durationMinutes: number
  availableSeats: number
  fare: number
}

/**
 * `M-02` 운행 목록 (`F-02`).
 *
 * > **표를 카드로 바꿨다.** 웹의 6열 표는 375px 에서 열이 뭉개진다.
 * > **카드 하나가 통째로 터치 표적이 되어 「선택」 버튼도 필요 없다.**
 *
 * ⚠️ **이 화면에는 SSE 를 붙이지 않는다** (와이어프레임 · 웹과 동일).
 *    잔여석은 **Redis 캐시 근사값**이고, 목록을 실시간으로 떨게 만들 값이 없다.
 *    실시간은 좌석맵(`M-03`)의 일이다.
 */
export default function Trips() {
  const params = useLocalSearchParams<{
    from?: string
    to?: string
    date?: string
    passengers?: string
    fromName?: string
    toName?: string
  }>()

  const from = params.from ?? ''
  const to = params.to ?? ''
  const date = params.date ?? toBusinessDate()
  const passengers = params.passengers ?? '1'

  const trips = useQuery({
    queryKey: ['trips', from, to, date, passengers],
    queryFn: () =>
      api.request<{ trips: Trip[] }>(
        `/trips?from=${from}&to=${to}&date=${date}&passengers=${passengers}`,
      ),
    enabled: from !== '' && to !== '',
  })

  /** ⚠️ 조건을 바꿔도 화면을 새로 쌓지 않는다. `replace` 라 뒤로가기는 `M-01` 로 간다 */
  function shiftDate(days: number): void {
    router.replace({
      pathname: '/trips',
      params: { ...params, date: shiftBusinessDate(date, days) },
    })
  }

  const today = toBusinessDate()
  const canGoPrev = date > today

  return (
    <View className="flex-1 bg-slate-50">
      {/* 검색 조건은 내비게이션 바로 올려 본문 공간을 벌었다 — 와이어프레임 */}
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <Text className="text-base font-bold text-slate-900">
                {params.fromName ?? from} → {params.toName ?? to}
              </Text>
              <Text className="text-[11px] text-slate-500">
                {toShortDate(date)} · {passengers}명
              </Text>
            </View>
          ),
        }}
      />

      <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Pressable
          testID="prev-day"
          accessibilityRole="button"
          disabled={!canGoPrev}
          onPress={() => shiftDate(-1)}
          className="px-2 py-1"
        >
          <Text className={`text-sm ${canGoPrev ? 'text-sky-600' : 'text-slate-300'}`}>
            ◀ 이전날
          </Text>
        </Pressable>
        <Pressable
          testID="next-day"
          accessibilityRole="button"
          onPress={() => shiftDate(1)}
          className="px-2 py-1"
        >
          <Text className="text-sm text-sky-600">다음날 ▶</Text>
        </Pressable>
      </View>

      {trips.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : trips.isError ? (
        <View className="m-4 gap-2 rounded-xl bg-red-50 px-4 py-5">
          <Text className="text-sm font-semibold text-red-700">운행을 불러오지 못했습니다</Text>
          <Text className="text-xs text-red-500">
            {isApiError(trips.error)
              ? `${trips.error.code} · ${trips.error.requestId}`
              : String(trips.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void trips.refetch()}
            className="mt-1 self-start rounded-lg bg-red-600 px-4 py-2"
          >
            <Text className="text-xs font-semibold text-white">다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={trips.data.trips}
          keyExtractor={(t) => String(t.tripId)}
          contentContainerClassName="p-4 gap-3"
          // ⚠️ **결과가 없으면 빈 배열이다. `404` 가 아니다** (계약) — 빈 화면을 따로 만든다
          ListEmptyComponent={
            <View className="items-center gap-2 py-16">
              <Text className="text-sm font-semibold text-slate-600">해당 조건의 운행이 없습니다</Text>
              <Text className="text-xs text-slate-400">날짜를 바꿔보세요</Text>
            </View>
          }
          ListFooterComponent={
            trips.data.trips.length === 0 ? null : (
              // ⚠️ 계약이 못박은 것 — 잔여석은 판정 근거가 아니다
              <Text className="pt-2 text-center text-[11px] text-slate-400">
                잔여석은 실시간 근사값입니다. 좌석은 선점 시점에 확정됩니다.
              </Text>
            )
          }
          renderItem={({ item }) => <TripCard trip={item} passengers={passengers} />}
        />
      )}
    </View>
  )
}

function TripCard({ trip, passengers }: { trip: Trip; passengers: string }) {
  const soldOut = trip.availableSeats === 0

  return (
    <Pressable
      testID={`trip-${trip.tripId}`}
      accessibilityRole="button"
      accessibilityLabel={`KTX ${trip.trainNo} ${toKstTime(trip.departAt)} 출발 ${
        soldOut ? '매진' : `잔여 ${trip.availableSeats}석`
      }`}
      // ⚠️ **매진이어도 누를 수 있다.** 흐리게 하되 막지 않는다 —
      //    와이어프레임: "목록에서 지우지 않는다 — 취소분이 돌아올 수 있다".
      //    막아버리면 돌아온 좌석을 잡을 길이 없다.
      onPress={() =>
        router.push({ pathname: `/trips/${trip.tripId}/seats`, params: { passengers } })
      }
      className={`rounded-xl border border-slate-200 bg-white px-4 py-4 ${soldOut ? 'opacity-50' : ''}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-bold text-slate-900">KTX {trip.trainNo}</Text>
        <Text
          className={`text-sm font-semibold ${soldOut ? 'text-slate-400' : 'text-sky-600'}`}
        >
          {soldOut ? '매진' : `잔여 ${trip.availableSeats}석`}
        </Text>
      </View>

      <Text className="mt-1 text-sm text-slate-700">
        {toKstTime(trip.departAt)} → {toKstTime(trip.arriveAt)} ·{' '}
        {formatDuration(trip.durationMinutes)}
      </Text>

      <Text className="mt-1 text-xs text-slate-400">{formatFare(trip.fare)} / 1인</Text>
    </Pressable>
  )
}
