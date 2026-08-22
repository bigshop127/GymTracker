import { type TrainingProgram } from '../db/schema';

const MS_PER_WEEK = 604800000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 這份計畫是不是「目前計畫」（進行中或暫停中） */
export function isCurrentProgram(p: TrainingProgram): boolean {
  return p.status === 'active' || p.status === 'paused';
}

/** 進行中 → 暫停中。已經是 paused 就原樣回傳（冪等，避免重複點擊蓋掉 pausedAt） */
export function pauseProgram(p: TrainingProgram, now: number): TrainingProgram {
  if (p.status === 'paused') return p;
  return {
    ...p,
    status: 'paused',
    pausedAt: now,
    updatedAt: now,
  };
}

/** 暫停中 → 進行中，把這段暫停時間累加進 accumulatedPausedMs，清掉 pausedAt */
export function resumeProgram(p: TrainingProgram, now: number): TrainingProgram {
  if (p.status !== 'paused') return p;
  const pausedSegmentMs = now - (p.pausedAt ?? now);
  return {
    ...p,
    status: 'active',
    pausedAt: undefined,
    accumulatedPausedMs: (p.accumulatedPausedMs ?? 0) + pausedSegmentMs,
    updatedAt: now,
  };
}

/** 結束：completed（跑完）或 abandoned（中止）。若當下是 paused，先把暫停時間結算掉再結束 */
export function endProgram(
  p: TrainingProgram,
  now: number,
  reason: 'completed' | 'abandoned',
): TrainingProgram {
  let accumulatedPausedMs = p.accumulatedPausedMs ?? 0;
  if (p.status === 'paused') {
    accumulatedPausedMs += now - (p.pausedAt ?? now);
  }
  return {
    ...p,
    status: reason,
    pausedAt: undefined,
    accumulatedPausedMs,
    completedAt: now,
    updatedAt: now,
  };
}

/**
 * 重新開始：回傳「要封存的舊計畫」與「全新的計畫」兩筆，由呼叫端一起寫入。
 * - archived: status 'abandoned'、completedAt = now（若原本 paused 也先結算暫停時間）
 * - fresh:    新 id、status 'active'、cycleCount 0、completedSlotIdsThisLap []、
 *             startedAt/createdAt/updatedAt = now、pausedAt undefined、accumulatedPausedMs 0、
 *             completedAt undefined、runNumber = (p.runNumber ?? 1) + 1、
 *             restartedFromProgramId = p.id、
 *             slots = p.slots 深拷貝但 id 與 templateId 原樣沿用、name 沿用不改
 */
export function restartProgram(
  p: TrainingProgram,
  now: number,
): { archived: TrainingProgram; fresh: TrainingProgram } {
  const archived = endProgram(p, now, 'abandoned');
  const fresh: TrainingProgram = {
    ...p,
    id: crypto.randomUUID(),
    slots: p.slots.map((s) => ({ ...s })),
    completedSlotIdsThisLap: [],
    cycleCount: 0,
    status: 'active',
    startedAt: now,
    completedAt: undefined,
    createdAt: now,
    updatedAt: now,
    pausedAt: undefined,
    accumulatedPausedMs: 0,
    runNumber: (p.runNumber ?? 1) + 1,
    restartedFromProgramId: p.id,
  };
  return { archived, fresh };
}

/** 已進行週數（扣掉暫停）。paused 期間以 pausedAt 當「現在」，週數才會真的停住 */
export function getElapsedWeeks(p: TrainingProgram, now: number): number {
  const end = p.status === 'paused' ? (p.pausedAt ?? now) : (p.completedAt ?? now);
  const ms = Math.max(0, end - p.startedAt - (p.accumulatedPausedMs ?? 0));
  return ms / MS_PER_WEEK;
}

/** 已暫停天數（只有 paused 才有意義，其餘回 0），給「已暫停 N 天」文案用 */
export function getPausedDays(p: TrainingProgram, now: number): number {
  if (p.status !== 'paused') return 0;
  const ms = Math.max(0, now - (p.pausedAt ?? now));
  return Math.floor(ms / MS_PER_DAY);
}
