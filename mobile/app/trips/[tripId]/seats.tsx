import { useMutation, useQuery } from '@tanstack/react-query'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'

import { api, isApiError, isSeatConflict } from '@/api'
import { useAuthStatus } from '@/auth/useAuth'
import {
  MAX_SEATS,
  SeatGrid,
  SeatLegend,
  applySeatDelta,
  findTakenSeats,
  summarize,
  toggleSeat,
  type SeatAddress,
  type SeatMap,
} from '@/features/seats'
import { formatFare } from '@/features/trips'
import { createSeatEventSource, type ConnectionState } from '@/sse'

/**
 * `M-03` 좌석 선택 (`F-03` · `F-04` · `F-16` · `F-17`).
 *
 * > **모바일 설계의 핵심.** 좌석 격자를 좁은 화면에 어떻게 넣는가 — 격자 자체는
 * > `SeatGrid` 가 갖고, 이 파일은 **조회 · 실시간 · 선택 · 선점**을 엮는다.
 *
 * ⚠️ **공개 화면이다.** 로그인은 **선점 버튼**에서 요구한다 (와이어프레임 ·
 *    `api.md` §5.1). 화면 단위로 막으면 비로그인 조회가 되는 설계와 어긋난다.
 */
export default function Seats() {
  const { tripId, passengers, fare: fareParam } = useLocalSearchParams<{
    tripId: string
    passengers?: string
    fare?: string
  }>()
  const numericTripId = Number(tripId)
  const authStatus = useAuthStatus()

  const [selected, setSelected] = useState<SeatAddress[]>([])
  const [carNo, setCarNo] = useState<number | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')

  const snapshot = useQuery({
    queryKey: ['seat-map', tripId],
    queryFn: () => api.request<SeatMap>(`/trips/${tripId}/seats`),
  })

  /**
   * ⚠️ **스냅샷을 상태로 복사하지 않는다.**
   *
   * `useEffect` 로 `setLive(snapshot.data)` 를 하면 **800석이 두 번 렌더된다** —
   * 조회 직후 한 번, 복사 직후 또 한 번. 린트가 이걸 잡는다
   * (`react-hooks/set-state-in-effect`).
   *
   * 대신 **스냅샷을 base 로 두고 델타 패치만 상태로 갖는다.** 재조회로 base 가
   * 바뀌면 `patch.base !== snapshot.data` 가 되어 **패치가 저절로 버려진다** —
   * 무효화를 따로 안 해도 된다.
   */
  const [patch, setPatch] = useState<{ base: SeatMap; map: SeatMap } | null>(null)
  const base = snapshot.data ?? null
  const live = patch !== null && patch.base === base ? patch.map : base

  // ⚠️ ref 를 **렌더 중에** 쓰지 않는다. effect 에서만 맞춘다 —
  //    ref 갱신은 리렌더를 안 일으키므로 위의 setState 문제와는 다른 이야기다.
  const baseRef = useRef<SeatMap | null>(base)
  useEffect(() => {
    baseRef.current = base
  }, [base])

  /**
   * ⚠️ **`lastEventId` 로 구독을 시작한다** (`api.md` §6.3).
   *
   * > 이 값을 `Last-Event-ID` 로 넘기면 **좌석맵과 SSE 사이에 구멍이 없다.**
   *
   * 스냅샷을 받은 뒤 구독하기까지의 틈에 팔린 좌석이 **그 사이에 끼는데**,
   * 서버가 그 지점부터 재생해 주므로 메워진다.
   */
  const startedFrom = snapshot.data?.lastEventId
  useEffect(() => {
    if (startedFrom === undefined) return

    const source = createSeatEventSource()
    const offState = source.onConnectionChange(setConnection)
    const offSeat = source.onSeatChanged((delta) => {
      setPatch((prev) => {
        const b = baseRef.current
        if (b === null) return prev
        const current = prev !== null && prev.base === b ? prev.map : b
        const next = applySeatDelta(current, delta)
        // 바뀐 게 없으면 상태를 안 건드린다 — 800석 리렌더를 아낀다
        return next === current ? prev : { base: b, map: next }
      })
    })
    const offResume = source.onResumeFailed(() => {
      // ⚠️ 재개 실패를 성공인 척하면 좌석맵에 구멍이 남는다 (`features.md` F-19).
      //    전체 재조회가 유일한 복구다.
      void snapshot.refetch()
    })

    source.subscribe(numericTripId, startedFrom)

    return () => {
      offState()
      offSeat()
      offResume()
      source.close()
    }
    // snapshot.refetch 는 안정적이지 않아 의존성에서 뺀다 — ref 로 잡을 만큼 무겁지 않다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericTripId, startedFrom])

  // ⚠️ 호차 기본값도 effect 로 세팅하지 않는다. **파생하면 그만이다**
  const cars = useMemo(() => live?.cars ?? [], [live])
  const currentCar = useMemo(
    () => cars.find((c) => c.carNo === carNo) ?? cars[0],
    [cars, carNo],
  )

  /**
   * ⚠️ **내가 고른 좌석을 남이 가져갔는지 본다.**
   *
   * 선택은 예약이 아니다. 고르는 동안 남이 `POST /holds` 로 가져갈 수 있고,
   * **그게 이 프로젝트가 증명하려는 경합이다.** 알려주지 않으면 사용자는
   * `409` 를 받고 나서야 안다.
   */
  const warnedRef = useRef<string>('')
  useEffect(() => {
    if (live === null || selected.length === 0) return

    const taken = findTakenSeats(live, selected)
    if (taken.length === 0) return

    const key = summarize(taken)
    if (warnedRef.current === key) return
    warnedRef.current = key

    setSelected((prev) => prev.filter((s) => !taken.some((t) => summarize([t]) === summarize([s]))))
    Alert.alert('좌석이 다른 분에게 넘어갔습니다', `${key} 는 선택에서 빠집니다.`)
  }, [live, selected])

  const hold = useMutation({
    mutationFn: (seats: SeatAddress[]) =>
      api.request<{ holdId: string }>('/holds', {
        method: 'POST',
        body: { tripId: numericTripId, seats },
      }),
    onSuccess: (res) => router.push(`/holds/${res.holdId}`),
    onError: (error) => {
      // ⚠️ `E-01` 좌석 충돌 화면은 #51 이 만든다. 지금은 **조용히 넘어가지 않는 것**만 한다.
      if (isSeatConflict(error)) {
        void snapshot.refetch()
        setSelected([])
        Alert.alert('좌석을 잡지 못했습니다', '다른 분이 먼저 선점했습니다. 다시 골라주세요.')
        return
      }
      Alert.alert(
        '선점에 실패했습니다',
        isApiError(error) ? `${error.code} · ${error.requestId}` : String(error),
      )
    },
  })

  const onToggle = useCallback((seat: SeatAddress) => {
    setSelected((prev) => {
      const result = toggleSeat(prev, seat)
      if (result.rejected) {
        Alert.alert('좌석은 최대 6석까지', `한 번에 ${MAX_SEATS}석까지 선점할 수 있습니다.`)
      }
      return result.seats
    })
  }, [])

  /**
   * ⚠️ **운임은 `M-02` 가 넘긴 값이다.** 여기서 상수로 박으면 요금이 바뀌는 날
   *    **조용히 틀린 금액**을 보여준다 — 계약이 운행마다 `fare` 를 주는 이유다.
   */
  const unitFare = Number(fareParam ?? '0')
  const fare = unitFare * selected.length

  function submit(): void {
    if (selected.length === 0) return

    // ⚠️ **선점 시점에 로그인을 요구한다** — 화면 진입이 아니라 여기서.
    if (authStatus !== 'authed') {
      // ⚠️ **조건을 `next` 에 실어 보낸다.** 경로만 넘기면 로그인하고 돌아왔을 때
      //    운임·인원이 사라져 버튼이 **`좌석 선점하기 · 0원`** 이 된다
      //    (2026-09-17 에뮬레이터에서 확인).
      const query = new URLSearchParams({
        passengers: passengers ?? '1',
        fare: String(unitFare),
      }).toString()

      router.push({
        pathname: '/login',
        params: { next: `/trips/${tripId}/seats?${query}` },
      })
      return
    }

    hold.mutate(selected)
  }

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen options={{ headerRight: () => <LiveBadge state={connection} /> }} />

      {snapshot.isPending || live === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : snapshot.isError ? (
        <View className="m-4 gap-2 rounded-xl bg-red-50 px-4 py-5">
          <Text className="text-sm font-semibold text-red-700">좌석맵을 불러오지 못했습니다</Text>
          <Text className="text-xs text-red-500">
            {isApiError(snapshot.error)
              ? `${snapshot.error.code} · ${snapshot.error.requestId}`
              : String(snapshot.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void snapshot.refetch()}
            className="mt-1 self-start rounded-lg bg-red-600 px-4 py-2"
          >
            <Text className="text-xs font-semibold text-white">다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <CarPicker cars={cars.map((c) => c.carNo)} current={currentCar?.carNo ?? 1} onChange={setCarNo} />

          {currentCar === undefined ? null : (
            <SeatGrid car={currentCar} selected={selected} onToggle={onToggle} />
          )}

          <SeatLegend />

          {/* ⚠️ 하단 고정 — 좌석을 스크롤하는 동안에도 `2 / 6` 과 금액이 항상 보여야 한다 */}
          <View className="gap-2 border-t border-slate-200 bg-white px-4 pb-6 pt-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-slate-900">
                {selected.length === 0 ? '좌석을 선택하세요' : summarize(selected)}
              </Text>
              <Text className="text-xs text-slate-500">
                {selected.length} / {MAX_SEATS}
                {passengers === undefined ? '' : ` · 인원 ${passengers}명`}
              </Text>
            </View>

            <Pressable
              testID="submit-hold"
              accessibilityRole="button"
              disabled={selected.length === 0 || hold.isPending}
              onPress={submit}
              className={`w-full items-center rounded-xl py-4 ${
                selected.length === 0 || hold.isPending ? 'bg-slate-200' : 'bg-sky-600'
              }`}
            >
              {hold.isPending ? (
                <ActivityIndicator color="#64748b" />
              ) : (
                <Text
                  className={`text-base font-bold ${
                    selected.length === 0 ? 'text-slate-400' : 'text-white'
                  }`}
                >
                  좌석 선점하기{selected.length === 0 ? '' : ` · ${formatFare(fare)}`}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

/**
 * `F-16` 실시간 배지 — **내비게이션 바에 올렸다.**
 *
 * > 공간이 좁아 「실시간 연결됨」 대신 **「실시간」** 으로 줄였고,
 * > **끊기면 빨강 + 「재연결 중」** 으로 바뀐다 (와이어프레임).
 */
function LiveBadge({ state }: { state: ConnectionState }) {
  const open = state === 'open'

  return (
    <View
      className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${
        open ? 'bg-emerald-50' : 'bg-red-50'
      }`}
    >
      <View className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <Text className={`text-[11px] font-semibold ${open ? 'text-emerald-700' : 'text-red-600'}`}>
        {open ? '실시간' : '재연결 중'}
      </Text>
    </View>
  )
}

/**
 * ⚠️ **18호차를 탭으로 나열할 수 없다** (와이어프레임).
 *    현재 호차 **주변만** 보이고 화살표로 넘긴다.
 */
function CarPicker({
  cars,
  current,
  onChange,
}: {
  cars: number[]
  current: number
  onChange: (carNo: number) => void
}) {
  const index = Math.max(0, cars.indexOf(current))
  const window = cars.slice(Math.max(0, index - 1), Math.max(0, index - 1) + 3)

  return (
    <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
      <Pressable
        testID="car-prev"
        accessibilityRole="button"
        accessibilityLabel="이전 호차"
        disabled={index === 0}
        onPress={() => onChange(cars[index - 1] ?? current)}
        className="px-2 py-1"
      >
        <Text className={`text-base ${index === 0 ? 'text-slate-300' : 'text-sky-600'}`}>◀</Text>
      </Pressable>

      <View className="flex-row gap-2">
        {window.map((no) => (
          <Pressable
            key={no}
            testID={`car-${no}`}
            accessibilityRole="button"
            accessibilityState={{ selected: no === current }}
            onPress={() => onChange(no)}
            className={`rounded-lg px-4 py-2 ${no === current ? 'bg-sky-600' : 'bg-slate-100'}`}
          >
            <Text
              className={`text-sm font-semibold ${no === current ? 'text-white' : 'text-slate-600'}`}
            >
              {no}호차
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        testID="car-next"
        accessibilityRole="button"
        accessibilityLabel="다음 호차"
        disabled={index >= cars.length - 1}
        onPress={() => onChange(cars[index + 1] ?? current)}
        className="px-2 py-1"
      >
        <Text
          className={`text-base ${index >= cars.length - 1 ? 'text-slate-300' : 'text-sky-600'}`}
        >
          ▶
        </Text>
      </Pressable>
    </View>
  )
}
