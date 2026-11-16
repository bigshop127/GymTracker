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

/** 圖表色：各類別跟班表、日曆同一套，其他用中性灰 */
const CATEGORY_HEX: Record<HistoryCategory, string> = { ...SPLIT_CATEGORY_HEX, 其他: '#94a3b8' };
/** 色塊裡的字：深色底用白字，灰底用深字 */
const CELL_TEXT = Object.fromEntries(
  HISTORY_CATEGORIES.map((c) => [c, c === '其他' ? '#0f172a' : '#ffffff']),
) as Record<HistoryCategory, string>;

const WEEKS = 8;
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
  // 每週色塊的欄數：至少 4 欄，讓不同週的色塊寬度一致、上下對齊
  const slots = Math.max(4, ...columns.map((c) => c.items.length));

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
        <div className="space-y-4">
          {/* 三個大數字：一眼看出近 8 週練得多不多 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: String(trendSummary.count), unit: '次', label: `近 ${WEEKS} 週訓練` },
              { value: (trendSummary.count / WEEKS).toFixed(1), unit: '次', label: '平均每週' },
              {
                value: trendSummary.avgMinutes !== null ? String(trendSummary.avgMinutes) : '—',
                unit: trendSummary.avgMinutes !== null ? '分' : '',
                label: '平均時長',
              },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl bg-slate-50 dark:bg-slate-950/60 px-2 py-2.5 text-center">
                <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
                  {tile.value}
                  <span className="text-[11px] font-bold text-slate-400 ml-0.5">{tile.unit}</span>
                </p>
                <p className="text-[10px] font-semibold text-slate-400 mt-1.5">{tile.label}</p>
              </div>
            ))}
          </div>

          {/* 每週一列：左邊是哪一週，右邊每次訓練一個色塊（寫著部位＋日期），點色塊看那次紀錄 */}
          <div className="space-y-1.5">
            {[...columns].reverse().map((column, idx) => {
              const isThisWeek = idx === 0;
              const sessions = [...column.items].sort((a, b) => a.workout.startedAt - b.workout.startedAt);
              return (
                <div key={column.weekStart} className="flex items-center gap-2">
                  <span
                    className={`w-11 shrink-0 text-[11px] font-bold tabular-nums ${
                      isThisWeek ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                    }`}
                  >
                    {isThisWeek ? '本週' : formatMonthDay(column.weekStart)}
                  </span>
                  <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
                    {sessions.map(({ workout, category }) => (
                      <button
                        key={workout.id}
                        type="button"
                        onClick={() => onSelectWorkout(workout)}
                        title={`${workout.title || category} · ${shortDate(workout.startedAt)}`}
                        aria-label={`${category}，${shortDate(workout.startedAt)}`}
                        className="h-9 rounded-lg flex flex-col items-center justify-center leading-none cursor-pointer transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        style={{ backgroundColor: CATEGORY_HEX[category], color: CELL_TEXT[category] }}
                      >
                        <span className="text-[11px] font-extrabold whitespace-nowrap">{category}</span>
                        <span className="text-[9px] font-semibold opacity-80 mt-0.5 tabular-nums">
                          {new Date(workout.startedAt).getMonth() + 1}/{new Date(workout.startedAt).getDate()}
                        </span>
                      </button>
                    ))}
                    {sessions.length === 0 && (
                      <div
                        className="h-9 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-[10px] font-semibold text-slate-300 dark:text-slate-600"
                        style={{ gridColumn: `1 / -1` }}
                      >
                        休息週
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
