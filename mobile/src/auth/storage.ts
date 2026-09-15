import * as SecureStore from 'expo-secure-store'

/**
 * SecureStore 얇은 래퍼. **OS 키체인**(Android Keystore)에 넣는다.
 *
 * ⚠️ **읽기·쓰기가 실패할 수 있다.** 기기 정책·키체인 잠금·에뮬레이터 상태에 따라
 *    던진다. 여기서 삼키고 `null` 을 준다 — **토큰을 못 읽은 것은 로그아웃과 같다**
 *    (재로그인하면 된다). 앱이 뜨다 죽는 것보다 낫다.
 *
 * > **웹과 다른 선택인 이유** (`tech.md`) — 웹은 탭을 닫으면 끝나도 되지만
 * > **모바일은 앱을 껐다 켜는 게 일상**이다. RN 에는 XSS 가 없고 SecureStore 는
 * > OS 키체인이라 전제가 다르다.
 */

export async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

export async function writeSecure(key: string, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value)
    return true
  } catch {
    return false
  }
}

export async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch {
    // 이미 없으면 그만이다
  }
}
