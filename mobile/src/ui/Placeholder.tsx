import { Text, View } from 'react-native'

/**
 * 화면 자리표. **각 `feat(mobile)` 이슈가 이 자리를 가져간다.**
 *
 * 여기서 데이터를 부르지 않는다 — **라우팅만 확인하는 PR** 이다 (#83).
 */
export function Placeholder({
  id,
  title,
  note,
  children,
}: {
  /** `M-01` 같은 와이어프레임 ID. 화면을 보고 어느 문서를 볼지 알아야 한다 */
  id: string
  title: string
  note?: string
  children?: React.ReactNode
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-white px-8">
      <Text className="text-xs font-semibold tracking-widest text-sky-600">{id}</Text>
      <Text className="text-2xl font-bold text-slate-900">{title}</Text>
      {note === undefined ? null : (
        <Text className="text-center text-xs leading-5 text-slate-400">{note}</Text>
      )}
      {children}
    </View>
  )
}
