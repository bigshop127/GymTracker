import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';

export type { User };

// signInWithPopup 在手機瀏覽器、以及安裝成 PWA 後的 standalone 模式下，
// 跨視窗的 OAuth 交握常常無法完成（彈窗被擋、或 standalone 模式根本沒有
// 「回得去的視窗」）——會卡住或靜默失敗，登入永遠不會成功。
// 行動裝置/已安裝的 PWA 一律改走整頁導向的 signInWithRedirect。
function shouldUseRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isStandalone || isMobileUA;
}

export async function signInWithGoogle(): Promise<User | null> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  if (shouldUseRedirect()) {
    await signInWithRedirect(auth, provider);
    return null; // 整頁導向 Google，這次呼叫不會有回傳值，登入結果要靠 completeRedirectSignIn 取得
  }
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

// 從 Google 導回後呼叫一次，取出 signInWithRedirect 的結果／錯誤。
// 沒有待處理的導回時回傳 null，不會拋錯。
export async function completeRedirectSignIn(): Promise<User | null> {
  const auth = getFirebaseAuth();
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}
