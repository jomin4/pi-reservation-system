import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, Text, View } from 'react-native'

import { api, hasErrorCode, isApiError, isPaymentPending, isTimeout } from '@/api'
import type { components } from '@/api/schema'
import { RequireAuth } from '@/auth/guard'
import { HoldTimer, toDeadline, unitFare, useCountdown, type Hold } from '@/features/hold'
import { seatLabel } from '@/features/seats'
import { formatFare } from '@/features/trips'
import {
  awaitPaymentResult,
  createCheckout,
  discardIdempotencyKey,
  getOrCreateIdempotencyKey,
  type Reservation,
} from '@/payment'

type PaymentIntent = components['schemas']['PaymentIntentResponse']

/**
 * `M-05` 결제 (`F-08` · `F-10`).
 *
 * > **앱을 벗어나는 유일한 지점**이다 (와이어프레임). 결제창으로 가는 순간
 * > 앱이 백그라운드로 가고, SSE 가 끊기고, 타이머 인터벌이 멈추고,
 * > **OS 가 앱을 죽일 수도 있다.**
 *
 * 그래서 이 화면의 규칙은 셋이다.
 *
 * | 규칙 | 안 지키면 |
 * |---|---|
 * | 멱등키를 **진입 시 1회** 만들어 **영속 저장** | 복귀 후 재시도가 **새 결제**가 된다 |
 * | 답이 없으면 **`GET` 으로 묻는다** | `POST` 를 다시 불러 **이중 결제** |
 * | 복귀 시 **결제 결과를 먼저** 본다 | **승인된 건을 만료로 오판**한다 |
 */
