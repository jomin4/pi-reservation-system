import { useState } from 'react'
import { FlatList, Modal, Pressable, Text, View } from 'react-native'

/**
 * 라벨 + 현재값 + `▼`. 누르면 목록이 아래에서 올라온다.
 *
 * ⚠️ **터치 표적을 키운다.** 와이어프레임 주석 — 웹은 출발·도착역을 한 줄에
 *    나란히 뒀지만 **모바일은 세로로 쌓는다.** 역명이 길어질 여지가 있고
 *    손가락이 커서 오탭이 난다.
 *
 * > **네이티브 Picker 를 안 썼다.** 안드로이드 기본 Picker 는 스타일이 갈리고
 * > NativeWind 가 안 먹는다. 목록이 짧아(역 4개 · 인원 6개) 모달 한 장이면 된다.
 */

export interface SelectOption {
  value: string
  label: string
  /** 보조 설명 — 역 코드 등 */
  hint?: string
}

export function SelectField({
  label,
  value,
  options,
  placeholder = '선택',
  onChange,
  disabled = false,
  testID,
}: {
  label: string
  value: string | null
  options: readonly SelectOption[]
  placeholder?: string
  onChange: (value: string) => void
  disabled?: boolean
  testID?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <View className="w-full">
      <Text className="mb-1 text-xs font-semibold text-slate-500">{label}</Text>

      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${selected?.label ?? placeholder}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        // ⚠️ py-4 — 44dp 이상. 와이어프레임의 "터치 표적을 키워야 한다"
        className={`w-full flex-row items-center justify-between rounded-xl border px-4 py-4 ${
          disabled ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white'
        }`}
      >
        <Text
          className={`text-base ${selected === undefined ? 'text-slate-300' : 'font-semibold text-slate-900'}`}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Text className="text-xs text-slate-400">▼</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/30" onPress={() => setOpen(false)}>
          {/* 시트 안을 눌렀을 때 닫히지 않게 이벤트를 삼킨다 */}
          <Pressable className="max-h-[70%] rounded-t-2xl bg-white pb-6 pt-3" onPress={() => {}}>
            <Text className="px-5 pb-2 pt-1 text-sm font-bold text-slate-900">{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(item.value)
                    setOpen(false)
                  }}
                  className="flex-row items-center justify-between px-5 py-4"
                >
                  <Text
                    className={`text-base ${item.value === value ? 'font-bold text-sky-600' : 'text-slate-800'}`}
                  >
                    {item.label}
                  </Text>
                  {item.hint === undefined ? null : (
                    <Text className="text-xs text-slate-400">{item.hint}</Text>
                  )}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}
