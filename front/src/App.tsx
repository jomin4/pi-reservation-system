export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-bold">좌석 예매</h1>
      <p className="text-sm text-gray-500">
        API 모드: <code>{import.meta.env.VITE_API_MODE ?? 'unset'}</code>
      </p>
    </main>
  )
}
