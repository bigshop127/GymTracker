import { type SetLog, type Workout, type WorkoutEntry, type WorkoutTemplate } from '../db/schema';
import { carryAlternatives, clonePlannedSets } from './workoutEntries';
import { isSkippedInWeek, ownTargetsOf } from './programWeeks';

/**
 * 完成訓練時「這次跟範本／課表哪裡不一樣」的比對，以及「更新範本，之後照這樣」的合併。
 *
 * 動作對應規則：同一個 exerciseId，或落在同一組替代動作裡（例如範本是 A⇄B、今天選 B）就算同一個動作。
 * 有 weeklyTargets（依週次漸進）的動作，組數/次數由課表週次決定，這裡只比對、只更新重量。
 * 課表「只改這週」刪掉的動作（那週 0 組）不算這次預定要做的：不會被列成「沒做」，更新時也原樣留著。
 */

export interface SetSummary {
  sets: number;       // 總組數（含暖身）
  topWeight: number;  // 正式組最高重量（kg）；有氧為 0
  minReps: number;    // 正式組次數範圍
  maxReps: number;
  minutes: number;    // 有氧總時長（分），力量動作為 0
}

export type TemplateChange =
  | { kind: 'added'; exerciseId: string }
  | { kind: 'removed'; exerciseId: string }
  | {
      kind: 'changed';
      exerciseId: string;
      /** 這次改做範本裡的另一個替代動作時，範本原本選定的那個 */
      swappedFromExerciseId?: string;
      /** 範本裡沒存過這個替代動作的數字（第一次做）時為 undefined */
      before?: SetSummary;
      after: SetSummary;
      /** 依週次漸進的動作：組數/次數照課表週次，更新時只改重量 */
      weeklyLocked: boolean;
    }
  | { kind: 'reordered' };

export function summarizeSets(sets: SetLog[]): SetSummary {
  const working = sets.filter((s) => !s.isWarmup);
  const basis = working.length > 0 ? working : sets;
  const reps = basis.map((s) => s.reps);
  return {
    sets: sets.length,
    topWeight: basis.reduce((max, s) => Math.max(max, s.weight), 0),
    minReps: reps.length > 0 ? Math.min(...reps) : 0,
    maxReps: reps.length > 0 ? Math.max(...reps) : 0,
    minutes: Math.round(sets.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60),
  };
}

function sameSummary(a: SetSummary, b: SetSummary, weightOnly: boolean): boolean {
  if (Math.abs(a.topWeight - b.topWeight) > 0.01) return false;
  if (weightOnly) return true;
  return a.sets === b.sets && a.minReps === b.minReps && a.maxReps === b.maxReps && a.minutes === b.minutes;
}

function candidatesOf(entry: WorkoutEntry): string[] {
  return entry.candidateExerciseIds && entry.candidateExerciseIds.length > 1
    ? entry.candidateExerciseIds
    : [entry.exerciseId];
}

/** 找範本裡對應的動作：先找同一個選定動作，再找替代清單有交集的；已配對過的不重複用 */
function findMatch(
  templateEntries: WorkoutEntry[],
  workoutEntry: WorkoutEntry,
  used: Set<string>,
): WorkoutEntry | undefined {
  const free = templateEntries.filter((t) => !used.has(t.id));
  const exact = free.find((t) => t.exerciseId === workoutEntry.exerciseId);
  if (exact) return exact;
  const mine = new Set(candidatesOf(workoutEntry));
  return free.find((t) => candidatesOf(t).some((id) => mine.has(id)));
}

function sortByOrder(entries: WorkoutEntry[]): WorkoutEntry[] {
  return [...entries].sort((a, b) => a.order - b.order);
}

/** 這次（第 cycleNumber 輪）預定要做的動作：課表這週跳過的不算 */
function plannedEntries(template: WorkoutTemplate, cycleNumber: number | undefined): WorkoutEntry[] {
  if (cycleNumber === undefined) return template.entries;
  return template.entries.filter((e) => !isSkippedInWeek(e, cycleNumber - 1));
}

/** 範本對某動作的「預定」組數：有週次目標（替代動作有自己的就用自己的）就照第 cycleNumber 週，不然照範本存的組 */
function plannedSummary(entry: WorkoutEntry, exerciseId: string, cycleNumber: number | undefined): SetSummary | undefined {
  const stored = entry.exerciseId === exerciseId
    ? entry.sets
    : entry.candidateSets?.find((c) => c.exerciseId === exerciseId)?.sets;
  if (!stored) return undefined;
  const targets = ownTargetsOf(entry, exerciseId);
  if (!targets || cycleNumber === undefined) return summarizeSets(stored);
  const target = targets[Math.min(Math.max(cycleNumber - 1, 0), targets.length - 1)];
  const base = summarizeSets(stored);
  return { ...base, sets: target.sets, minReps: target.reps, maxReps: target.reps };
}

