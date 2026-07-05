import { useRef, useEffect, useCallback } from 'react';

interface RepsWheelProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

const ITEM_H = 28; // px，需與下方 h-7 一致

// 次數滾輪：inline（不用 popover，避免被卡片 overflow-hidden 裁切）
export default function RepsWheel({ value, onChange, min = 1, max = 20 }: RepsWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const items = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  // 外部 value → 捲到對應位置
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.min(Math.max(value - min, 0), items.length - 1);
    el.scrollTop = idx * ITEM_H;
  }, [value, min, items.length]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const idx = Math.min(Math.max(Math.round(el.scrollTop / ITEM_H), 0), items.length - 1);
      el.scrollTop = idx * ITEM_H; // 吸附校正
      const v = min + idx;
      if (v !== value) onChange(v);
    }, 90);
  }, [value, min, items.length, onChange]);

  return (
    <div className="relative w-full" style={{ height: ITEM_H * 3 }}>
      {/* 中央高亮框 */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-7 border-y-2 border-indigo-400/60 bg-indigo-50/40 rounded" />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {/* 上補白，讓首項可置中 */}
        <div className="h-7" />
        {items.map((n) => (
          <div
            key={n}
            className="h-7 flex items-center justify-center text-sm font-bold text-slate-700 snap-center"
            style={{ scrollSnapAlign: 'center' }}
          >
            {n}
          </div>
        ))}
        {/* 下補白 */}
        <div className="h-7" />
      </div>
    </div>
  );
}
