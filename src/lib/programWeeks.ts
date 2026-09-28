import {
  type CandidateSets,
  type SetLog,
  type WeekTarget,
  type WorkoutEntry,
  type WorkoutTemplate,
} from '../db/schema';
import {
  addAlternativeToEntry,
  clonePlannedSets,
  defaultAlternativeSets,
  removeAlternativeFromEntry,
  replaceEntryExercise,
} from './workoutEntries';

/**
 * 課表（8 週漸進）的週次目標工具：讀某週該練幾組幾下、判斷這週跳過的動作、
 * 課表頁「編輯」的草稿（按儲存時再選「8 週同步」或「只改這週」）、以及用某週內容產生空白範本。
 *
 * 規則：
 * - entry.weeklyTargets[i] 是主動作第 i+1 週的目標；sets = 0 ＝那週不做這個動作。
 * - 替代動作可以有自己的 candidateSets[].weeklyTargets；沒有就跟主動作一樣。
 * - 超過陣列長度的週次夾在最後一週（跟開訓時 buildEntrySets 一致）。
 */

export const PROGRAM_WEEK_COUNT = 8;
export const DEFAULT_WEEK_TARGET: WeekTarget = { sets: 3, reps: 10 };

function clampIndex(length: number, weekIdx: number): number {
  return Math.min(Math.max(weekIdx, 0), length - 1);
}

function stashOf(entry: WorkoutEntry, exerciseId: string): CandidateSets | undefined {
  return entry.candidateSets?.find((c) => c.exerciseId === exerciseId);
}

/** 某個動作（主動作或替代）實際套用的週次目標；替代沒有自己的就用主動作的 */
export function ownTargetsOf(entry: WorkoutEntry, exerciseId: string = entry.exerciseId): WeekTarget[] | undefined {
  const main = entry.weeklyTargets && entry.weeklyTargets.length > 0 ? entry.weeklyTargets : undefined;
  if (exerciseId === entry.exerciseId) return main;
  const own = stashOf(entry, exerciseId)?.weeklyTargets;
  return own && own.length > 0 ? own : main;
}

/** 第 weekIdx 週（0-indexed）這個動作的組數×次數；沒有週次目標時從存著的組推出來 */
export function weekTargetOf(
  entry: WorkoutEntry,
  weekIdx: number,
  exerciseId: string = entry.exerciseId,
): WeekTarget {
  const targets = ownTargetsOf(entry, exerciseId);
  if (targets) return targets[clampIndex(targets.length, weekIdx)];
  const stored = exerciseId === entry.exerciseId ? entry.sets : (stashOf(entry, exerciseId)?.sets ?? entry.sets);
  return { sets: stored.length, reps: stored[0]?.reps ?? 0 };
}

/** 這週跳過這個動作（課表「只改這週」刪掉的） */
export function isSkippedInWeek(entry: WorkoutEntry, weekIdx: number): boolean {
  const targets = ownTargetsOf(entry);
  return !!targets && targets[clampIndex(targets.length, weekIdx)].sets === 0;
}

/** 補滿 8 週（短的夾最後一週；完全沒有就用存著的組推，推不出來用 3×10） */
export function fullWeeks(targets: WeekTarget[] | undefined, fallbackSets: SetLog[]): WeekTarget[] {
  const fallback: WeekTarget = {
    sets: fallbackSets.length || DEFAULT_WEEK_TARGET.sets,
    reps: fallbackSets[0]?.reps || DEFAULT_WEEK_TARGET.reps,
  };
  return Array.from({ length: PROGRAM_WEEK_COUNT }, (_, i) => {
    const t = targets && targets.length > 0 ? targets[clampIndex(targets.length, i)] : fallback;
    return { ...t };
  });
}

/** 依一週目標排出要做的組（都是正式組，重量用 baseWeight） */
export function buildWeekSets(target: WeekTarget, baseWeight: number, now: number = Date.now()): SetLog[] {
  return Array.from({ length: target.sets }, () => ({
    id: crypto.randomUUID(),
    weight: baseWeight,
    reps: target.reps,
    isWarmup: false,
    completed: false,
    createdAt: now,
  }));
}

