import { describe, test, expect } from 'vitest';
import { isCardioTemplate, filterCardioTemplates, getTemplateTotalMinutes } from '../cardioTemplates';
import { buildExerciseMap } from '../workoutSummary';
import { type Exercise, type WorkoutTemplate, type SetLog } from '../../db/schema';

const now = 1_700_000_000_000;

function makeExercise(id: string, name: string, muscleGroup: Exercise['muscleGroup']): Exercise {
  return { id, name, muscleGroup, equipment: '其他', isCustom: false, createdAt: now };
}

const exercises: Exercise[] = [
  makeExercise('run', '跑步機', '有氧'),
  makeExercise('bike', '飛輪', '有氧'),
  makeExercise('bench', '槓鈴臥推', '胸'),
];
const exMap = buildExerciseMap(exercises);

function makeSet(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: crypto.randomUUID(),
    weight: 0,
    reps: 0,
    isWarmup: false,
    completed: false,
    createdAt: now,
    ...overrides,
  };
}

function makeTemplate(name: string, exerciseIds: string[], sets: SetLog[][] = []): WorkoutTemplate {
  return {
    id: `tpl-${name}`,
    name,
    createdAt: now,
    updatedAt: now,
    entries: exerciseIds.map((exerciseId, order) => ({
      id: `entry-${name}-${order}`,
      exerciseId,
      order,
      sets: sets[order] ?? [makeSet()],
    })),
  };
}

describe('cardioTemplates', () => {
  describe('isCardioTemplate', () => {
    test('全部動作都是有氧 → true', () => {
      expect(isCardioTemplate(makeTemplate('純有氧', ['run', 'bike']), exMap)).toBe(true);
    });

    test('混了重訓動作 → false（不能出現在有氧清單）', () => {
      expect(isCardioTemplate(makeTemplate('混合', ['run', 'bench']), exMap)).toBe(false);
    });

    test('全部都是重訓 → false', () => {
      expect(isCardioTemplate(makeTemplate('推日', ['bench']), exMap)).toBe(false);
    });

    test('孤兒 id（動作庫查無）→ false，寧可漏抓不錯抓', () => {
      expect(isCardioTemplate(makeTemplate('孤兒', ['run', 'ghost']), exMap)).toBe(false);
      expect(isCardioTemplate(makeTemplate('全孤兒', ['ghost']), exMap)).toBe(false);
    });

    test('空範本 → false', () => {
      expect(isCardioTemplate(makeTemplate('空的', []), exMap)).toBe(false);
    });
  });

  describe('filterCardioTemplates', () => {
    test('只留有氧範本並維持原順序', () => {
      const list = [
        makeTemplate('A有氧', ['run']),
        makeTemplate('B推日', ['bench']),
        makeTemplate('C有氧', ['bike', 'run']),
        makeTemplate('D混合', ['bike', 'bench']),
      ];
      expect(filterCardioTemplates(list, exMap).map((t) => t.name)).toEqual(['A有氧', 'C有氧']);
    });

    test('動作庫還沒載入（空 map）→ 全部不算有氧', () => {
      const list = [makeTemplate('A有氧', ['run'])];
      expect(filterCardioTemplates(list, new Map())).toEqual([]);
    });
  });

  describe('getTemplateTotalMinutes', () => {
    test('加總所有 set 的時長並四捨五入到分鐘', () => {
      const tpl = makeTemplate('有氧', ['run', 'bike'], [
        [makeSet({ durationSeconds: 1200 })],
        [makeSet({ durationSeconds: 600 }), makeSet({ durationSeconds: 30 })],
      ]);
      expect(getTemplateTotalMinutes(tpl)).toBe(31); // 1830s → 30.5 → 31
    });

    test('沒有任何 durationSeconds → 0', () => {
      expect(getTemplateTotalMinutes(makeTemplate('重訓', ['bench']))).toBe(0);
    });
  });
});
