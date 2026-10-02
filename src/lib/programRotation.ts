import { type ProgramSlot, type TrainingProgram } from '../db/schema';
import { ZONGYUAN_PROGRAM_NAME } from '../data/zongyuan-8week-program';
import { normalizeSplit, type SplitCategory } from './splitRotation';

/**
 * 課表輪替（2026-10-02 改版）：
 * - 班表只自動排「輪替格子」，照課表順序一直接下去（推→拉→手→推…）。
 * - 標成「自行安排」(slot.selfScheduled) 的格子（腿日）不自動排、不算進「一輪」；
 *   使用者在班表指定那天或訓練頁點那格才會練，練的組數照當下那一輪。
 */

/** 會被班表自動輪替的格子，維持課表順序 */
export function rotationSlotsOf(program: Pick<TrainingProgram, 'slots'>): ProgramSlot[] {
  return program.slots.filter((s) => !s.selfScheduled);
}

/**
 * 把「這輪已練」整理乾淨：只留還在輪替裡的格子；輪替格子全練完就進下一輪。
 * 完成一格、或改了課表（加刪格子、切換自行安排）之後都過一次。
 */
export function settleLap(
  program: Pick<TrainingProgram, 'slots' | 'completedSlotIdsThisLap' | 'cycleCount'>,
): Pick<TrainingProgram, 'completedSlotIdsThisLap' | 'cycleCount'> {
  const rotationIds = new Set(rotationSlotsOf(program).map((s) => s.id));
  const done = [...new Set(program.completedSlotIdsThisLap ?? [])].filter((id) => rotationIds.has(id));
  if (rotationIds.size > 0 && done.length >= rotationIds.size) {
    return { completedSlotIdsThisLap: [], cycleCount: program.cycleCount + 1 };
  }
  return { completedSlotIdsThisLap: done, cycleCount: program.cycleCount };
}

const ROTATION_RANK: Partial<Record<SplitCategory, number>> = { 推: 0, 拉: 1, 手: 2 };
const OTHER_RANK = 3;
const SELF_SCHEDULED_RANK = 4;

/**
 * 拉/推/腿/手 四格的課表 → 推→拉→手 輪替＋腿自行安排（腿排最後）。
 * 不是這種四格課表（少了推/拉/手/腿任一格）就回 null，不去動它。
 */
export function toPushPullArmsRotation<T extends { label: string; selfScheduled?: boolean }>(
  slots: T[],
): (T & { selfScheduled?: boolean })[] | null {
  const categories = slots.map((s) => normalizeSplit(s.label));
  const required: SplitCategory[] = ['推', '拉', '手', '腿'];
  if (!required.every((c) => categories.includes(c))) return null;
  return slots
    .map((slot, index) => {
      const category = categories[index];
      const rank = category === '腿' ? SELF_SCHEDULED_RANK : (category && ROTATION_RANK[category]) ?? OTHER_RANK;
      return { slot, index, rank, isLeg: category === '腿' };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ slot, isLeg }) => (isLeg ? { ...slot, selfScheduled: true } : { ...slot }));
}

/**
 * 一次性調整（Dexie v13）：使用者目前的宗諺課表改成 推→拉→手 輪替、腿自行安排。
 * 只動「目前計畫」（進行中／暫停中）；任何一格已經設過 selfScheduled（使用者自己調過）就不動。
 * 不需要調整回 null。
 */
export function migrateProgramToPushPullArms(p: TrainingProgram, now: number): TrainingProgram | null {
  if (p.deletedAt || (p.status !== 'active' && p.status !== 'paused')) return null;
  if (p.name !== ZONGYUAN_PROGRAM_NAME) return null;
  if (!Array.isArray(p.slots) || p.slots.some((s) => s.selfScheduled !== undefined)) return null;
  const slots = toPushPullArmsRotation(p.slots);
  if (!slots) return null;
  const next = { ...p, slots };
  return { ...next, ...settleLap(next), updatedAt: now };
}