/**
 * 從課表開訓時，替代動作各自的組：組數×次數照它自己（或主動作）那週的目標，
 * 重量用範本存著的；存的是 0 或根本沒存，就用 lastWeightOf（上次實際做這個動作的重量）。
 * 沒有週次目標的一般範本動作，存著的組照抄；沒存的留給訓練中第一次切換時再去翻歷史。
 */
export function programAlternatives(
  entry: WorkoutEntry,
  cycleNumber: number,
  lastWeightOf: (exerciseId: string) => number | undefined,
  now: number = Date.now(),
): Pick<WorkoutEntry, 'candidateExerciseIds' | 'candidateSets'> {
  const ids = entry.candidateExerciseIds;
  if (!ids || ids.length <= 1) return {};
  const weekIdx = cycleNumber - 1;
  const stash: CandidateSets[] = [];
  for (const id of ids) {
    if (id === entry.exerciseId) continue;
    const stored = stashOf(entry, id);
    const targets = ownTargetsOf(entry, id);
    if (targets) {
      const storedWeight = (stored && startingWeightOf(stored.sets)) ?? 0;
      const baseWeight = storedWeight > 0 ? storedWeight : (lastWeightOf(id) ?? 0);
      const target = targets[clampIndex(targets.length, weekIdx)];
      stash.push({ exerciseId: id, sets: buildWeekSets({ ...target, sets: Math.max(target.sets, 1) }, baseWeight, now) });
    } else if (stored) {
      stash.push({ exerciseId: id, sets: clonePlannedSets(stored.sets, now) });
    }
  }
  return stash.length > 0 ? { candidateExerciseIds: [...ids], candidateSets: stash } : { candidateExerciseIds: [...ids] };
}

/** 上次做這個動作時的起始重量：第一個正式組，沒有正式組就第一組 */
export function startingWeightOf(sets: SetLog[]): number | undefined {
  const first = sets.find((s) => !s.isWarmup) ?? sets[0];
  return first?.weight;
}

// ─────────────────────────── 用某週內容產生空白範本 ───────────────────────────

function blankSetsFor(entry: WorkoutEntry, exerciseId: string, weekIdx: number, now: number): SetLog[] | undefined {
  const targets = ownTargetsOf(entry, exerciseId);
  if (targets) {
    const target = targets[clampIndex(targets.length, weekIdx)];
    return buildWeekSets({ ...target, sets: Math.max(target.sets, 1) }, 0, now);
  }
  const stored = exerciseId === entry.exerciseId ? entry.sets : stashOf(entry, exerciseId)?.sets;
  if (!stored) return undefined;
  return clonePlannedSets(stored, now).map((s) => {
    const blank = { ...s, weight: 0 };
    delete blank.assistWeight;
    return blank;
  });
}

/**
 * 課表某一天、某一週的內容 → 一份新的一般範本（不帶週次目標）：
 * 這週要做的動作、組數×次數照那週排好，重量全部留白（0）；這週跳過的動作不放。
 * 替代動作一起帶，各自照自己那週的組數×次數。
 */
export function buildBlankTemplateFromProgramDay(
  source: WorkoutTemplate,
  weekIdx: number,
  name: string,
  now: number = Date.now(),
): WorkoutTemplate {
  const entries: WorkoutEntry[] = [...source.entries]
    .sort((a, b) => a.order - b.order)
    .filter((entry) => !isSkippedInWeek(entry, weekIdx))
    .map((entry, index) => {
      const ids = entry.candidateExerciseIds;
      let alternatives: Pick<WorkoutEntry, 'candidateExerciseIds' | 'candidateSets'> = {};
      if (ids && ids.length > 1) {
        const stash: CandidateSets[] = [];
        for (const id of ids) {
          if (id === entry.exerciseId) continue;
          const sets = blankSetsFor(entry, id, weekIdx, now);
          if (sets) stash.push({ exerciseId: id, sets });
        }
        alternatives = stash.length > 0 ? { candidateExerciseIds: [...ids], candidateSets: stash } : { candidateExerciseIds: [...ids] };
      }
      return {
        id: crypto.randomUUID(),
        exerciseId: entry.exerciseId,
        ...alternatives,
        order: index,
        sets: blankSetsFor(entry, entry.exerciseId, weekIdx, now) ?? [],
        ...(entry.defaultRestSeconds !== undefined ? { defaultRestSeconds: entry.defaultRestSeconds } : {}),
      };
    });

  return {
    id: crypto.randomUUID(),
    name,
    ...(source.category ? { category: source.category } : {}),
    ...(source.location ? { location: source.location } : {}),
    entries,
    createdAt: now,
    updatedAt: now,
  };
}

