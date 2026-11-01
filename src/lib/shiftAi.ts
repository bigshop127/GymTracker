import { getFirebaseAuth, isConfigured } from './firebase';
import type { ShiftScan } from './shiftImport';

// Worker 網址不是祕密（誰都能看到，但要有你的登入憑證＋帳號名單才會理你）
const WORKER_URL = (import.meta.env.VITE_AI_WORKER_URL as string | undefined)
  ?? 'https://gymtracker-ai.bigshop127.workers.dev';

const MAX_SIDE = 2000;

/** 把截圖縮到長邊 2000px 以內再轉 JPEG，省上傳流量；小字仍然看得清楚 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('這個瀏覽器無法處理圖片');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.9);
}

export async function recognizeShiftImage(file: File): Promise<ShiftScan> {
  if (!isConfigured()) throw new Error('這個版本沒有設定雲端登入，無法使用截圖辨識');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('請先到「設定」登入 Google 帳號，再使用截圖辨識');

  const [image, token] = await Promise.all([imageFileToDataUrl(file), user.getIdToken()]);

  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/parse-shifts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    });
  } catch {
    throw new Error('連不上辨識服務，請檢查網路後再試');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `辨識失敗（HTTP ${res.status}）`);
  return data as ShiftScan;
}
