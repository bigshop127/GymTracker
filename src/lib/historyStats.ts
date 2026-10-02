import { type Workout } from '../db/schema';
import { getLocalDateStr, getWeekStart } from './shiftPlan';
import { type SplitCategory } from './splitRotation';

/**
 * 歷史頁（2026-10-02 改版）用的統計：近 N 週每週練了哪些（堆疊格子）、某段期間各分類次數（甜甜圈）、
 * 期間摘要數字，以及清單依週分段。分類判斷由呼叫端傳進來（getWorkoutSplitCategory）。
 */

export type HistoryCategory = SplitCategory | '其他';

/** 堆疊／圖例的固定順序：班表輪替 推→拉→手，再來自行安排的腿，最後其他 */
export const HISTORY_CATEGORIES: HistoryCategory[] = ['推', '拉', '手', '腿', '其他'];

/** 超過這個分鐘數多半是忘了按結束（例如 3557 分鐘），不顯示、不算平均 */
export const MAX_PLAUSIBLE_MINUTES = 240;

export function getValidDurationMinutes(workout: Pick<Workout, 'startedAt' | 'endedAt'>): number | null {
  if (!workout.endedAt) return null;
  const minutes = Math.round((workout.endedAt - workout.startedAt) / 60000);
  if (minutes <= 0 || minutes > MAX_PLAUSIBLE_MINUTES) return null;
  return minutes;
}

export function countWorkingSets(workout: Workout): number {
  return workout.entries.reduce((sum, entry) => sum + entry.sets.filter((s) => !s.isWarmup).length, 0);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return getLocalDateStr(new Date(y, m - 1, d + days).getTime());
}

export function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

export interface CategorizedWorkout {
  workout: Workout;
  category: HistoryCategory;
}

export interface WeekColumn {
  weekStart: string;   // 週日（YYYY-MM-DD），跟班表的每週目標同一套週界
  weekEnd: string;     // 週六
  items: CategorizedWorkout[]; // 依 HISTORY_CATEGORIES 順序、同類依時間排，畫堆疊時由下往上
}

/** 近 weeks 週（含本週）每週一欄，舊的在左 */
export function buildWeeklyColumns(
  items: CategorizedWorkout[],
  now: number,
  weeks = 8,
): WeekColumn[] {
  const thisWeekStart = getWeekStart(getLocalDateStr(now));
  const columns: WeekColumn[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(thisWeekStart, -7 * i);
    columns.push({ weekStart, weekEnd: addDays(weekStart, 6), items: [] });
  }
  const byWeek = new Map(columns.map((c) => [c.weekStart, c]));
  for (const item of items) {
    const column = byWeek.get(getWeekStart(getLocalDateStr(item.workout.startedAt)));
    if (column) column.items.push(item);
  }
  const rank = (c: HistoryCategory) => HISTORY_CATEGORIES.indexOf(c);
  for (const column of columns) {
    column.items.sort((a, b) => rank(a.category) - rank(b.category) || a.workout.startedAt - b.workout.startedAt);
  }
  return columns;
}

export function countByCategory(items: CategorizedWorkout[]): Record<HistoryCategory, number> {
  const counts: Record<HistoryCategory, number> = { 推: 0, 拉: 0, 手: 0, 腿: 0, 其他: 0 };
  for (const item of items) counts[item.category] += 1;
  return counts;
}

export interface PeriodSummary {
  count: number;
  workingSets: number;
  avgMinutes: number | null; // 沒有可信的時長就 null
}

export function summarizePeriod(workouts: Workout[]): PeriodSummary {
  const durations = workouts.map(getValidDurationMinutes).filter((m): m is number => m !== null);
  return {
    count: workouts.length,
    workingSets: workouts.reduce((sum, w) => sum + countWorkingSets(w), 0),
    avgMinutes: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
  };
}

/** 某年某月（month 1-12，本地時區）的紀錄 */
export function inMonth<T extends { workout: Workout }>(items: T[], year: number, month: number): T[] {
  return items.filter(({ workout }) => {
    const d = new Date(workout.startedAt);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

export interface WeekGroup<T> {
  weekStart: string;
  weekEnd: string;
  items: T[];
}

/** 清單依週分段：新的週在前，週內維持傳進來的順序（呼叫端先排好新到舊） */
export function groupByWeek<T extends { workout: Workout }>(items: T[]): WeekGroup<T>[] {
  const groups: WeekGroup<T>[] = [];
  const byStart = new Map<string, WeekGroup<T>>();
  for (const item of items) {
    const weekStart = getWeekStart(getLocalDateStr(item.workout.startedAt));
    let group = byStart.get(weekStart);
    if (!group) {
      group = { weekStart, weekEnd: addDays(weekStart, 6), items: [] };
      byStart.set(weekStart, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups.sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0));
}
