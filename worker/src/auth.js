// 驗證前端送來的 Firebase 登入憑證（ID Token，RS256 JWT）
// 不用 firebase-admin（Worker 跑不動），直接拿 Google 公開的金鑰用 WebCrypto 驗簽章。
import { HttpError } from './http.js';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let keyCache = { keys: null, expires: 0 };

export async function fetchGoogleKeys(force = false) {
  const now = Date.now();
  if (!force && keyCache.keys && keyCache.expires > now) return keyCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new HttpError(502, `無法取得 Google 驗證金鑰（HTTP ${res.status}）`);
  const { keys } = await res.json();
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  keyCache = { keys: Array.isArray(keys) ? keys : [], expires: now + maxAge * 1000 };
  return keyCache.keys;
}

function b64urlBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

// allowUnsigned 只給本機模擬器測試用（模擬器發的憑證 alg=none、沒有簽章），正式環境不要開
export async function verifyIdToken(token, {
  projectId,
  allowUnsigned = false,
  getKeys = fetchGoogleKeys,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  if (!projectId) throw new HttpError(500, 'Worker 沒有設定 FIREBASE_PROJECT_ID');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, '請先登入');

  let header, payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    throw new HttpError(401, '登入憑證格式錯誤');
  }

  if (!(allowUnsigned && header.alg === 'none')) {
    if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, '登入憑證格式錯誤');
    let jwk = (await getKeys(false)).find(k => k.kid === header.kid);
    // Google 會定期換金鑰：找不到這把就強制重抓一次
    if (!jwk) jwk = (await getKeys(true)).find(k => k.kid === header.kid);
    if (!jwk) throw new HttpError(401, '登入憑證無法驗證，請重新登入');
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) throw new HttpError(401, '登入憑證無法驗證，請重新登入');
  }

  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new HttpError(401, '登入憑證不屬於這個 App');
  }
  if (typeof payload.exp !== 'number' || payload.exp < now - 60) throw new HttpError(401, '登入已過期，請重新整理頁面');
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new HttpError(401, '登入憑證時間不對');
  if (!payload.sub) throw new HttpError(401, '登入憑證缺少使用者');
  return payload;
}

// 只開放給名單裡的 Google 帳號用（名單放在 Worker secret，不寫進程式碼）
// 名單容忍逗號／分號／空白／換行分隔，以及不小心貼進去的引號與 BOM
export function parseAllowedEmails(allowedEmails) {
  return String(allowedEmails || '')
    .split(/[,;\s]+/)
    .map(s => s.replace(/^[\s"'﻿]+|[\s"'﻿]+$/g, '').toLowerCase())
    .filter(Boolean);
}

export function assertAllowedUser(payload, allowedEmails) {
  const allowed = parseAllowedEmails(allowedEmails);
  const email = String(payload.email || '').trim().toLowerCase();
  if (allowed.length === 0) throw new HttpError(500, 'Worker 的帳號名單是空的，請重新設定 ALLOWED_EMAILS');
  if (!email) throw new HttpError(403, '登入憑證裡沒有信箱，請重新登入');
  if (payload.email_verified !== true) {
    throw new HttpError(403, `這個帳號（${email}）的信箱 Google 尚未驗證，無法使用 AI`);
  }
  if (!allowed.includes(email)) {
    throw new HttpError(403, `這個帳號（${email}）不在允許名單內（名單共 ${allowed.length} 組）`);
  }
}
