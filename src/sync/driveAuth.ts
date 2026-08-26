import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';
import { shouldUseGis, loadGisScript, GIS_CLIENT_ID } from './auth';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// 同一次使用（同一個分頁/session）期間，Drive 的 access token 快取在記憶體裡重複用，
// 避免同一份操作（例如「選還原版本」列清單→挑一份→還原）連續跳兩三次帳號選擇畫面。
// 使用者換分頁或重新整理就會自然清空（本來就沒有要跨 session 保留的必要）。
// Google 的 access token 效期一般是 3600 秒；提前 5 分鐘視為過期，避免卡在 API 呼叫途中失效。
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000; // Firebase popup 換到的 access token 沒有附 expires_in，用保守預設值

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export function clearDriveAccessTokenCache(): void {
  cachedToken = null;
}

function cacheToken(accessToken: string, ttlMs: number): string {
  cachedToken = { accessToken, expiresAt: Date.now() + ttlMs - TOKEN_EXPIRY_BUFFER_MS };
  return accessToken;
}

// 桌面（signInWithPopup）路線：用 Firebase 的 GoogleAuthProvider 額外要 drive.file scope，
// 換回來的 access token 藏在 credential 裡，不是 Firebase user 物件本身的欄位。
async function getDriveAccessTokenViaFirebasePopup(): Promise<string> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_FILE_SCOPE);
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('無法取得 Google Drive 存取權限，請重新登入後再試一次');
  }
  return cacheToken(credential.accessToken, DEFAULT_TOKEN_TTL_MS);
}

// 手機/PWA（GIS ID Token）路線：登入身分跟 API 存取權限是兩條分開的 GIS API，
// 這裡另外用 oauth2.initTokenClient 換一個帶 drive.file scope 的 access token。
async function getDriveAccessTokenViaGis(): Promise<string> {
  const clientId = GIS_CLIENT_ID;
  if (!clientId) {
    throw new Error('缺少 Google 登入設定 (VITE_GOOGLE_OAUTH_CLIENT_ID)');
  }
  await loadGisScript();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error('無法取得 Google Drive 存取權限，請重新授權後再試一次'));
          return;
        }
        const ttlMs = response.expires_in ? Number(response.expires_in) * 1000 : DEFAULT_TOKEN_TTL_MS;
        resolve(cacheToken(response.access_token, ttlMs));
      },
    });
    client.requestAccessToken();
  });
}

export function getDriveAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return Promise.resolve(cachedToken.accessToken);
  }
  return shouldUseGis() ? getDriveAccessTokenViaGis() : getDriveAccessTokenViaFirebasePopup();
}