// ─────────────────────────── 課表頁「編輯」草稿 ───────────────────────────

/**
 * 課表頁編輯某一天時的草稿。數字只改正在看的那一週（weekIdx），
 * 儲存時才決定「8 週同步」還是「只改這週」（applyWeekEdit）。
 * 換動作、替代動作的增減、順序是結構改動，兩種儲存都一樣套到 8 週。
 */
export interface WeekEditDraft {
  weekIdx: number;
  entries: WorkoutEntry[];
  /** 原本就有的 entry id（其餘是這次新增的） */
  originalIds: string[];
  /** 使用者動過組數/次數的目標：主動作用 entryId，替代動作用 `${entryId}|${exerciseId}` */
  touched: string[];
}

export type WeekEditScope = 'all' | 'week';

export function targetKey(entryId: string, altExerciseId?: string): string {
  return altExerciseId ? `${entryId}|${altExerciseId}` : entryId;
}

function reindex(entries: WorkoutEntry[]): WorkoutEntry[] {
  return entries.map((e, i) => (e.order === i ? e : { ...e, order: i }));
}

function withTouched(draft: WeekEditDraft, key: string): string[] {
  return draft.touched.includes(key) ? draft.touched : [...draft.touched, key];
}

/** 主動作的週次目標補滿 8 週（動到這個動作時才補，沒動的動作維持原樣） */
function ensureMainWeeks(entry: WorkoutEntry): WorkoutEntry {
  if (entry.weeklyTargets && entry.weeklyTargets.length === PROGRAM_WEEK_COUNT) return entry;
  return { ...entry, weeklyTargets: fullWeeks(entry.weeklyTargets, entry.sets) };
}

export function startWeekEdit(template: WorkoutTemplate, weekIdx: number): WeekEditDraft {
  return {
    weekIdx,
    entries: reindex([...template.entries].sort((a, b) => a.order - b.order)),
    originalIds: template.entries.map((e) => e.id),
    touched: [],
  };
}

function mapEntry(draft: WeekEditDraft, entryId: string, fn: (entry: WorkoutEntry) => WorkoutEntry): WorkoutEntry[] {
  return draft.entries.map((e) => (e.id === entryId ? fn(e) : e));
}

/**
 * 改這週某個動作（或它的某個替代動作）的組數/次數。改過就不再顯示教練原始備註。
 * 替代動作第一次設自己的數字時才建立它的 stash；baseSets 是它的起始組（通常是上次做它的紀錄，決定起始重量）。
 */
export function setDraftTarget(
  draft: WeekEditDraft,
  entryId: string,
  exerciseId: string,
  patch: Partial<Pick<WeekTarget, 'sets' | 'reps'>>,
  baseSets?: SetLog[],
): WeekEditDraft {
  const w = draft.weekIdx;
  let key = targetKey(entryId);
  const entries = mapEntry(draft, entryId, (original) => {
    const entry = ensureMainWeeks(original);
    const mainWeeks = entry.weeklyTargets!;
    if (exerciseId === entry.exerciseId) {
      const weeks = mainWeeks.map((t) => ({ ...t }));
      weeks[w] = { sets: patch.sets ?? weeks[w].sets, reps: patch.reps ?? weeks[w].reps };
      return { ...entry, weeklyTargets: weeks };
    }
    key = targetKey(entryId, exerciseId);
    const existing = entry.candidateSets?.find((c) => c.exerciseId === exerciseId);
    const altWeeks = fullWeeks(existing?.weeklyTargets ?? mainWeeks, existing?.sets ?? entry.sets);
    altWeeks[w] = { sets: patch.sets ?? altWeeks[w].sets, reps: patch.reps ?? altWeeks[w].reps };
    const stash: CandidateSets = existing
      ? { ...existing, weeklyTargets: altWeeks }
      : { exerciseId, sets: baseSets ?? defaultAlternativeSets(entry.sets), weeklyTargets: altWeeks };
    return {
      ...entry,
      candidateSets: [...(entry.candidateSets ?? []).filter((c) => c.exerciseId !== exerciseId), stash],
    };
  });
  return { ...draft, entries, touched: withTouched(draft, key) };
}