export function diffWorkoutAgainstTemplate(
  template: WorkoutTemplate,
  workout: Workout,
  cycleNumber?: number,
): TemplateChange[] {
  const changes: TemplateChange[] = [];
  const used = new Set<string>();
  const matchedOrder: number[] = [];
  const planned = plannedEntries(template, cycleNumber);

  for (const wEntry of sortByOrder(workout.entries)) {
    const match = findMatch(planned, wEntry, used);
    if (!match) {
      changes.push({ kind: 'added', exerciseId: wEntry.exerciseId });
      continue;
    }
    used.add(match.id);
    matchedOrder.push(match.order);

    const weeklyLocked = !!ownTargetsOf(match, wEntry.exerciseId);
    const before = plannedSummary(match, wEntry.exerciseId, cycleNumber);
    const after = summarizeSets(wEntry.sets);
    const swappedFromExerciseId = match.exerciseId !== wEntry.exerciseId ? match.exerciseId : undefined;
    if (!swappedFromExerciseId && before && sameSummary(before, after, weeklyLocked)) continue;
    changes.push({ kind: 'changed', exerciseId: wEntry.exerciseId, swappedFromExerciseId, before, after, weeklyLocked });
  }

  for (const tEntry of sortByOrder(planned)) {
    if (!used.has(tEntry.id)) changes.push({ kind: 'removed', exerciseId: tEntry.exerciseId });
  }

  // 同樣這幾個動作、只是順序換了
  if (matchedOrder.some((order, i) => i > 0 && order < matchedOrder[i - 1])) {
    changes.push({ kind: 'reordered' });
  }

  return changes;
}

/**
 * 用一次訓練的內容更新範本（「更新範本／課表，之後照這樣」）：
 * 動作清單、順序、選定的替代動作、每個動作（含替代）的組數重量都換成這次的；
 * 範本的 id/名稱/分類/建立時間保留；對應得到的動作保留原本的 weeklyTargets 與 entry id
 * （這次改做替代動作時，換成那個替代動作自己的週次目標，原本那個的收進替代清單）。
 * 課表這週本來就跳過的動作原樣留著，插回它原本的前後位置。
 */
export function mergeWorkoutIntoTemplate(
  template: WorkoutTemplate,
  workout: Workout,
  now: number = Date.now(),
): WorkoutTemplate {
  const cycleNumber = workout.programCycleNumber;
  const planned = plannedEntries(template, cycleNumber);
  const plannedIds = new Set(planned.map((e) => e.id));
  const skipped = template.entries.filter((e) => !plannedIds.has(e.id));
  const used = new Set<string>();

  const merged: { entry: WorkoutEntry; templateEntryId?: string }[] = sortByOrder(workout.entries).map((wEntry) => {
    // 這週跳過的動作今天還是做了：對回同一個 entry，不要多出一個重複的
    const match = findMatch(planned, wEntry, used) ?? findMatch(skipped, wEntry, used);
    if (match) used.add(match.id);
    const restSeconds = wEntry.defaultRestSeconds ?? match?.defaultRestSeconds;
    const weeklyTargets = match ? ownTargetsOf(match, wEntry.exerciseId) : undefined;
    const alternatives = carryAlternatives(wEntry, (sets) => clonePlannedSets(sets, now));
    if (match && alternatives.candidateSets) {
      alternatives.candidateSets = alternatives.candidateSets.map((c) => {
        const own = ownTargetsOf(match, c.exerciseId);
        return own && JSON.stringify(own) !== JSON.stringify(weeklyTargets)
          ? { ...c, weeklyTargets: own.map((t) => ({ ...t })) }
          : c;
      });
    }
    return {
      templateEntryId: match?.id,
      entry: {
        id: match?.id ?? crypto.randomUUID(),
        exerciseId: wEntry.exerciseId,
        ...alternatives,
        order: 0,
        sets: clonePlannedSets(wEntry.sets, now),
        ...(restSeconds !== undefined ? { defaultRestSeconds: restSeconds } : {}),
        ...(weeklyTargets ? { weeklyTargets: weeklyTargets.map((t) => ({ ...t })) } : {}),
      },
    };
  });

  // 這週跳過、今天也沒做的：插在它原本前一個動作的後面
  const originalOrder = sortByOrder(template.entries);
  for (const entry of sortByOrder(skipped)) {
    if (used.has(entry.id)) continue;
    let insertAt = 0;
    const before = originalOrder.slice(0, originalOrder.findIndex((e) => e.id === entry.id)).reverse();
    for (const prev of before) {
      const idx = merged.findIndex((m) => m.templateEntryId === prev.id);
      if (idx >= 0) {
        insertAt = idx + 1;
        break;
      }
    }
    merged.splice(insertAt, 0, { entry: { ...entry }, templateEntryId: entry.id });
  }

  return {
    ...template,
    ...(workout.location !== undefined ? { location: workout.location } : {}),
    entries: merged.map((m, index) => ({ ...m.entry, order: index })),
    updatedAt: now,
  };
}
