import { Text, TouchableOpacity } from 'react-native'

import { RequireAuth } from '@/auth/guard'
import { signOut } from '@/auth/useAuth'
import { Placeholder } from '@/ui/Placeholder'

/** `M-12` 마이페이지 — 내용은 #50 이 채운다 */
export default function Me() {
  return (
    <RequireAuth>
      <Placeholder id="M-12" title="마이페이지" note="내 정보 조회·수정은 #50 이 채운다">
        <TouchableOpacity onPress={signOut} className="mt-6 rounded-lg bg-slate-100 px-4 py-2">
          <Text className="text-sm font-semibold text-slate-700">로그아웃 (F-25)</Text>
        </TouchableOpacity>
      </Placeholder>
    </RequireAuth>
  )
}
