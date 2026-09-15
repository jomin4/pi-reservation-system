import { Tabs } from 'expo-router'
import { View, type ColorValue } from 'react-native'

/**
 * 탭 3개 — 와이어프레임 「앱 진입 첫 화면. 탭바 기반」.
 *
 * ⚠️ **예약·마이페이지 탭은 로그인이 필요하다.** 탭 자체를 숨기지 않고 **열되
 *    가드가 로그인으로 보낸다** — 탭이 사라지면 "예약은 어디서 보지" 가 된다.
 *
 * ⚠️ **`tabBarIcon` 을 반드시 준다.** 안 주면 RN 이 **빈 네모(⧅)** 를 그려
 *    "아이콘이 깨졌나" 로 보인다. 아래 점 하나면 충분하다 — 시스템 폰트에
 *    의존하지 않아 항상 그려진다. 아이콘 세트는 디자인이 정해진 뒤에 넣는다.
 *
 * > **#100 에서 「원인 미확인」 으로 남겼던 게 이거다.** 고쳐도 계속 ⧅ 가 보였는데
 * > **낡은 번들이었다** — `CI=1` 이 watch mode 를 꺼서 수정이 안 실렸다
 * > (`mobile/CLAUDE.md` 「개발 루프」).
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
