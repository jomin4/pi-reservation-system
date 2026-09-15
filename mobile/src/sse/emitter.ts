/**
 * 구독자 목록 — 두 구현이 같이 쓴다. 외부 의존 없이 세 줄이면 된다.
 *
 * ⚠️ **구독 해제 함수를 준다.** 화면이 언마운트될 때 안 떼면 **다음 화면에서
 *    죽은 컴포넌트를 갱신**하려 든다.
 */
export function createEmitter<T>() {
  const listeners = new Set<(value: T) => void>()

  return {
    on(cb: (value: T) => void): () => void {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    emit(value: T): void {
      // 복사해서 돈다 — 콜백 안에서 구독을 해제해도 순회가 안 깨진다
      ;[...listeners].forEach((cb) => cb(value))
    },
    clear(): void {
      listeners.clear()
    },
    get size(): number {
      return listeners.size
    },
  }
}
