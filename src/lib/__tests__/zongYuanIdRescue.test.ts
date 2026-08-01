import { describe, test, expect } from 'vitest';
import { discoverZongYuanAliases } from '../zongYuanIdRescue';
import { seedExerciseId } from '../../data/seed-exercises';
import { ZONGYUAN_8WEEK_PLAN } from '../../data/zongyuan-8week-program';
import type { Exercise, WorkoutTemplate, WorkoutEntry } from '../../db/schema';

const PULL = ZONGYUAN_8WEEK_PLAN[0];   // 拉 (Pull)：槓鈴划船 / 滑輪下拉（寬握）/ 機械水平划船 / 滑輪下拉（寬握）/ 肩膀後三角

function exercise(id: string, name: string, isCustom = false): Exercise {
  return { id, name, muscleGroup: '背', equipment: '纜繩', isCustom, createdAt: 1 };
}

function entry(exerciseId: string, order: number): WorkoutEntry {
  return { id: `e${order}`, exerciseId, order, sets: [] };
}

/** 依課表順序組一個範本，callback 決定每一格要塞什麼 id */
function pullTemplate(idAt: (index: number, name: string) => string): WorkoutTemplate {
  return {
    id: 't-pull',
    name: PULL.label,
    createdAt: 1,
    updatedAt: 1,
    entries: PULL.exercises.map((ex, i) => entry(idAt(i, ex.exerciseName), i)),
  };
}

/** 動作庫：課表用到的動作全部都在（內建的用 seed id，自訂的用 uuid） */
const LIBRARY: Exercise[] = [
  exercise(seedExerciseId('槓鈴划船'), '槓鈴划船'),
  exercise(seedExerciseId('滑輪下拉（寬握）'), '滑輪下拉（寬握）'),
  exercise('custom-hori-row', '機械水平划船', true),
  exercise('custom-rear-delt', '肩膀後三角', true),
];

const NO_ALIASES = new Map<string, string>();

describe('宗諺課表孤兒動作救援（按範本名 + 順序反推）', () => {
  test('內建動作的舊隨機 id 被還原成正確的 seed id', () => {
    // 自訂動作查得到（id 全裝置一致），內建動作是別台裝置的舊隨機 id → 孤兒
    const template = pullTemplate((i, name) => {
      if (name === '機械水平划船') return 'custom-hori-row';
      if (name === '肩膀後三角') return 'custom-rear-delt';
      return `dead-uuid-${i}`;
    });

    const discovered = discoverZongYuanAliases([template], LIBRARY, NO_ALIASES);

    expect(discovered.get('dead-uuid-0')).toBe(seedExerciseId('槓鈴划船'));
    expect(discovered.get('dead-uuid-1')).toBe(seedExerciseId('滑輪下拉（寬握）'));
    expect(discovered.get('dead-uuid-3')).toBe(seedExerciseId('滑輪下拉（寬握）'));
    expect(discovered.size).toBe(3);
  });

  test('先走既有對照再判斷：已經有 alias 能解到活動作的不算孤兒', () => {
    const template = pullTemplate((i, name) => {
      if (name === '機械水平划船') return 'custom-hori-row';
      if (name === '肩膀後三角') return 'custom-rear-delt';
      if (i === 0) return 'old-row-id';
      return `dead-uuid-${i}`;
    });
    const aliases = new Map([['old-row-id', seedExerciseId('槓鈴划船')]]);

    const discovered = discoverZongYuanAliases([template], LIBRARY, aliases);

    expect(discovered.has('old-row-id')).toBe(false);
    expect(discovered.size).toBe(2);
  });

  test('對照鏈的終點才是要修的 id（A→B→查不到）', () => {
    const template = pullTemplate((i, name) => {
      if (name === '機械水平划船') return 'custom-hori-row';
      if (name === '肩膀後三角') return 'custom-rear-delt';
      if (i === 0) return 'a';
      return `dead-uuid-${i}`;
    });
    const aliases = new Map([['a', 'b']]);   // b 也查不到

    const discovered = discoverZongYuanAliases([template], LIBRARY, aliases);

    expect(discovered.get('b')).toBe(seedExerciseId('槓鈴划船'));
    expect(discovered.has('a')).toBe(false);
  });

  test('順序被調動過就整個範本跳過（寧可不修，也不要綁錯動作）', () => {
    // 第 3 格（原本是機械水平划船）被換成別的動作 → 結構已漂移
    const template = pullTemplate((i, name) => {
      if (i === 2) return seedExerciseId('槓鈴划船');
      if (name === '肩膀後三角') return 'custom-rear-delt';
      return `dead-uuid-${i}`;
    });

    expect(discoverZongYuanAliases([template], LIBRARY, NO_ALIASES).size).toBe(0);
  });

  test('動作筆數與課表不一致就跳過（使用者自己增刪過）', () => {
    const template = pullTemplate((i, name) => (name === '機械水平划船' ? 'custom-hori-row' : `dead-uuid-${i}`));
    template.entries = template.entries.slice(0, 3);

    expect(discoverZongYuanAliases([template], LIBRARY, NO_ALIASES).size).toBe(0);
  });

  test('範本名稱對不上課表就跳過', () => {
    const template = pullTemplate((i) => `dead-uuid-${i}`);
    template.name = '我自己的拉日';

    expect(discoverZongYuanAliases([template], LIBRARY, NO_ALIASES).size).toBe(0);
  });

  test('軟刪除的範本不參與救援', () => {
    const template = pullTemplate((i, name) => (name === '機械水平划船' ? 'custom-hori-row' : `dead-uuid-${i}`));
    template.deletedAt = Date.now();

    expect(discoverZongYuanAliases([template], LIBRARY, NO_ALIASES).size).toBe(0);
  });

  test('目標動作本身也不在動作庫時，不硬湊', () => {
    const library = LIBRARY.filter((e) => e.name !== '肩膀後三角');
    const template = pullTemplate((i, name) => (name === '機械水平划船' ? 'custom-hori-row' : `dead-uuid-${i}`));

    const discovered = discoverZongYuanAliases([template], library, NO_ALIASES);

    expect(discovered.has('dead-uuid-4')).toBe(false);   // 肩膀後三角那格
    expect(discovered.size).toBe(3);
  });

  test('同名多筆時以內建動作為準（自訂重複品不會被綁上）', () => {
    const library = [...LIBRARY, exercise('dup-custom-row', '槓鈴划船', true)];
    const template = pullTemplate((i, name) => {
      if (name === '機械水平划船') return 'custom-hori-row';
      if (name === '肩膀後三角') return 'custom-rear-delt';
      return `dead-uuid-${i}`;
    });

    const discovered = discoverZongYuanAliases([template], library, NO_ALIASES);

    expect(discovered.get('dead-uuid-0')).toBe(seedExerciseId('槓鈴划船'));
  });

  test('軟刪除的動作不能當救援目標', () => {
    const library = LIBRARY.map((e) =>
      e.name === '槓鈴划船' ? { ...e, deletedAt: Date.now() } : e,
    );
    const template = pullTemplate((i, name) => {
      if (name === '機械水平划船') return 'custom-hori-row';
      if (name === '肩膀後三角') return 'custom-rear-delt';
      return `dead-uuid-${i}`;
    });

    const discovered = discoverZongYuanAliases([template], library, NO_ALIASES);

    expect(discovered.has('dead-uuid-0')).toBe(false);
  });
});
