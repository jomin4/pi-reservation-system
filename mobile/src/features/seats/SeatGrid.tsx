import { useMemo } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { isSelected } from './selection'
import { COLUMNS, seatLabel, type Car, type Seat, type SeatAddress } from './types'

/**
 * ⚠️ **핵심 결정 — 가로 격자를 세로로 돌렸다** (와이어프레임).
 *
 * > 웹은 **진행방향이 가로**라 한 호차가 좌우로 길게 놓인다. **375px 에서는 그대로 못 넣는다.**
 * > 모바일은 **진행방향을 위로 세우고 4열(A B · 통로 · C D) 고정, 세로 스크롤**로 바꿨다.
 *
 * | 버린 대안 | 왜 |
 * |---|---|
 * | 가로 스크롤 유지 | **양방향이 되면 지금 어디를 보는지 잃는다** |
 * | 핀치 확대·축소 | **확대 상태에서 오탭이 늘고, 6석 선택 중 위치를 놓친다** |
 * | 가로 모드 강제 회전 | 한 화면만 회전 강제하면 앱 전체 동선이 어색해진다 |
 *
 * **스크롤 축이 하나다.** 열 위치가 고정이라 **`A`·`D` 가 창측인 게 계속 보인다.**
 */

const CELL = 'h-12 w-14 items-center justify-center rounded-lg border'

function seatStyle(seat: Seat, selected: boolean): string {
  if (selected) return `${CELL} border-sky-600 bg-sky-600`
  if (seat.status === 'SOLD') return `${CELL} border-slate-200 bg-slate-200`
  if (seat.status === 'HELD') return `${CELL} border-amber-300 bg-amber-100`
  return `${CELL} border-slate-300 bg-white`
}

function seatTextStyle(seat: Seat, selected: boolean): string {
  if (selected) return 'text-xs font-bold text-white'
  if (seat.status === 'SOLD') return 'text-xs text-slate-400'
  if (seat.status === 'HELD') return 'text-xs text-amber-700'
  return 'text-xs font-semibold text-slate-700'
}

function statusLabel(seat: Seat, selected: boolean): string {
  if (selected) return '내 선택'
  if (seat.status === 'SOLD') return '판매완료'
  if (seat.status === 'HELD') return '선점 중'
  return '선택 가능'
}

export function SeatGrid({
  car,
  selected,
  onToggle,
}: {
  car: Car
  selected: readonly SeatAddress[]
  onToggle: (seat: SeatAddress) => void
}) {
  /** 행 번호 → 열 letter → 좌석. 계약은 평평한 배열로 준다 */
  const rows = useMemo(() => {
    const byRow = new Map<number, Map<string, Seat>>()
    for (const seat of car.seats) {
      const row = byRow.get(seat.rowNo) ?? new Map<string, Seat>()
      row.set(seat.colLetter, seat)
      byRow.set(seat.rowNo, row)
    }
    return [...byRow.entries()].sort((a, b) => a[0] - b[0])
  }, [car])

  return (
    <FlatList
      data={rows}
      keyExtractor={([rowNo]) => `${car.carNo}-${rowNo}`}
      contentContainerClassName="px-4 pb-4 gap-2"
      ListHeaderComponent={
        <View className="gap-2 pb-1 pt-2">
          <Text className="text-center text-[11px] tracking-[6px] text-slate-400">
            ▲ 진 행 방 향
          </Text>
          {/* 열 머리 — A B · 통로 · C D */}
          <View className="flex-row items-center justify-center gap-2">
            <View className="w-7" />
            {COLUMNS.map((col, i) => (
              <View key={col} className="flex-row items-center">
                <Text className="w-14 text-center text-xs font-semibold text-slate-400">{col}</Text>
                {i === 1 ? <View className="w-6" /> : null}
              </View>
            ))}
          </View>
        </View>
      }
      renderItem={({ item: [rowNo, cols] }) => (
        <View className="flex-row items-center justify-center gap-2">
          <Text className="w-7 text-right text-xs text-slate-400">{rowNo}</Text>

          {COLUMNS.map((col, i) => {
            const seat = cols.get(col)
            const addr: SeatAddress = { carNo: car.carNo, rowNo, colLetter: col }
            const picked = seat !== undefined && isSelected(selected, addr)

            return (
              <View key={col} className="flex-row items-center">
                {seat === undefined ? (
                  <View className={`${CELL} border-transparent`} />
                ) : (
                  <Pressable
                    testID={`seat-${car.carNo}-${rowNo}${col}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked, disabled: seat.status !== 'AVAILABLE' }}
                    accessibilityLabel={`${seatLabel(addr)} ${statusLabel(seat, picked)}`}
                    // ⚠️ 남이 가진 좌석은 누를 수 없다. 눌리면 선택했다가
                    //    선점 단계에서 409 를 받는다 — 그 실망을 여기서 막는다.
                    disabled={seat.status !== 'AVAILABLE' && !picked}
                    onPress={() => onToggle(addr)}
                    className={seatStyle(seat, picked)}
                  >
                    <Text className={seatTextStyle(seat, picked)}>
                      {rowNo}
                      {col}
                    </Text>
                  </Pressable>
                )}
                {/* 통로 — B 와 C 사이 */}
                {i === 1 ? <View className="w-6" /> : null}
              </View>
            )
          })}
        </View>
      )}
    />
  )
}

export function SeatLegend() {
  const items = [
    { label: '가능', box: 'border-slate-300 bg-white' },
    { label: '내 선택', box: 'border-sky-600 bg-sky-600' },
    { label: '선점 중', box: 'border-amber-300 bg-amber-100' },
    { label: '판매완료', box: 'border-slate-200 bg-slate-200' },
  ]

  return (
    <View className="flex-row items-center justify-center gap-4 border-t border-slate-100 bg-white py-2">
      {items.map((it) => (
        <View key={it.label} className="flex-row items-center gap-1">
          <View className={`h-3 w-3 rounded border ${it.box}`} />
          <Text className="text-[11px] text-slate-500">{it.label}</Text>
        </View>
      ))}
    </View>
  )
}