/** 這週不做這個動作。這次才新增的動作直接拿掉。這天至少要留一個動作，呼叫端先檢查 plannedCount */
export function skipDraftEntry(draft: WeekEditDraft, entryId: string): WeekEditDraft {
  if (!draft.originalIds.includes(entryId)) {
    return {
      ...draft,
      entries: reindex(draft.entries.filter((e) => e.id !== entryId)),
      touched: draft.touched.filter((k) => k !== entryId && !k.startsWith(`${entryId}|`)),
    };
  }
  const w = draft.weekIdx;
  const entries = mapEntry(draft, entryId, (original) => {
    const entry = ensureMainWeeks(original);
    const weeks = entry.weeklyTargets!.map((t) => ({ ...t }));
    weeks[w] = { sets: 0, reps: weeks[w].reps };
    return { ...entry, weeklyTargets: weeks };
  });
  return { ...draft, entries };
}

/** 這週跳過的動作加回來：數字用這週原本的，原本就是 0 就找最近一週有做的，都沒有用 3×10 */
export function restoreDraftEntry(draft: WeekEditDraft, original: WorkoutTemplate, entryId: string): WeekEditDraft {
  const w = draft.weekIdx;
  const source = original.entries.find((e) => e.id === entryId) ?? draft.entries.find((e) => e.id === entryId);
  if (!source) return draft;
  const sourceWeeks = fullWeeks(source.weeklyTargets, source.sets);
  let restored = sourceWeeks[w].sets > 0 ? sourceWeeks[w] : undefined;
  for (let d = 1; !restored && d < PROGRAM_WEEK_COUNT; d++) {
    restored = [sourceWeeks[w - d], sourceWeeks[w + d]].find((t) => t && t.sets > 0);
  }
  const value = restored ?? DEFAULT_WEEK_TARGET;
  const entries = mapEntry(draft, entryId, (current) => {
    const entry = ensureMainWeeks(current);
    const weeks = entry.weeklyTargets!.map((t) => ({ ...t }));
    weeks[w] = { ...value };
    return { ...entry, weeklyTargets: weeks };
  });
  return { ...draft, entries, touched: withTouched(draft, targetKey(entryId)) };
}

/** 新增一個動作（這週 3×10、重量 0）；存成 8 週同步或只有這週由 applyWeekEdit 決定 */
export function addDraftEntry(draft: WeekEditDraft, exerciseId: string, now: number = Date.now()): WeekEditDraft {
  const entry: WorkoutEntry = {
    id: crypto.randomUUID(),
    exerciseId,
    order: draft.entries.length,
    sets: buildWeekSets(DEFAULT_WEEK_TARGET, 0, now),
    weeklyTargets: fullWeeks([DEFAULT_WEEK_TARGET], []),
  };
  return { ...draft, entries: [...draft.entries, entry] };
}

/**
 * 加一個替代動作。起始組數×次數跟主動作每週一樣（之後可以各自改），
 * baseSets 決定它在範本裡存的起始重量（上次做它的紀錄；沒做過就給重量 0 的組）。
 */
export function addDraftAlternative(
  draft: WeekEditDraft,
  entryId: string,
  exerciseId: string,
  baseSets: SetLog[],
): WeekEditDraft {
  const entries = addAlternativeToEntry(draft.entries, entryId, exerciseId).map((current) => {
    if (current.id !== entryId || current.exerciseId === exerciseId) return current;
    if (current.candidateSets?.some((c) => c.exerciseId === exerciseId)) return current;
    const entry = ensureMainWeeks(current);
    return {
      ...entry,
      candidateSets: [
        ...(entry.candidateSets ?? []),
        { exerciseId, sets: baseSets, weeklyTargets: entry.weeklyTargets!.map((t) => ({ ...t })) },
      ],
    };
  });
  return { ...draft, entries };
}

