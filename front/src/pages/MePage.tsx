import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isValidationFailed } from '../api/problem'
import { useMe, useUpdateMe } from '../api/queries'
import { ErrorView, Loading } from '../ui/QueryState'

/**
 * `W-12` 마이페이지 (`F-22`).
 *
 * ⚠️ **이름 · 연락처만 바꾼다.**
 *
 * | 없는 것 | 왜 |
 * |---|---|
 * | 이메일 변경 | **소유 증명 수단이 없다.** 허용하면 계정이 남의 것이 될 수 있다 |
 * | 비밀번호 변경 | 재설정(메일 발송)이 범위 밖이라 함께 뺐다 |
 * | 회원 탈퇴 | 범위 밖 |
 *
 * > **의도된 축소이지 누락이 아니다** (와이어프레임 주석). 인증은 최소형으로
 * > 시작해 점차 추가한다.
 */
export function MePage() {
  const me = useMe()
  const update = useUpdateMe()
  const queryClient = useQueryClient()

  const [name, setName] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)

  if (me.isPending) return <Loading label="회원 정보를 불러오는 중" />
  if (me.isError) return <ErrorView error={me.error} onRetry={() => void me.refetch()} />

  const profile = me.data
  // ⚠️ 서버 값을 기본으로 두고, 사용자가 손댄 뒤에만 입력값이 이긴다.
  //    `useEffect` 로 상태에 복사하면 새로고침·재조회 때마다 편집 중인 값이 날아간다
  const nameValue = name ?? profile.name
  const phoneValue = phone ?? profile.phone

  const dirty = nameValue !== profile.name || phoneValue !== profile.phone

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!dirty) return

    update.mutate(
      { name: nameValue, phone: phoneValue },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(['me'], updated)
          // 서버 값이 곧 화면 값이 되게 되돌린다
          setName(null)
          setPhone(null)
        },
      },
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">내 정보</h1>

      <form onSubmit={submit} className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <label className="block text-sm">
          <span className="text-gray-600">이메일 (변경 불가)</span>
          {/*
            ⚠️ 비활성 입력으로 둔다. 아예 안 보여주면 "내가 어느 계정으로 로그인했는지"
               를 확인할 방법이 사라진다 — 보여주되 못 바꾸게 한다
          */}
          <input
            type="email"
            value={profile.email}
            disabled
            className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500"
          />
        </label>

        <label className="mt-4 block text-sm">
          <span className="text-gray-600">이름</span>
          <input
            type="text"
            value={nameValue}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="mt-4 block text-sm">
          <span className="text-gray-600">연락처</span>
          <input
            type="tel"
            value={phoneValue}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        {update.isError && (
          <div className="mt-4">
            <ErrorView error={update.error}>
              {isValidationFailed(update.error) && (
                <ul className="mt-2 space-y-1 text-sm text-red-800">
                  {update.error.problem.errors?.map((f) => (
                    <li key={f.field}>
                      {f.field} — {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </ErrorView>
          </div>
        )}

        {update.isSuccess && !dirty && (
          <p role="status" className="mt-4 text-sm text-green-800">
            저장되었습니다.
          </p>
        )}

        <button
          type="submit"
          disabled={!dirty || update.isPending}
          className="mt-6 w-full rounded-lg bg-gray-900 py-2.5 font-medium text-white disabled:bg-gray-300"
        >
          {update.isPending ? '저장 중…' : '정보 수정'}
        </button>
      </form>

      {/*
        ⚠️ 없는 기능을 없다고 적는다. 사용자가 비밀번호 변경을 찾아 헤매는 것보다
           낫고, 이 축소가 의도라는 사실도 남는다
      */}
      <p className="mt-3 text-center text-xs text-gray-500">
        비밀번호 변경 · 이메일 변경 · 회원 탈퇴는 아직 제공하지 않습니다.
      </p>
    </div>
  )
}
