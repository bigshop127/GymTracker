import { type WorkoutEntry, type SetLog, type CandidateSets } from '../db/schema';

/**
 * 把一串組複製成「還沒做」的新組：換新 id、completed 一律 false、不帶 rpe（上次的感受不該變成這次的預設）。
 * 重量/次數/暖身與有氧、輔助欄位照抄。
 */
export function clonePlannedSets(sets: SetLog[], now: number = Date.now()): SetLog[] {
  return sets.map((setLog) => ({
    id: crypto.randomUUID(),
    weight: setLog.weight,
    reps: setLog.reps,
    isWarmup: setLog.isWarmup,
    completed: false,
    createdAt: now,
    ...(setLog.durationSeconds !== undefined && { durationSeconds: setLog.durationSeconds }),
    ...(setLog.distanceKm !== undefined && { distanceKm: setLog.distanceKm }),
    ...(setLog.calories !== undefined && { calories: setLog.calories }),
    ...(setLog.assistWeight !== undefined && { assistWeight: setLog.assistWeight }),
  }));
}

/**
 * 從來沒做過的替代動作：組數、次數、暖身照目前這個動作排，重量從 0 開始
 * （器材不同，重量沿用反而誤導）。目前這個動作一組都沒有時給一組空白的。
 */
export function defaultAlternativeSets(currentSets: SetLog[], now: number = Date.now()): SetLog[] {
  const base = currentSets.length > 0 ? currentSets : [{ reps: 0, isWarmup: false }];
  return base.map((setLog) => ({
    id: crypto.randomUUID(),
    weight: 0,
    reps: setLog.reps,
    isWarmup: setLog.isWarmup,
    completed: false,
    createdAt: now,
  }));
}

/**
 * 複製一個 entry 要帶到新訓練/新範本的替代動作資訊（候選清單＋各自的組數）。
 * 只剩一個候選就什麼都不帶（回到單一動作）；組數用 mapSets 轉換（例如重置 completed、套週次目標）。
 * 用法：`{ ...entryFields, ...carryAlternatives(entry, fn) }`
 */
export function carryAlternatives(
  entry: WorkoutEntry,
  mapSets: (sets: SetLog[]) => SetLog[],
): Pick<WorkoutEntry, 'candidateExerciseIds' | 'candidateSets'> {
  const ids = entry.candidateExerciseIds;
  if (!ids || ids.length <= 1) return {};
  const stash: CandidateSets[] = (entry.candidateSets ?? [])
    .filter((c) => c.exerciseId !== entry.exerciseId && ids.includes(c.exerciseId))
    .map((c) => ({ exerciseId: c.exerciseId, sets: mapSets(c.sets) }));
  return stash.length > 0
    ? { candidateExerciseIds: [...ids], candidateSets: stash }
    : { candidateExerciseIds: [...ids] };
}

/**
 * 把某個候選設為「當前選定＝要記錄」。id 不在候選清單內則原樣返回（防呆）。
 * 每個候選的組數各自獨立：目前這個動作的 sets 先收進 candidateSets，
 * 再換上新選那個自己的組數——存過就拿存的，沒存過用 fallbackSets（通常是上次做這個動作的紀錄），
 * 再沒有就 defaultAlternativeSets（同組數同次數、重量歸零）。
 */
export function selectEntryExercise(
  entries: WorkoutEntry[],
  entryId: string,
  exerciseId: string,
  fallbackSets?: SetLog[],
): WorkoutEntry[] {
  return entries.map(entry => {
    if (entry.id !== entryId) return entry;
    if (!entry.candidateExerciseIds || !entry.candidateExerciseIds.includes(exerciseId)) {
      return entry;
    }
    if (entry.exerciseId === exerciseId) return entry;

    const stored = entry.candidateSets?.find((c) => c.exerciseId === exerciseId);
    const nextSets = stored ? stored.sets : (fallbackSets ?? defaultAlternativeSets(entry.sets));
    // 範本（課表）裡替代動作可以有自己的週次目標：跟著一起換；沒有自己的就沿用主動作的
    const nextTargets = stored?.weeklyTargets ?? entry.weeklyTargets;
    const keepOldTargets =
      !!entry.weeklyTargets && JSON.stringify(entry.weeklyTargets) !== JSON.stringify(nextTargets);
    const stash: CandidateSets[] = [
      ...(entry.candidateSets ?? [])
        .filter((c) => c.exerciseId !== exerciseId && c.exerciseId !== entry.exerciseId)
        // 原本跟著主動作週次的其他替代：主動作換了，數字照舊不跟著變
        .map((c) => (keepOldTargets && !c.weeklyTargets ? { ...c, weeklyTargets: entry.weeklyTargets } : c)),
      {
        exerciseId: entry.exerciseId,
        sets: entry.sets,
        ...(keepOldTargets ? { weeklyTargets: entry.weeklyTargets } : {}),
      },
    ];
    return {
      ...entry,
      exerciseId,
      sets: nextSets,
      candidateSets: stash,
      ...(nextTargets ? { weeklyTargets: nextTargets } : {}),
    };
  });
}

