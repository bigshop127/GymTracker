// 真實辨識測試：node worker/test/live.mjs <截圖路徑> <含 GROQ_API_KEYS 的 .env 路徑>
import fs from 'node:fs';
import { parseShifts } from '../src/index.js';

const [img, envPath] = process.argv.slice(2);
const keys = fs.readFileSync(envPath, 'utf8').match(/^GROQ_API_KEYS=(.*)$/m)?.[1]?.trim();
if (!img || !keys) throw new Error('用法：node worker/test/live.mjs <圖> <.env>');
const ext = img.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
const image = `data:image/${ext};base64,${fs.readFileSync(img).toString('base64')}`;
const t0 = Date.now();
const out = await parseShifts({ GROQ_API_KEYS: keys }, { image });
console.log(`用時 ${Date.now() - t0}ms`);
console.log(out.year, out.month, out.days.map((d) => `${d.day}:${d.label}`).join(' '));
