// Groq 呼叫（OpenAI 相容介面）＋多帳號金鑰輪替
// 跟英文口說教練 src/groqClient.js 同一招：每次輪流用下一把 key，
// 遇到 429（那個帳號的額度到了）或 401（key 失效）就換下一把重試同一個請求。
import { HttpError } from './http.js';

const DEFAULT_BASE = 'https://api.groq.com/openai/v1';
let cursor = 0;

export function parseKeys(env) {
  return String(env.GROQ_API_KEYS || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
}

export async function groqChat(env, body) {
  const keys = parseKeys(env);
  if (keys.length === 0) throw new HttpError(500, 'Worker 沒有設定 GROQ_API_KEYS');
  const base = env.GROQ_BASE_URL || DEFAULT_BASE;

  let retryAfter = 0;
  let badKeys = 0;
  let lastLimit = '';
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (cursor + attempt) % keys.length;
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${keys[idx]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      retryAfter = Math.max(retryAfter, Math.ceil(Number(res.headers.get('retry-after')) || 0));
      lastLimit = (await res.text()).slice(0, 400);
      continue;
    }
    if (res.status === 401) {
      badKeys++;
      await res.body?.cancel();
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(502, `AI 服務錯誤（Groq ${res.status}）`, { groqStatus: res.status, body: text.slice(0, 1000) });
    }
    cursor = (idx + 1) % keys.length;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpError(502, 'AI 服務回傳格式錯誤');
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new HttpError(502, 'AI 沒有回傳內容');
    return { content, usage: data.usage || null };
  }
  if (badKeys === keys.length) throw new HttpError(500, 'Groq 金鑰全部失效，請更新 Worker 設定');
  throw new HttpError(429, 'AI 額度暫時用完了，稍等一下再試', { retryAfter: Math.min(retryAfter || 20, 120), lastLimit });
}

const stripFence = (s) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

// JSON 模式偶爾會回 json_validate_failed（模型吐出壞掉的 JSON），重試一次通常就好
export async function groqJSON(env, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const { content } = await groqChat(env, { ...body, response_format: { type: 'json_object' } });
      const parsed = JSON.parse(stripFence(content));
      if (!parsed || typeof parsed !== 'object') throw new SyntaxError('not an object');
      return parsed;
    } catch (err) {
      const retryable =
        err instanceof SyntaxError ||
        (err instanceof HttpError && err.details?.groqStatus === 400 && /json_validate_failed/.test(err.details.body || ''));
      if (!retryable) throw err;
      if (attempt >= 1) throw new HttpError(502, 'AI 回傳的格式不對，請再試一次');
    }
  }
}
