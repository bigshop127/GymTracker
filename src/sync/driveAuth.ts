import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';
import { shouldUseGis, loadGisScript, GIS_CLIENT_ID } from './auth';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// 同步（Firestore）本來就是手動觸發、不常按，Drive 備份更是偶爾才用一次，
// 所以不做 token 快取/自動刷新：每次要動 Drive 就當場換一個新的 access token，
// 簡單可靠，代價只是每次都會跳一次 Google 的授權畫面（同意過一次後通常是無感的那種）。

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
  return credential.accessToken;
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
        resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
}

export function getDriveAccessToken(): Promise<string> {
  return shouldUseGis() ? getDriveAccessTokenViaGis() : getDriveAccessTokenViaFirebasePopup();
}
