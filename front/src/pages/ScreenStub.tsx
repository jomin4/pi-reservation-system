import { useParams } from 'react-router'

/**
 * 아직 안 만든 화면 자리.
 *
 * > **빈 컴포넌트를 두지 않는다.** 라우트가 붙었는지 눈으로 확인할 수 있어야 하고,
 * > 파라미터가 제대로 들어오는지도 여기서 드러난다. 각 화면 이슈가 이걸 지우고 채운다.
 */
export function ScreenStub({ id, title, issue }: { id: string; title: string; issue: number }) {
  const params = useParams()
  const entries = Object.entries(params)

  return (
    <section className="rounded-xl border border-dashed border-gray-300 bg-white p-6">
      <p className="text-sm text-gray-500">{id}</p>
      <h1 className="mt-1 text-xl font-bold">{title}</h1>
      <p className="mt-3 text-sm text-gray-500">
        이 화면은 <code className="rounded bg-gray-100 px-1">#{issue}</code> 에서 만든다.
      </p>
      {entries.length > 0 && (
        <dl className="mt-3 text-sm text-gray-600">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <dt className="font-medium">{key}</dt>
              <dd>
                <code>{value}</code>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
