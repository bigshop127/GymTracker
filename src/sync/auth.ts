import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';

export type { User };

// signInWithPopup／signInWithRedirect 都要靠 Firebase 的 authDomain
//（預設是 <project>.firebaseapp.com）跟本站網域之間的第三方儲存空間才能完成登入。
// GitHub Pages 沒有自訂網域可以讓 authDomain 跟本站同網域，手機版 Chrome 又
// 越來越常封鎖這種跨網域儲存存取：整個流程表面上會跑完（跳轉、選帳號、跳回來），
// 但 SDK 讀不到結果，靜靜停在未登入、不會報錯。
// 行動裝置/已安裝的 PWA 改用 Google Identity Services 直接換 ID Token，
// 完全繞開 authDomain 這個轉導機制。
export function shouldUseGis(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isStandalone || isMobileUA;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            container: HTMLElement,
            options: { type: string; theme: string; size: string; text: string; width: number }
          ) => void;
        };
        // OAuth2 token client：跟上面的 id（純登入身分）是不同的 API，
        // 用來換有實際 API 存取權限（例如 Drive）的 access token，需要另外要 scope 同意。
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

export const GIS_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined;

let gisScriptPromise: Promise<void> | null = null;

export function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisScriptPromise) {
    gisScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google 登入元件載入失敗，請檢查網路連線'));
      document.head.appendChild(script);
    });
  }
  return gisScriptPromise;
}

// 把 Google 官方的登入按鈕渲染進指定容器；使用者按下後由 GIS 的 callback
// 直接換到 ID Token，再用 signInWithCredential 完成 Firebase 登入。
// 登入成功會讓 onAuthStateChanged 自然觸發，這裡只需要把失敗回報出去。
export async function renderGoogleSignInButton(
  container: HTMLElement,
  onError: (error: Error) => void
): Promise<void> {
  if (!GIS_CLIENT_ID) {
    onError(new Error('缺少 Google 登入設定 (VITE_GOOGLE_OAUTH_CLIENT_ID)'));
    return;
  }
  try {
    await loadGisScript();
  } catch (err) {
    onError(err instanceof Error ? err : new Error('Google 登入元件載入失敗'));
    return;
  }
  const auth = getFirebaseAuth();
  window.google!.accounts.id.initialize({
    client_id: GIS_CLIENT_ID,
    callback: async (response) => {
      try {
        const credential = GoogleAuthProvider.credential(response.credential);
        await signInWithCredential(auth, credential);
      } catch (err) {
        onError(err instanceof Error ? err : new Error('登入失敗'));
      }
    },
  });
  window.google!.accounts.id.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    width: 320,
  });
}

export async function signInWithGoogle(): Promise<User | null> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}
