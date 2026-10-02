import { type ProgramSlot, type Workout, type WorkoutEntry } from '../db/schema';
import { normalizeSplit } from './splitRotation';

/**
 * 課表頁「每輪紀錄」：某一天（推／拉／手／腿）每一輪實際做了什麼，跟上一次比哪裡變了。
 * 資料直接從訓練紀錄算（不另外存）；以「完成打勾的正式組」為準，整個動作都沒打勾就退回看全部正式組。
 */

export interface LapEntrySummary {
  exerciseId: string;
  sets: number;
  minReps: number;
  maxReps: number;
  topWeight: number;      // kg，正式組最重的一組
  minAssist?: number;     // kg，輔助動作最少的輔助（越少越強）
  minutes: number;        // 有氧時長（分），力量動作 0
}

export interface LapEntryDiff {
  isNew: boolean;                      // 上一次沒做這個動作
  weightDelta: number;                 // kg，0＝沒變
  assistDelta: number;                 // kg，負數＝輔助變少（進步）
  sets?: [number, number];             // 組數有變才有：[上次, 這次]
  reps?: [string, string];             // 次數有變才有：[上次, 這次]（'8' 或 '6–8'）
}

export interface LapRecord {
  workout: Workout;
  lap: number | null;                  // programCycleNumber；沒記到就 null
  fromOtherRun: boolean;               // 前一次計畫（重新開始／重新匯入之前）的紀錄
  entries: { summary: LapEntrySummary; diff: LapEntryDiff | null }[]; // 最舊那筆沒得比，diff 為 null
  droppedExerciseIds: string[];        // 上一次有做、這次沒做
}

const EPSILON = 0.01;

export function formatRepsRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

export function summarizeLapEntry(entry: WorkoutEntry): LapEntrySummary | null {
  const working = entry.sets.filter((s) => !s.isWarmup);
  const done = working.filter((s) => s.completed);
  const basis = done.length > 0 ? done : working;
  if (basis.length === 0) return null;
  const reps = basis.map((s) => s.reps);
  const assists = basis.map((s) => s.assistWeight).filter((a): a is number => typeof a === 'number' && a > 0);
  return {
    exerciseId: entry.exerciseId,
    sets: basis.length,
    minReps: Math.min(...reps),
    maxReps: Math.max(...reps),
    topWeight: basis.reduce((max, s) => Math.max(max, s.weight), 0),
    ...(assists.length > 0 ? { minAssist: Math.min(...assists) } : {}),
    minutes: Math.round(basis.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60),
  };
}

export function diffLapEntry(prev: LapEntrySummary | undefined, curr: LapEntrySummary): LapEntryDiff {
  if (!prev) return { isNew: true, weightDelta: 0, assistDelta: 0 };
  const weightDelta = Math.abs(curr.topWeight - prev.topWeight) > EPSILON ? curr.topWeight - prev.topWeight : 0;
  const assistDelta =
    prev.minAssist !== undefined && curr.minAssist !== undefined && Math.abs(curr.minAssist - prev.minAssist) > EPSILON
      ? curr.minAssist - prev.minAssist
      : 0;
  const prevReps = formatRepsRange(prev.minReps, prev.maxReps);
  const currReps = formatRepsRange(curr.minReps, curr.maxReps);
  return {
    isNew: false,
    weightDelta,
    assistDelta,
    ...(prev.sets !== curr.sets ? { sets: [prev.sets, curr.sets] as [number, number] } : {}),
    ...(prevReps !== currReps ? { reps: [prevReps, currReps] as [string, string] } : {}),
  };
}

export function hasLapChange(diff: LapEntryDiff | null): boolean {
  return !!diff && (diff.isNew || diff.weightDelta !== 0 || diff.assistDelta !== 0 || !!diff.sets || !!diff.reps);
}

/**
 * 某一天（slot）的每輪紀錄，新的在前。
 * 收：這份計畫這一格的紀錄；以及「別份計畫」（重新開始／重新匯入前）有記輪數、標題同分類的紀錄，
 * 標成 fromOtherRun，讓換過計畫的人也看得到以前的輪。
 */
export function buildLapHistory(
  workouts: Workout[],
  slot: Pick<ProgramSlot, 'id' | 'label'>,
  programId: string,
): LapRecord[] {
  const category = normalizeSplit(slot.label);
  const matched = workouts
    .filter((w) => !w.deletedAt && w.status === 'completed')
    .filter((w) => {
      if (w.programSlotId === slot.id) return true;
      return (
        !!category &&
        !!w.programId &&
        w.programId !== programId &&
        w.programCycleNumber !== undefined &&
        normalizeSplit(w.title) === category
      );
    })
    .sort((a, b) => a.startedAt - b.startedAt);

  const records: LapRecord[] = [];
  let previous: Map<string, LapEntrySummary> | null = null;
  for (const workout of matched) {
    const summaries = [...workout.entries]
      .sort((a, b) => a.order - b.order)
      .map(summarizeLapEntry)
      .filter((s): s is LapEntrySummary => !!s);
    const prev: Map<string, LapEntrySummary> | null = previous;
    records.push({
      workout,
      lap: workout.programCycleNumber ?? null,
      fromOtherRun: workout.programId !== programId,
      entries: summaries.map((summary) => ({
        summary,
        diff: prev ? diffLapEntry(prev.get(summary.exerciseId), summary) : null,
      })),
      droppedExerciseIds: prev
        ? [...prev.keys()].filter((id) => !summaries.some((s) => s.exerciseId === id))
        : [],
    });
    previous = new Map(summaries.map((s) => [s.exerciseId, s]));
  }
  return records.reverse();
}
