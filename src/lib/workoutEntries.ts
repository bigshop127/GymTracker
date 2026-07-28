import { type WorkoutEntry } from '../db/schema';

/** 把某個候選設為「當前選定＝要記錄」。id 不在候選清單內則原樣返回（防呆）。 */
export function selectEntryExercise(
  entries: WorkoutEntry[],
  entryId: string,
  exerciseId: string,
): WorkoutEntry[] {
  return entries.map(entry => {
    if (entry.id !== entryId) return entry;
    if (!entry.candidateExerciseIds || !entry.candidateExerciseIds.includes(exerciseId)) {
      return entry;
    }
    return {
      ...entry,
      exerciseId,
    };
  });
}

/**
 * 對某 entry 新增一個替代候選。
 * - 若該 entry 原本沒有 candidateExerciseIds，先初始化成 [entry.exerciseId]，再 append。
 * - 已存在（等於當前 exerciseId 或已在清單內）→ 去重、不重複加。
 * - 不改變當前選定（exerciseId 不動）：新增替代只是「多一個選項」，不是「換成它」。
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

/**
 * 移除一個替代候選。
 * - 不允許移除「當前選定」的那個（要換先 select 別的）。呼叫端應在 UI 就不給選定的 chip 出現 ✕。
 * - 移除後若清單長度 ≤ 1 → 直接把 candidateExerciseIds 設回 undefined，回到單一動作。
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
    if (updatedCandidates.length <= 1) {
      const updatedEntry = { ...entry };
      delete updatedEntry.candidateExerciseIds;
      return updatedEntry;
    }
    return {
      ...entry,
      candidateExerciseIds: updatedCandidates,
    };
  });
}
