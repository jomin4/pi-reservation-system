import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'

import { api, isApiError } from '@/api'
import {
  ERROR_MESSAGE,
  MAX_PASSENGERS,
  formatBusinessDate,
  toBusinessDate,
  toTripsQuery,
  upcomingBusinessDates,
  validateSearchForm,
  type SearchForm,
} from '@/features/search'
import { SelectField, type SelectOption } from '@/ui/SelectField'

interface Station {
  code: string
  name: string
  lineSeq: number
}

/**
 * `M-01` 홈 · 열차 조회 (`F-01` · `F-02`).
 *
 * > **앱 진입 첫 화면. 탭바 기반.** 웹은 출발·도착역을 한 줄에 나란히 뒀지만
 * > **모바일은 세로로 쌓는다** — 역명이 길어질 여지가 있고 터치 표적을 키워야 한다.
 *
 * ⚠️ **비로그인으로도 조회는 된다.** 로그인은 `M-03` 선점 시점에 요구한다.
 *    그래서 이 화면은 `RequireAuth` 로 감싸지 않는다.
 */
export default function Home() {
  const stations = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.request<{ stations: Station[] }>('/stations'),
  })

  const [form, setForm] = useState<SearchForm>({
    from: null,
    to: null,
    date: toBusinessDate(),
    passengers: 1,
  })
  const [touched, setTouched] = useState(false)

  const stationOptions: SelectOption[] = useMemo(
    () =>
      (stations.data?.stations ?? [])
        .slice()
        .sort((a, b) => a.lineSeq - b.lineSeq)
        .map((s) => ({ value: s.code, label: s.name, hint: s.code })),
    [stations.data],
  )

  const dateOptions: SelectOption[] = useMemo(
    () => upcomingBusinessDates().map((d) => ({ value: d, label: formatBusinessDate(d) })),
    [],
  )

  const passengerOptions: SelectOption[] = useMemo(
    () =>
      Array.from({ length: MAX_PASSENGERS }, (_, i) => ({
        value: String(i + 1),
        label: `${i + 1}명`,
      })),
    [],
  )

  const error = validateSearchForm(form)

  function submit(): void {
    setTouched(true)
    if (error !== null) return
    // ⚠️ 역 **이름**도 같이 넘긴다. `M-02` 헤더가 `서울 → 부산` 이어야 하는데
    //    코드만 넘기면 그 화면이 /stations 를 한 번 더 부르게 된다.
    const nameOf = (code: string | null) =>
      stationOptions.find((o) => o.value === code)?.label ?? code ?? ''

    router.push({
      pathname: '/trips',
      params: {
        ...toTripsQuery(form),
        fromName: nameOf(form.from),
        toName: nameOf(form.to),
      },
    })
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 pb-10 pt-4 gap-4"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-2xl font-bold text-slate-900">예매</Text>

      {stations.isPending ? (
        <View className="items-center py-10">
          <ActivityIndicator />
        </View>
      ) : stations.isError ? (
        // ⚠️ 목이 `status` 를 조작할 수 있어서 이 분기를 백엔드보다 먼저 만든다 (`api.md` §7.2)
        <View className="gap-2 rounded-xl bg-red-50 px-4 py-5">
          <Text className="text-sm font-semibold text-red-700">역 목록을 불러오지 못했습니다</Text>
          <Text className="text-xs text-red-500">
            {isApiError(stations.error)
              ? `${stations.error.code} · ${stations.error.requestId}`
              : String(stations.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void stations.refetch()}
            className="mt-1 self-start rounded-lg bg-red-600 px-4 py-2"
          >
            <Text className="text-xs font-semibold text-white">다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ⚠️ 세로로 쌓는다 — 와이어프레임 주석 */}
          <SelectField
            testID="field-from"
            label="출발역"
            value={form.from}
            options={stationOptions}
            onChange={(from) => setForm((f) => ({ ...f, from }))}
          />
          <SelectField
            testID="field-to"
            label="도착역"
            value={form.to}
            options={stationOptions}
            onChange={(to) => setForm((f) => ({ ...f, to }))}
          />
          <SelectField
            testID="field-date"
            label="출발일"
            value={form.date}
            options={dateOptions}
            onChange={(date) => setForm((f) => ({ ...f, date }))}
          />
          <SelectField
            testID="field-passengers"
            label={`인원 (최대 ${MAX_PASSENGERS}명)`}
            value={String(form.passengers)}
            options={passengerOptions}
            onChange={(v) => setForm((f) => ({ ...f, passengers: Number(v) }))}
          />

          {touched && error !== null ? (
            <Text className="text-xs font-semibold text-red-600">{ERROR_MESSAGE[error]}</Text>
          ) : null}

          <Pressable
            testID="submit-search"
            accessibilityRole="button"
            onPress={submit}
            className={`mt-2 w-full items-center rounded-xl py-4 ${
              error === null ? 'bg-sky-600' : 'bg-slate-200'
            }`}
          >
            <Text
              className={`text-base font-bold ${error === null ? 'text-white' : 'text-slate-400'}`}
            >
              열차 조회
            </Text>
          </Pressable>

          <Text className="text-center text-[11px] text-slate-400">
            로그인 없이 조회할 수 있습니다. 좌석 선점부터 로그인이 필요합니다.
          </Text>
        </>
      )}
    </ScrollView>
  )
}