/** 切到某個候選時，它是不是已經有自己存著的組數（沒有的話呼叫端才需要去翻歷史找上次紀錄） */
export function hasStoredCandidateSets(entry: WorkoutEntry, exerciseId: string): boolean {
  return entry.exerciseId === exerciseId || !!entry.candidateSets?.some((c) => c.exerciseId === exerciseId);
}

/**
 * 對某 entry 新增一個替代候選。
 * - 若該 entry 原本沒有 candidateExerciseIds，先初始化成 [entry.exerciseId]，再 append。
 * - 已存在（等於當前 exerciseId 或已在清單內）→ 去重、不重複加。
 * - 不改變當前選定（exerciseId 不動）：新增替代只是「多一個選項」，不是「換成它」。
 *   它自己的組數等第一次切過去（selectEntryExercise）才產生。
 */
export function addAlternativeToEntry(
  entries: WorkoutEntry[],
  entryId: string,
  exerciseId: string,
): WorkoutEntry[] {
  return entries.map(entry => {
    if (entry.id !== entryId) return entry;
    const currentCandidates = entry.candidateExerciseIds || [entry.exerciseId];
    if (currentCandidates.includes(exerciseId)) {
      return entry;
    }
    return {
      ...entry,
      candidateExerciseIds: [...currentCandidates, exerciseId],
    };
  });
}

/** 候選收回剩一個時，替代相關欄位整組拿掉，回到單一動作 */
function collapseIfSingle(entry: WorkoutEntry): WorkoutEntry {
  if (entry.candidateExerciseIds && entry.candidateExerciseIds.length > 1) return entry;
  const single = { ...entry };
  delete single.candidateExerciseIds;
  delete single.candidateSets;
  return single;
}

/**
 * 直接把某個 entry 的動作換成另一個（不是「多一個候選」，是「換掉」）。
 * 用於動作 id 在動作庫查不到（孤兒參照）時讓使用者重新指定；
 * 候選清單裡的舊 id 一併換掉，換完只剩一個候選就收回單一動作。
 * 已經是同一個動作則原樣返回。
 */
export function replaceEntryExercise(
  entries: WorkoutEntry[],
  entryId: string,
  exerciseId: string,
): WorkoutEntry[] {
  return entries.map(entry => {
    if (entry.id !== entryId) return entry;
    const oldId = entry.exerciseId;
    if (oldId === exerciseId) return entry;

    const updatedEntry: WorkoutEntry = { ...entry, exerciseId };
    if (entry.candidateExerciseIds) {
      updatedEntry.candidateExerciseIds = [
        ...new Set(entry.candidateExerciseIds.map(id => (id === oldId ? exerciseId : id))),
      ];
      // 換成的動作若本來就是某個替代，它存著的組作廢（目前的 sets 已經算它的了）
      if (entry.candidateSets) {
        updatedEntry.candidateSets = entry.candidateSets.filter((c) => c.exerciseId !== exerciseId);
      }
    }
    return collapseIfSingle(updatedEntry);
  });
}

/**
 * 移除一個替代候選（連同它存著的組數）。
 * - 不允許移除「當前選定」的那個（要換先 select 別的）。呼叫端應在 UI 就不給選定的 chip 出現 ✕。
 * - 移除後若清單長度 ≤ 1 → 替代欄位整組拿掉，回到單一動作。
 */
export function removeAlternativeFromEntry(
  entries: WorkoutEntry[],
  entryId: string,
  exerciseId: string,
): WorkoutEntry[] {
  return entries.map(entry => {
    if (entry.id !== entryId) return entry;
    if (entry.exerciseId === exerciseId) {
      return entry;
    }
    if (!entry.candidateExerciseIds) {
      return entry;
    }
    const updatedCandidates = entry.candidateExerciseIds.filter(id => id !== exerciseId);
    if (updatedCandidates.length === entry.candidateExerciseIds.length) {
      return entry;
    }
    const updatedEntry: WorkoutEntry = {
      ...entry,
      candidateExerciseIds: updatedCandidates,
    };
    if (entry.candidateSets) {
      updatedEntry.candidateSets = entry.candidateSets.filter((c) => c.exerciseId !== exerciseId);
    }
    return collapseIfSingle(updatedEntry);
  });
}
