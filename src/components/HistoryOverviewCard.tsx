import { useMemo, useState } from 'react';
import { type Workout } from '../db/schema';
import {
  HISTORY_CATEGORIES,
  buildWeeklyColumns,
  countByCategory,
  formatMonthDay,
  inMonth,
  summarizePeriod,
  type CategorizedWorkout,
  type HistoryCategory,
} from '../lib/historyStats';
import { SPLIT_CATEGORY_HEX } from '../lib/splitRotation';

/** 圖表色：推/拉/腿/手 跟班表、日曆同一套（色盤已驗過），其他用中性灰 */
const CATEGORY_HEX: Record<HistoryCategory, string> = { ...SPLIT_CATEGORY_HEX, 其他: '#94a3b8' };
/** 色塊裡的字：深色底用白字，灰底用深字 */
const CELL_TEXT: Record<HistoryCategory, string> = { 推: '#ffffff', 拉: '#ffffff', 手: '#ffffff', 腿: '#ffffff', 其他: '#0f172a' };

const WEEKS = 8;
const CELL = 22; // px，一格＝一次訓練（≤ 24px 寬）
const GAP = 2;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 甜甜圈幾何（viewBox 140×140，用描邊畫環，段與段之間留 2px 空隙）
const RING_R = 54;
const RING_W = 20;
const RING_C = 2 * Math.PI * RING_R;
const RING_GAP = 2;

interface HistoryOverviewCardProps {
  items: CategorizedWorkout[];
  now: number;
  onSelectWorkout: (workout: Workout) => void;
}

function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

function SummaryLine({ parts }: { parts: string[] }) {
  return (
    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 text-center pt-3 border-t border-slate-100 dark:border-slate-800">
      {parts.join(' · ')}
    </p>
  );
}

