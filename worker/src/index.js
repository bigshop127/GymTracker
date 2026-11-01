// GymTracker 的 AI 代轉（Cloudflare Worker）
//
// 網頁不能放 Groq 金鑰，由這支 Worker 先確認是本人登入（Firebase 憑證＋帳號名單），
// 再呼叫 Groq 視覺模型讀班表截圖。
//
//   POST /parse-shifts  { image: "data:image/jpeg;base64,..." }  班表截圖 → { year, month, days:[{day,label}] }
//   GET  /health                                                  部署檢查用

import { HttpError, jsonResponse } from './http.js';
import { verifyIdToken, assertAllowedUser } from './auth.js';
import { groqJSON } from './groq.js';
import { SHIFT_SYSTEM } from './prompts.js';
import { sanitizeShifts } from './schema.js';

const VISION_MODEL = 'qwen/qwen3.8-27b';
const MAX_BODY = 8 * 1024 * 1024;
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

function isAllowedOrigin(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, '圖片太大了');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, '圖片太大了');
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object') return body;
  } catch {
    // 落到下面統一回 400
  }
  throw new HttpError(400, '請求格式錯誤');
}

async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = await verifyIdToken(token, {
    projectId: env.FIREBASE_PROJECT_ID,
    allowUnsigned: env.AUTH_EMULATOR === '1',
  });
  assertAllowedUser(payload, env.ALLOWED_EMAILS);
  return payload;
}

export async function parseShifts(env, body) {
  const image = typeof body.image === 'string' ? body.image : '';
  if (!IMAGE_RE.test(image)) throw new HttpError(400, '請上傳 PNG、JPG 或 WebP 圖片');
  const raw = await groqJSON(env, {
    model: env.VISION_MODEL || VISION_MODEL,
    reasoning_effort: env.VISION_REASONING || 'none',
    temperature: 0,
    max_completion_tokens: 3000,
    messages: [
      { role: 'system', content: SHIFT_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Here is my shift calendar screenshot.' },
          { type: 'image_url', image_url: { url: image } },
        ],
      },
    ],
  });
  return sanitizeShifts(raw);
}

const ROUTES = { '/parse-shifts': parseShifts };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return jsonResponse({ ok: true });

    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin, env)) return jsonResponse({ error: 'origin not allowed' }, 403);
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const handler = ROUTES[url.pathname];
    if (!handler) return jsonResponse({ error: '找不到這個功能' }, 404, cors);
    if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405, cors);

    try {
      await authenticate(request, env);
      const body = await readJson(request);
      return jsonResponse(await handler(env, body), 200, cors);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      const status = err instanceof HttpError ? err.status : 500;
      const retryAfter = err?.details?.retryAfter;
      const headers = retryAfter ? { ...cors, 'Retry-After': String(retryAfter) } : cors;
      const out = { error: err instanceof HttpError ? err.message : 'Worker 內部錯誤' };
      if (retryAfter) out.retryAfter = retryAfter;
      return jsonResponse(out, status, headers);
    }
  },
};
