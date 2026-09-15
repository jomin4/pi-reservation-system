import type { Seat, SeatMap, SeatRef } from '../../seats'
import { seatKey, seatLabel } from '../../seats'

const COLS = ['A', 'B', 'C', 'D'] as const

/**
 * ⚠️ **다른 사람의 선점과 판매 완료를 다르게 그린다** (`W-03` 주석).
 *
 * 선점은 **10분 뒤 풀릴 수 있는 임시 상태**고 판매 완료는 끝난 자리다. 같아 보이면
 * 사용자가 기다릴지 포기할지 판단할 근거가 사라진다. 색만으로 가르지 않고
 * **빗금**을 같이 쓴다.
 */
function seatClass(seat: Seat | undefined, isMine: boolean): string {
  const base = 'h-9 w-10 rounded border text-xs transition'
  if (isMine) return `${base} border-gray-900 bg-gray-900 text-white`
  if (!seat) return `${base} border-transparent`
  if (seat.status === 'SOLD')
    return `${base} cursor-not-allowed border-gray-200 bg-gray-200 text-gray-400`
  if (seat.status === 'HELD')
    return `${base} cursor-not-allowed border-amber-300 bg-[repeating-linear-gradient(45deg,#FAEEDA,#FAEEDA_3px,#EF9F27_3px,#EF9F27_6px)] text-amber-900`
  return `${base} border-gray-300 bg-white hover:border-gray-900`
}

function statusLabel(seat: Seat | undefined, isMine: boolean): string {
  if (isMine) return '내가 선택'
  if (seat?.status === 'SOLD') return '판매 완료'
  if (seat?.status === 'HELD') return '다른 사람이 선점 중'
  return '선택 가능'
}

export function SeatGrid({
  map,
  carNo,
  selectedKeys,
  onToggle,
}: {
  map: SeatMap
  carNo: number
  selectedKeys: ReadonlySet<string>
  onToggle: (ref: SeatRef) => void
}) {
  const car = map.cars.find((c) => c.carNo === carNo)
  if (!car) return null

  const rows = [...new Set(car.seats.map((s) => s.rowNo))].sort((a, b) => a - b)
  const at = (rowNo: number, colLetter: string) =>
    car.seats.find((s) => s.rowNo === rowNo && s.colLetter === colLetter)

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-gray-500">◀ 진행 방향</p>
      <table className="border-separate border-spacing-1">
        <tbody>
          {COLS.map((col) => (
            <tr key={col}>
              <th scope="row" className="pr-2 text-xs font-normal text-gray-500">
                {col}
              </th>
              {rows.map((rowNo) => {
                const seat = at(rowNo, col)
                const ref: SeatRef = { carNo, rowNo, colLetter: col }
                const isMine = selectedKeys.has(seatKey(ref))
                const blocked = !isMine && (seat === undefined || seat.status !== 'AVAILABLE')
                return (
                  <td key={rowNo}>
                    <button
                      type="button"
                      disabled={blocked}
                      aria-pressed={isMine}
                      aria-label={`${seatLabel(ref)} ${statusLabel(seat, isMine)}`}
                      onClick={() => onToggle(ref)}
                      className={seatClass(seat, isMine)}
                    >
                      {rowNo}
                      {col}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SeatLegend() {
  const items = [
    ['선택 가능', 'border-gray-300 bg-white'],
    ['내가 선택', 'border-gray-900 bg-gray-900'],
    [
      '다른 사람이 선점 중',
      'border-amber-300 bg-[repeating-linear-gradient(45deg,#FAEEDA,#FAEEDA_3px,#EF9F27_3px,#EF9F27_6px)]',
    ],
    ['판매 완료', 'border-gray-200 bg-gray-200'],
  ] as const

  return (
    <ul className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
      {items.map(([label, cls]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-4 rounded border ${cls}`} />
          {label}
        </li>
      ))}
    </ul>
  )
}
