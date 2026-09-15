// ⚠️ SecureStore 는 네이티브 모듈이라 Jest 에서 못 돈다. 메모리로 대체한다.
//    프로젝트 루트의 __mocks__ 는 node_modules 패키지에 **자동 적용**된다.
//
// ⚠️ 저장소를 globalThis 에 둔다. jest.resetModules() 가 이 모듈도 새로
//    평가하는데, 모듈 스코프에 두면 그때 저장소가 통째로 날아간다 —
//    "앱을 껐다 켜도 키체인은 남는다" 를 재현할 수 없게 된다.
const store = (globalThis.__secureStoreMock ??= new Map())

module.exports = {
  getItemAsync: async (key) => (store.has(key) ? store.get(key) : null),
  setItemAsync: async (key, value) => {
    store.set(key, value)
  },
  deleteItemAsync: async (key) => {
    store.delete(key)
  },
  // 테스트가 사이에 비울 수 있게
  __clear: () => store.clear(),
}
