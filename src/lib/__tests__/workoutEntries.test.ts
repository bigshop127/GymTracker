import { describe, test, expect } from 'vitest';
import { selectEntryExercise, addAlternativeToEntry, removeAlternativeFromEntry, replaceEntryExercise } from '../workoutEntries';
import { createTemplateFromWorkout } from '../../db/templates';
import { type WorkoutEntry, type Workout } from '../../db/schema';

describe('Workout Entries alternatives', () => {
  const mockEntries: WorkoutEntry[] = [
    {
      id: 'entry-1',
      exerciseId: 'ex-bench-press',
      order: 0,
      sets: [
        { id: 'set-1', weight: 60, reps: 10, isWarmup: false, completed: true, createdAt: 1000 },
      ],
    },
    {
      id: 'entry-2',
      exerciseId: 'ex-squat',
      candidateExerciseIds: ['ex-squat', 'ex-leg-press'],
      order: 1,
      sets: [
        { id: 'set-2', weight: 100, reps: 8, isWarmup: false, completed: true, createdAt: 1000 },
      ],
    },
  ];

  test('1. addAlternativeToEntry: single action entry to multiple', () => {
    const result = addAlternativeToEntry(mockEntries, 'entry-1', 'ex-dumbbell-press');
    const entry = result.find(e => e.id === 'entry-1')!;
    expect(entry.exerciseId).toBe('ex-bench-press');
    expect(entry.candidateExerciseIds).toEqual(['ex-bench-press', 'ex-dumbbell-press']);
  });

  test('2. addAlternativeToEntry deduplication: already present', () => {
    // case 2a: equal to exerciseId
    const result1 = addAlternativeToEntry(mockEntries, 'entry-1', 'ex-bench-press');
    expect(result1).toEqual(mockEntries);

    // case 2b: already in candidate list
    const result2 = addAlternativeToEntry(mockEntries, 'entry-2', 'ex-leg-press');
    expect(result2).toEqual(mockEntries);
  });

  test('3. selectEntryExercise: switch active exercise', () => {
    const result = selectEntryExercise(mockEntries, 'entry-2', 'ex-leg-press');
    const entry = result.find(e => e.id === 'entry-2')!;
    expect(entry.exerciseId).toBe('ex-leg-press');
    expect(entry.candidateExerciseIds).toEqual(['ex-squat', 'ex-leg-press']);
  });

  test('4. selectEntryExercise safety check: not in candidate list', () => {
    const result = selectEntryExercise(mockEntries, 'entry-2', 'ex-deadlift');
    expect(result).toEqual(mockEntries);
  });

  test('5. removeAlternativeFromEntry: remove alternative and shrink to undefined', () => {
    // 3 candidates -> 2 candidates
    const entriesWithThree: WorkoutEntry[] = [
      {
        id: 'entry-3',
        exerciseId: 'ex-1',
        candidateExerciseIds: ['ex-1', 'ex-2', 'ex-3'],
        order: 0,
        sets: [],
      },
    ];
    const result1 = removeAlternativeFromEntry(entriesWithThree, 'entry-3', 'ex-3');
    const entry1 = result1.find(e => e.id === 'entry-3')!;
    expect(entry1.candidateExerciseIds).toEqual(['ex-1', 'ex-2']);

    // 2 candidates -> shrink to undefined
    const result2 = removeAlternativeFromEntry(mockEntries, 'entry-2', 'ex-leg-press');
    const entry2 = result2.find(e => e.id === 'entry-2')!;
    expect(entry2.candidateExerciseIds).toBeUndefined();
  });

  test('6. removeAlternativeFromEntry safety check: cannot remove active selection', () => {
    const result = removeAlternativeFromEntry(mockEntries, 'entry-2', 'ex-squat');
    expect(result).toEqual(mockEntries);
  });

  test('7. Safety checks for unknown entryId', () => {
    expect(selectEntryExercise(mockEntries, 'non-existent', 'ex-leg-press')).toEqual(mockEntries);
    expect(addAlternativeToEntry(mockEntries, 'non-existent', 'ex-dumbbell-press')).toEqual(mockEntries);
    expect(removeAlternativeFromEntry(mockEntries, 'non-existent', 'ex-leg-press')).toEqual(mockEntries);
    expect(replaceEntryExercise(mockEntries, 'non-existent', 'ex-leg-press')).toEqual(mockEntries);
  });

  test('9. replaceEntryExercise: 單一動作直接換掉，組數不動', () => {
    const result = replaceEntryExercise(mockEntries, 'entry-1', 'ex-dumbbell-press');
    const entry = result.find(e => e.id === 'entry-1')!;
    expect(entry.exerciseId).toBe('ex-dumbbell-press');
    expect(entry.candidateExerciseIds).toBeUndefined();
    expect(entry.sets).toEqual(mockEntries[0].sets);
  });

  test('10. replaceEntryExercise: 候選清單裡的舊 id 一併換掉', () => {
    const result = replaceEntryExercise(mockEntries, 'entry-2', 'ex-hack-squat');
    const entry = result.find(e => e.id === 'entry-2')!;
    expect(entry.exerciseId).toBe('ex-hack-squat');
    expect(entry.candidateExerciseIds).toEqual(['ex-hack-squat', 'ex-leg-press']);
  });

  test('11. replaceEntryExercise: 換成清單裡已有的動作時去重並收回單一動作', () => {
    const result = replaceEntryExercise(mockEntries, 'entry-2', 'ex-leg-press');
    const entry = result.find(e => e.id === 'entry-2')!;
    expect(entry.exerciseId).toBe('ex-leg-press');
    expect(entry.candidateExerciseIds).toBeUndefined();
  });

  test('12. replaceEntryExercise: 換成同一個動作視為沒事發生', () => {
    expect(replaceEntryExercise(mockEntries, 'entry-1', 'ex-bench-press')).toEqual(mockEntries);
  });

  test('8. createTemplateFromWorkout: clones candidateExerciseIds', () => {
    const workout: Workout = {
      id: 'w-1',
      title: 'Workout with Alt',
      startedAt: 1000,
      status: 'active',
      entries: [
        {
          id: 'entry-alt',
          exerciseId: 'ex-squat',
          candidateExerciseIds: ['ex-squat', 'ex-leg-press'],
          order: 0,
          sets: [
            { id: 'set-s', weight: 100, reps: 5, isWarmup: false, completed: true, createdAt: 1000 },
          ],
        },
      ],
    };

    const template = createTemplateFromWorkout(workout, 'My Template');
    expect(template.entries[0].candidateExerciseIds).toEqual(['ex-squat', 'ex-leg-press']);
  });
});
