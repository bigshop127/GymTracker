import { type Workout, type TrainingProgram } from '../db/schema';

export type SplitCategory = '拉' | '推' | '腿' | '手';
export const SPLIT_CATEGORIES: SplitCategory[] = ['拉', '推', '腿', '手'];

/** 把 slot label 或訓練標題正規化成四類之一；判不出來回 null */
export function normalizeSplit(text: string | undefined): SplitCategory | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  // 1. 腿 (Leg, 臀, 深蹲)
  if (lower.includes('腿') || lower.includes('leg') || lower.includes('臀') || lower.includes('深蹲')) {
    return '腿';
  }
  // 2. 拉 (Pull, 背)
  if (lower.includes('拉') || lower.includes('pull') || lower.includes('背')) {
    return '拉';
  }
  // 3. 推 (Push, 胸, 肩)
  if (lower.includes('推') || lower.includes('push') || lower.includes('胸') || lower.includes('肩')) {
    return '推';
  }
  // 4. 手 (Arm, 二頭, 三頭)
  if (lower.includes('手') || lower.includes('arm') || lower.includes('二頭') || lower.includes('三頭')) {
    return '手';
  }
  
  return null;
}

export function getWorkoutSplitCategory(
  workout: Workout,
  program: TrainingProgram | null
): SplitCategory | null {
  // Fallback 1: Slot label
  if (workout.programSlotId && program) {
    const slot = program.slots.find(s => s.id === workout.programSlotId);
    if (slot) {
      const category = normalizeSplit(slot.label);
      if (category) return category;
    }
  }
  // Fallback 2: title
  if (workout.title) {
    const category = normalizeSplit(workout.title);
    if (category) return category;
  }
  return null;
}

export interface SplitStatus {
  category: SplitCategory;
  lastTrainedAt: number | null;   // 最近一次該類訓練的 startedAt
  daysAgo: number | null;         // 距今幾天（無紀錄為 null）
  doneInWindow: boolean;          // 滾動 7 天內是否練過
}

function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** 相差幾個「日曆天」（不是 24 小時整除，跨午夜就算一天） */
export function getCalendarDaysAgo(startedAt: number, now: number): number {
  const startOfTrained = getStartOfDay(startedAt);
  const startOfNow = getStartOfDay(now);
  const diffMs = startOfNow - startOfTrained;
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function getSplitRotationStatus(
  workouts: Workout[],          // 已完成的訓練
  program: TrainingProgram | null,
  now: number,
  windowDays = 7,
): SplitStatus[] {
  const statuses: Record<SplitCategory, SplitStatus> = {
    '拉': { category: '拉', lastTrainedAt: null, daysAgo: null, doneInWindow: false },
    '推': { category: '推', lastTrainedAt: null, daysAgo: null, doneInWindow: false },
    '腿': { category: '腿', lastTrainedAt: null, daysAgo: null, doneInWindow: false },
    '手': { category: '手', lastTrainedAt: null, daysAgo: null, doneInWindow: false },
  };

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const since = now - windowMs;

  for (const workout of workouts) {
    if (workout.deletedAt) continue;

    const category = getWorkoutSplitCategory(workout, program);
    if (!category) continue;

    const current = statuses[category];
    
    if (workout.startedAt <= now) {
      if (current.lastTrainedAt === null || workout.startedAt > current.lastTrainedAt) {
        current.lastTrainedAt = workout.startedAt;
        current.daysAgo = getCalendarDaysAgo(workout.startedAt, now);
      }
      if (workout.startedAt > since) {
        current.doneInWindow = true;
      }
    }
  }

  return SPLIT_CATEGORIES.map(cat => statuses[cat]);
}
