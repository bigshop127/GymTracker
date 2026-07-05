import { type MuscleGroup } from '../db/schema';

// 各訓練部位對應配色（對齊 Q 版圖卡：背綠/肩黃/腿藍/胸紅/手橘/核心紫，有氧補青）
// ⚠️ Tailwind 只認靜態 class，務必用完整字串查表，不可用 `border-${x}-300` 動態拼接。
export const MUSCLE_COLORS: Record<MuscleGroup, { border: string; badge: string; text: string }> = {
  有氧: { border: 'border-cyan-300', badge: 'bg-cyan-100 text-cyan-700', text: 'text-cyan-700' },
  胸: { border: 'border-rose-300', badge: 'bg-rose-100 text-rose-700', text: 'text-rose-700' },
  背: { border: 'border-emerald-300', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
  腿臀: { border: 'border-blue-300', badge: 'bg-blue-100 text-blue-700', text: 'text-blue-700' },
  肩: { border: 'border-amber-300', badge: 'bg-amber-100 text-amber-700', text: 'text-amber-700' },
  手臂: { border: 'border-orange-300', badge: 'bg-orange-100 text-orange-700', text: 'text-orange-700' },
  核心: { border: 'border-violet-300', badge: 'bg-violet-100 text-violet-700', text: 'text-violet-700' },
};