/** 歷史頁上方總覽：「趨勢」＝近 8 週堆疊格子（每格一次訓練），「比例」＝某個月各部位甜甜圈 */
export default function HistoryOverviewCard({ items, now, onSelectWorkout }: HistoryOverviewCardProps) {
  const [tab, setTab] = useState<'trend' | 'share'>('trend');
  const [month, setMonth] = useState(() => {
    const d = new Date(now);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [activeCategory, setActiveCategory] = useState<HistoryCategory | null>(null);

  // ── 趨勢 ──
  const columns = useMemo(() => buildWeeklyColumns(items, now, WEEKS), [items, now]);
  const trendItems = useMemo(() => columns.flatMap((c) => c.items), [columns]);
  const trendSummary = useMemo(() => summarizePeriod(trendItems.map((i) => i.workout)), [trendItems]);
  const maxStack = Math.max(4, ...columns.map((c) => c.items.length));
  const trendCategories = HISTORY_CATEGORIES.filter((cat) => trendItems.some((i) => i.category === cat));

  // ── 比例 ──
  const monthItems = useMemo(() => inMonth(items, month.year, month.month), [items, month]);
  const monthCounts = useMemo(() => countByCategory(monthItems), [monthItems]);
  const monthSummary = useMemo(() => summarizePeriod(monthItems.map((i) => i.workout)), [monthItems]);
  const shareCategories = useMemo(() => HISTORY_CATEGORIES.filter((cat) => monthCounts[cat] > 0), [monthCounts]);
  const total = monthItems.length;
  const segments = useMemo(() => {
    const gap = shareCategories.length > 1 ? RING_GAP : 0;
    const lengths = shareCategories.map((cat) => (monthCounts[cat] / Math.max(total, 1)) * RING_C);
    return shareCategories.map((cat, i) => ({
      cat,
      dash: Math.max(lengths[i] - gap, 0.5),
      offset: lengths.slice(0, i).reduce((sum, len) => sum + len, 0),
    }));
  }, [shareCategories, monthCounts, total]);

  const shiftMonth = (delta: number) => {
    const d = new Date(month.year, month.month - 1 + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() + 1 });
    setActiveCategory(null);
  };

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">訓練總覽</h2>
        <div className="bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg flex text-[11px] font-bold">
          {([['trend', '趨勢'], ['share', '比例']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-1 rounded-md transition cursor-pointer ${
                tab === key
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'trend' ? (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-slate-400">近 {WEEKS} 週 · 每一格是一次訓練，點格子看那次紀錄</p>
          <div className="flex justify-between items-end gap-1" style={{ minHeight: maxStack * (CELL + GAP) + 18 }}>
            {columns.map((column, idx) => {
              const isThisWeek = idx === columns.length - 1;
              return (
                <div key={column.weekStart} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                    {column.items.length > 0 ? column.items.length : ''}
                  </span>
                  <div className="flex flex-col-reverse" style={{ gap: GAP }}>
                    {column.items.map(({ workout, category }) => (
                      <button
                        key={workout.id}
                        type="button"
                        onClick={() => onSelectWorkout(workout)}
                        title={`${workout.title || category} · ${shortDate(workout.startedAt)}`}
                        aria-label={`${category}，${shortDate(workout.startedAt)}`}
                        className="rounded-[4px] flex items-center justify-center text-[10px] font-bold cursor-pointer transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        style={{
                          width: CELL,
                          height: CELL,
                          backgroundColor: CATEGORY_HEX[category],
                          color: CELL_TEXT[category],
                        }}
                      >
                        {category === '其他' ? '·' : category}
                      </button>
                    ))}
                    {column.items.length === 0 && (
                      <div className="rounded-[4px] bg-slate-100 dark:bg-slate-800" style={{ width: CELL, height: 3 }} />
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-bold tabular-nums whitespace-nowrap ${
                      isThisWeek ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                    }`}
                  >
                    {isThisWeek ? '本週' : formatMonthDay(column.weekStart)}
                  </span>
                </div>
              );
            })}
          </div>
          {trendCategories.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              {trendCategories.map((cat) => (
                <span key={cat} className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: CATEGORY_HEX[cat] }} />
                  {cat}
                </span>
              ))}
            </div>
          )}
          <SummaryLine
            parts={[
              `近 ${WEEKS} 週 ${trendSummary.count} 次`,
              `平均每週 ${(trendSummary.count / WEEKS).toFixed(1)} 次`,
              trendSummary.avgMinutes !== null ? `平均 ${trendSummary.avgMinutes} 分鐘` : '時長未記錄',
            ]}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition"
              aria-label="上個月"
            >
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {month.year} 年 {month.month} 月部位比例
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer transition"
              aria-label="下個月"
            >
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0" role="img" aria-label={`${month.month} 月各部位訓練次數`}>
              <circle cx="70" cy="70" r={RING_R} fill="none" strokeWidth={RING_W} className="stroke-slate-100 dark:stroke-slate-800" />
              <g transform="rotate(-90 70 70)">
                {segments.map((seg) => (
                  <circle
                    key={seg.cat}
                    cx="70"
                    cy="70"
                    r={RING_R}
                    fill="none"
                    stroke={CATEGORY_HEX[seg.cat]}
                    strokeWidth={activeCategory === seg.cat ? RING_W + 4 : RING_W}
                    strokeDasharray={`${seg.dash} ${RING_C - seg.dash}`}
                    strokeDashoffset={-seg.offset}
                    opacity={activeCategory && activeCategory !== seg.cat ? 0.35 : 1}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => setActiveCategory(seg.cat)}
                    onMouseLeave={() => setActiveCategory(null)}
                    onClick={() => setActiveCategory(activeCategory === seg.cat ? null : seg.cat)}
                  />
                ))}
              </g>
              {total === 0 ? (
                <text x="70" y="74" textAnchor="middle" className="fill-slate-400 text-[11px] font-bold">
                  沒有紀錄
                </text>
              ) : activeCategory ? (
                <>
                  <text x="70" y="66" textAnchor="middle" className="fill-slate-800 dark:fill-slate-100 text-[18px] font-extrabold">
                    {monthCounts[activeCategory]} 次
                  </text>
                  <text x="70" y="84" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[10px] font-bold">
                    {activeCategory} · {pct(monthCounts[activeCategory])}%
                  </text>
                </>
              ) : (
                <>
                  <text x="70" y="66" textAnchor="middle" className="fill-slate-800 dark:fill-slate-100 text-[20px] font-extrabold">
                    {total}
                  </text>
                  <text x="70" y="84" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[10px] font-bold">
                    次訓練
                  </text>
                </>
              )}
            </svg>

            <div className="flex-1 min-w-0 space-y-1.5">
              {total === 0 ? (
                <p className="text-[11px] text-slate-400 font-semibold">這個月還沒有訓練紀錄，按 ‹ 看上個月。</p>
              ) : (
                shareCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                    className={`w-full flex items-center gap-2 text-xs font-bold rounded-lg px-1.5 py-1 transition cursor-pointer ${
                      activeCategory === cat ? 'bg-slate-100 dark:bg-slate-800' : ''
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: CATEGORY_HEX[cat] }} />
                    <span className="text-slate-700 dark:text-slate-200">{cat}</span>
                    <span className="ml-auto text-slate-500 dark:text-slate-400 tabular-nums">
                      {monthCounts[cat]} 次 · {pct(monthCounts[cat])}%
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <SummaryLine
            parts={[
              `${month.month} 月 ${monthSummary.count} 次`,
              `${monthSummary.workingSets} 組`,
              monthSummary.avgMinutes !== null ? `平均 ${monthSummary.avgMinutes} 分鐘` : '時長未記錄',
            ]}
          />
        </div>
      )}
    </div>
  );
}
