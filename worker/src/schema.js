// 把模型回傳的班表整理成固定格式；模型亂給的東西在這裡擋掉
import { HttpError } from './http.js';

export function sanitizeShifts(raw) {
  const year = Number(raw?.year);
  const month = Number(raw?.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(422, '看不出這張截圖是幾年幾月的班表，請換一張完整的月曆截圖');
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  const seen = new Set();
  const days = [];
  for (const d of Array.isArray(raw?.days) ? raw.days : []) {
    const day = Number(d?.day);
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth || seen.has(day)) continue;
    seen.add(day);
    const label = String(d?.label ?? '').replace(/\s+/g, '').slice(0, 8);
    days.push({ day, label });
  }
  if (days.length === 0) throw new HttpError(422, '截圖裡沒有辨識到班表，請換一張完整的月曆截圖');
  days.sort((a, b) => a.day - b.day);
  return { year, month, days };
}
