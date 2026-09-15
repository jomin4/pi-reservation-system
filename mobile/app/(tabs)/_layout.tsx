import { Tabs } from 'expo-router'
import { View, type ColorValue } from 'react-native'

/**
 * 탭 3개 — 와이어프레임 「앱 진입 첫 화면. 탭바 기반」.
 *
 * ⚠️ **예약·마이페이지 탭은 로그인이 필요하다.** 탭 자체를 숨기지 않고 **열되
 *    가드가 로그인으로 보낸다** — 탭이 사라지면 "예약은 어디서 보지" 가 된다.
 *
 * ⚠️ **미해결 — 탭바에 빈 네모(⧅)가 그려진다.** 에뮬레이터에서 셋 다 시도했고
 *    셋 다 안 지워졌다: `tabBarIcon: () => null` · `tabBarIconStyle: {display:'none'}` ·
 *    아래처럼 **명시적 View 아이콘**. 번들은 매번 새로 말렸다(횟수 확인).
 *
 *    **원인을 모른다.** 우리 `tabBarIcon` 이 안 먹는 것인지, 다른 레이어가 그리는
 *    것인지 아직 못 갈랐다. 자리표 화면이라 **동선에는 지장이 없어** 여기서 멈춘다 —
 *    아이콘 세트를 넣는 이슈에서 다시 본다.
 */
function Dot({ color }: { color: ColorValue }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0284c7',
        tabBarIcon: ({ color }) => <Dot color={color} />,
        tabBarLabelStyle: { fontSize: 13 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="reservations" options={{ title: '예약' }} />
      <Tabs.Screen name="me" options={{ title: '마이페이지' }} />
    </Tabs>
  )
}