export function removeDraftAlternative(draft: WeekEditDraft, entryId: string, exerciseId: string): WeekEditDraft {
  return {
    ...draft,
    entries: removeAlternativeFromEntry(draft.entries, entryId, exerciseId),
    touched: draft.touched.filter((k) => k !== targetKey(entryId, exerciseId)),
  };
}

export function replaceDraftExercise(draft: WeekEditDraft, entryId: string, exerciseId: string): WeekEditDraft {
  return {
    ...draft,
    entries: replaceEntryExercise(draft.entries, entryId, exerciseId),
    touched: draft.touched.filter((k) => k !== targetKey(entryId, exerciseId)),
  };
}

export function moveDraftEntry(draft: WeekEditDraft, entryId: string, direction: 'up' | 'down'): WeekEditDraft {
  const index = draft.entries.findIndex((e) => e.id === entryId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= draft.entries.length) return draft;
  const next = [...draft.entries];
  [next[index], next[target]] = [next[target], next[index]];
  return { ...draft, entries: reindex(next) };
}

/** 這週實際要做的動作數（跳過的不算） */
export function plannedCount(draft: WeekEditDraft): number {
  return draft.entries.filter((e) => !isSkippedInWeek(e, draft.weekIdx)).length;
}

function flat(target: WeekTarget): WeekTarget[] {
  return Array.from({ length: PROGRAM_WEEK_COUNT }, () => ({ sets: target.sets, reps: target.reps }));
}

/**
 * 把草稿存回範本。
 * - 'all'（8 週同步）：改過數字的動作／替代動作，8 週都變成這週的數字；這週刪掉的動作 8 週都拿掉；新增的 8 週都有。
 * - 'week'（只改這週）：只有這週的數字變；刪掉的只有這週不做；新增的只有這週有。
 * 結構改動（換動作、替代增減、順序）兩種都一樣。8 週全是 0 組的動作會整個拿掉。
 */
export function applyWeekEdit(original: WorkoutTemplate, draft: WeekEditDraft, scope: WeekEditScope): WorkoutTemplate {
  const w = draft.weekIdx;
  const originalById = new Map(original.entries.map((e) => [e.id, e]));
  const touched = new Set(draft.touched);
  const result: WorkoutEntry[] = [];

  for (const entry of draft.entries) {
    const before = originalById.get(entry.id);
    let next = entry;

    if (!before) {
      // 這次新增的動作
      const target = weekTargetOf(entry, w);
      next = {
        ...entry,
        weeklyTargets: Array.from({ length: PROGRAM_WEEK_COUNT }, (_, i) =>
          scope === 'all' || i === w ? { sets: target.sets, reps: target.reps } : { sets: 0, reps: target.reps },
        ),
        ...(entry.candidateSets
          ? {
              candidateSets: entry.candidateSets.map((c) =>
                c.weeklyTargets ? { ...c, weeklyTargets: flat(weekTargetOf(entry, w, c.exerciseId)) } : c,
              ),
            }
          : {}),
      };
    } else {
      const wasPlanned = !isSkippedInWeek(before, w) && weekTargetOf(before, w).sets > 0;
      if (scope === 'all' && wasPlanned && isSkippedInWeek(entry, w)) continue; // 8 週都拿掉
      if (scope === 'all') {
        if (touched.has(targetKey(entry.id))) {
          next = { ...next, weeklyTargets: flat(weekTargetOf(entry, w)) };
        }
        if (entry.candidateSets?.some((c) => touched.has(targetKey(entry.id, c.exerciseId)))) {
          next = {
            ...next,
            candidateSets: entry.candidateSets.map((c) =>
              touched.has(targetKey(entry.id, c.exerciseId))
                ? { ...c, weeklyTargets: flat(weekTargetOf(entry, w, c.exerciseId)) }
                : c,
            ),
          };
        }
      }
    }

    if (next.weeklyTargets && next.weeklyTargets.length > 0 && next.weeklyTargets.every((t) => t.sets === 0)) continue;
    result.push(next);
  }

  return { ...original, entries: reindex(result) };
}