function Payment() {
  const { holdId } = useLocalSearchParams<{ holdId: string }>()
  const navigation = useNavigation()
  const queryClient = useQueryClient()

  /** `M-04` 와 **같은 캐시 키**다 — 넘어오자마자 타이머가 이어진다 */
  const hold = useQuery({
    queryKey: ['hold', holdId],
    queryFn: async () => ({
      data: await api.request<Hold>(`/holds/${holdId}`),
      receivedAt: Date.now(),
    }),
  })

  const deadline = hold.data === undefined ? null : toDeadline(hold.data.data, hold.data.receivedAt)
  const remaining = useCountdown(deadline)

  const [expired, setExpired] = useState(false)
  const expiredByServer = isApiError(hold.error) && hold.error.status === 410
  const isExpired = expired || expiredByServer || (deadline !== null && remaining === 0)

  /**
   * ⚠️ **화면 진입 시 1회**다 (`api.md` §2 · 와이어프레임). 버튼을 누를 때마다
   *    만들면 재시도가 **새 결제**가 되고, 메모리에만 두면 **앱이 죽는 순간 사라진다.**
   *    `holdId` 에 묶여 SecureStore 에 남는다 (#84).
   */
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void getOrCreateIdempotencyKey(holdId).then((key) => {
      if (alive) setIdempotencyKey(key)
    })
    return () => {
      alive = false
    }
  }, [holdId])

  /**
   * `idle` 외에는 전부 **버튼이 잠긴 상태**다.
   *
   * ⚠️ **이중 제출은 UI 와 서버 양쪽에서 막는다** (와이어프레임). 서버 쪽이
   *    멱등키고, 여기가 UI 쪽이다 — 둘 중 하나만으로는 부족하다.
   */
  const [phase, setPhase] = useState<'idle' | 'intent' | 'checkout' | 'confirm' | 'polling'>('idle')
  const busy = phase !== 'idle'
  const busyRef = useRef(false)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  /** 결제창을 한 번이라도 연 뒤로는 **결과를 물을 의무**가 생긴다 */
  const attemptedRef = useRef(false)

  /**
   * ⚠️ **우리가 보낸 이동은 막지 않는다.** 아래 뒤로가기 가드가 `beforeRemove` 로
   *    거는데, **`replace` 도 이 화면을 스택에서 빼므로 같은 이벤트가 뜬다** —
   *    표시를 안 해두면 **확정 직후 예약 완료로 못 넘어가고 「결제를 처리하는
   *    중입니다」에 갇힌다.** (2026-09-18 에뮬레이터에서 실제로 갇혔다.)
   */
  const leavingRef = useRef(false)

  const expire = useCallback(async (): Promise<void> => {
    await discardIdempotencyKey(holdId)
    setPhase('idle')
    setExpired(true)
  }, [holdId])

  const succeed = useCallback(
    async (reservation: Reservation): Promise<void> => {
      leavingRef.current = true

      // 확정됐으면 키는 쓸모가 없다. 안 버리면 선점마다 하나씩 키체인에 쌓인다
      await discardIdempotencyKey(holdId)
      queryClient.removeQueries({ queryKey: ['hold', holdId] })
      // 좌석은 이제 SOLD 다 — 좌석맵을 들고 있으면 판 좌석을 빈자리로 그린다
      void queryClient.invalidateQueries({ queryKey: ['seat-map', String(reservation.tripId)] })

      // ⚠️ **`replace` 다.** `push` 면 예약 완료에서 뒤로가기로 결제 화면에 돌아온다
      router.replace(`/reservations/${reservation.reservationNo}/complete`)
    },
    [holdId, queryClient],
  )

  /** 답이 온 에러들. **여기 오면 결제는 끝난 것**이다 */
  const settle = useCallback(
    async (error: unknown): Promise<void> => {
      if (hasErrorCode(error, 'HOLD_EXPIRED')) {
        await expire()
        return
      }

      setPhase('idle')

      // ⚠️ **거절이어도 선점은 유지된다** (`PM-3`). 좌석 선택으로 되돌리면 안 된다
      if (hasErrorCode(error, 'PAYMENT_DECLINED')) {
        Alert.alert('결제가 거절되었습니다', '좌석은 그대로 있습니다. 다시 시도해 주세요.')
        return
      }

      Alert.alert(
        '결제를 마치지 못했습니다',
        isApiError(error) ? `${error.code} · ${error.requestId}` : String(error),
      )
    },
    [expire],
  )

  /**
   * **답을 모를 때만 온다** — `202` 이거나 응답 자체가 없었을 때.
   *
   * ⚠️ **`POST` 를 다시 부르지 않는다.** `GET /holds/{id}/payment` 로 **묻는다**.
   */
  const poll = useCallback(
    async (initialDelayMs: number): Promise<void> => {
      setPhase('polling')
      try {
        await succeed(await awaitPaymentResult(holdId, { initialDelayMs }))
      } catch (error) {
        if (isPaymentPending(error) || isTimeout(error)) {
          setPhase('idle')
          // ⚠️ `E-03` 결제 타임아웃 화면은 #53 이 만든다. 지금은 **조용히 성공한 척을
          //    하지 않는 것**까지만 — 여기서 완료 화면으로 넘기면 최악이다.
          Alert.alert(
            '결제 결과를 확인하지 못했습니다',
            '결제가 되었을 수도 있습니다. 다시 결제하지 마시고 예약 목록에서 확인해 주세요.',
          )
          return
        }
        await settle(error)
      }
    },
    [holdId, succeed, settle],
  )

  async function pay(): Promise<void> {
    if (busy || idempotencyKey === null) return

    try {
      // 1단계 — **금액을 서버가 정한다** (`api.md` §5.3). 클라이언트가 보낸 금액을
      //         그대로 믿으면 위변조 여지가 생긴다
      setPhase('intent')
      const intent = await api.request<PaymentIntent>(`/holds/${holdId}/payment-intent`, {
        method: 'POST',
      })

      // 2단계 — 결제창. **여기서 앱이 밖으로 나간다**
      setPhase('checkout')
      attemptedRef.current = true
      const result = await createCheckout().open(intent)

      if (result.outcome === 'cancelled') {
        // 취소는 에러가 아니다. 화면에 그대로 머문다 — 선점도 살아 있다
        setPhase('idle')
        return
      }
      if (result.outcome === 'failed') {
        setPhase('idle')
        Alert.alert('결제창에서 처리하지 못했습니다', result.message)
        return
      }

      // 3단계 — **승인 확정은 서버가 한다.** 멱등키가 여기 실린다
      setPhase('confirm')
      const reservation = await api.request<Reservation>(`/holds/${holdId}/payment`, {
        method: 'POST',
        body: { paymentKey: result.paymentKey, orderId: intent.orderId, amount: intent.amount },
        idempotencyKey,
      })

      await succeed(reservation)
    } catch (error) {
      // `202` 는 2xx 인데도 던져진다 — 성공으로 흘려보내면 안 되기 때문이다
      if (isPaymentPending(error)) {
        await poll((error.retryAfterSeconds ?? 2) * 1000)
        return
      }
      // ⚠️ **답이 없는 것과 답이 온 것은 다르다.** 서버가 처리했는지 모른다
      if (isTimeout(error)) {
        await poll(0)
        return
      }
      await settle(error)
    }
  }

  /**
   * ⚠️ **복귀 순서가 정해져 있다** (와이어프레임): **① 선점이 아직 유효한가
   *    ② 결제가 이미 승인됐는가 — 단, ②를 먼저 확인한다.** 순서를 뒤집으면
   *    **승인된 건을 만료로 오판**한다. 결제창에 있는 동안 10분이 지나기 쉽다.
   *
   * > 백그라운드 복귀의 나머지(SSE 재연결 · 좌석맵 재조회)는 `E-04`(#54)다.
   *   여기서 하는 건 **돈이 걸린 한 가지**뿐이다.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      if (!attemptedRef.current || busyRef.current) return
      void poll(0)
    })
    return () => sub.remove()
  }, [poll])

  /** 처리 중에 나가면 결과를 받을 화면이 사라진다 — 세 갈래를 한 곳에서 막는다 */
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current || !busyRef.current) return
      e.preventDefault()
      Alert.alert('결제를 처리하는 중입니다', '잠시만 기다려 주세요.')
    })
    return sub
  }, [navigation])

  if (hold.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    )
  }

  if (isExpired) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-white px-8">
        <Text className="text-2xl font-bold text-slate-900">선점이 만료되었습니다</Text>
        <Text className="text-center text-sm leading-6 text-slate-500">
          결제 전에 10분이 지나 좌석이 반환되었습니다. 결제는 진행되지 않았습니다.
        </Text>
        <Pressable
          testID="back-to-seats"
          accessibilityRole="button"
          onPress={() => router.replace('/')}
          className="mt-2 rounded-xl bg-sky-600 px-6 py-3"
        >
          <Text className="text-sm font-bold text-white">처음부터 다시</Text>
        </Pressable>
      </View>
    )
  }

  if (hold.isError || hold.data === undefined) {
    return (
      <View className="flex-1 gap-3 bg-white px-6 pt-10">
        <Text className="text-base font-bold text-slate-900">선점 정보를 불러오지 못했습니다</Text>
        <Text className="text-xs text-slate-500">
          {isApiError(hold.error) ? `${hold.error.code} · ${hold.error.requestId}` : '알 수 없음'}
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

  const data = hold.data.data
  const perSeat = unitFare(data)

  return (
    <View className="flex-1 bg-slate-50">
      <HoldTimer remainingMs={remaining} />

      <ScrollView contentContainerClassName="p-4 gap-4">
        <View className="gap-1 rounded-xl border border-slate-200 bg-white px-4 py-4">
          <Text className="pb-1 text-xs font-semibold text-slate-400">결제 내역</Text>

          {/**
           * ⚠️ **열차·일시를 여기 못 그린다.** 와이어프레임은 「KTX 101 · 서울 →
           *    부산」을 넣지만 **`HoldResponse` 에 그 정보가 없다** (`tripId` 뿐).
           *    `M-03` 에서 params 로 실어 보낼 수는 있으나 **앱 재시작·딥링크로
           *    들어오면 사라지는 값**이라 화면의 진실로 삼을 수 없다 — `M-04` 에서
           *    이미 거부한 판단이다. **계약에 없는 걸 지어내지 않는다** —
           *    그리려면 `HoldResponse` 를 고치는 PR 이 먼저다 (`CLAUDE.md`).
           */}
          {data.seats.map((seat) => (
            <View
              key={`${seat.carNo}-${seat.rowNo}-${seat.colLetter}`}
              className="flex-row items-center justify-between py-1"
            >
              <Text className="text-sm font-semibold text-slate-900">{seatLabel(seat)}</Text>
              <Text className="text-sm text-slate-600">{formatFare(perSeat)}</Text>
            </View>
          ))}

          <View className="mt-2 flex-row items-center justify-between border-t border-slate-100 pt-3">
            <Text className="text-sm text-slate-500">결제 금액</Text>
            <Text className="text-base font-bold text-slate-900">{formatFare(data.totalFare)}</Text>
          </View>
        </View>

        <View className="gap-2 rounded-xl border border-slate-200 bg-white px-4 py-4">
          <Text className="text-xs font-semibold text-slate-400">결제 수단</Text>
          {/* ⚠️ 카드·계좌 선택은 **결제창이 한다.** 여기서 고르게 하면 두 곳에서 묻는 꼴 */}
          <Text className="text-sm font-semibold text-slate-900">토스페이먼츠</Text>
          <Text className="text-[11px] leading-5 text-slate-400">
            결제창으로 이동합니다. 결제를 마치면 앱으로 자동 복귀합니다.{' '}
            <Text className="font-semibold text-slate-500">복귀 전에 앱을 종료하지 마세요.</Text>
          </Text>
        </View>
      </ScrollView>

      <View className="border-t border-slate-200 bg-white px-4 pb-6 pt-3">
        <Pressable
          testID="pay"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || idempotencyKey === null }}
          disabled={busy || idempotencyKey === null}
          onPress={() => void pay()}
          className={`w-full items-center rounded-xl py-4 ${
            busy || idempotencyKey === null ? 'bg-slate-200' : 'bg-sky-600'
          }`}
        >
          {busy ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color="#64748b" />
              <Text className="text-sm font-semibold text-slate-500">{phaseLabel(phase)}</Text>
            </View>
          ) : (
            <Text className="text-base font-bold text-white">
              {formatFare(data.totalFare)} 결제하기
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

/** **무엇을 기다리는지 말해준다.** 결제에서 말 없는 스피너는 재시도를 부른다 */
function phaseLabel(phase: 'idle' | 'intent' | 'checkout' | 'confirm' | 'polling'): string {
  switch (phase) {
    case 'intent':
      return '결제 정보를 준비하는 중'
    case 'checkout':
      return '결제창을 여는 중'
    case 'confirm':
      return '결제를 확정하는 중'
    case 'polling':
      return '결제 결과를 확인하는 중'
    default:
      return ''
  }
}

export default function Screen() {
  return (
    <RequireAuth>
      <Payment />
    </RequireAuth>
  )
}
