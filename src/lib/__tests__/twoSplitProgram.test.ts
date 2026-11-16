import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { db, type Workout, type TrainingProgram } from '../../db/schema';
import { seedExercisesIfEmpty, listExercises } from '../../db/exercises';
import { saveProgram, getCurrentProgram } from '../../db/programs';
import { ZONGYUAN_PROGRAM_NAME } from '../../data/zongyuan-8week-program';
import {
  applyTwoSplitProgram,
  conformTemplateToDay,
  slimLegArmTemplatesOnce,
  isTwoSplitProgramActive,
  switchProgram,
  TWO_SPLIT_DAYS,
  TWO_SPLIT_PROGRAM_NAME,
} from '../twoSplitProgram';
import { getWorkoutSplitCategory } from '../splitRotation';
import { getComboSlotIds, pickOwnComboSlotId } from '../programLifecycle';

const NOW = new Date(2026, 9, 27, 18, 0).getTime();
const YESTERDAY = new Date(2026, 9, 26, 18, 0).getTime();

const oldProgram: TrainingProgram = {
  id: 'old-zongyuan',
  name: ZONGYUAN_PROGRAM_NAME,
  slots: [
    { id: 'o-push', label: '推 (Push)' },
    { id: 'o-pull', label: '拉 (Pull)' },
    { id: 'o-arms', label: '手 (Arms)' },
    { id: 'o-leg', label: '腿 (Leg)', selfScheduled: true },
  ],
  completedSlotIdsThisLap: ['o-push'],
  cycleCount: 3,
  estimatedWeeks: { min: 8, max: 8 },
  status: 'active',
  startedAt: 1000,
  createdAt: 1000,
  updatedAt: 1000,
};

async function workout(id: string, title: string, startedAt: number, names: string[], extra: Partial<Workout> = {}) {
  const exercises = await listExercises();
  const byName = new Map(exercises.map((e) => [e.name, e.id]));
  const w: Workout = {
    id,
    title,
    startedAt,
    endedAt: startedAt + 3_600_000,
    status: 'completed',
    entries: names.map((n, order) => ({ id: `${id}-${order}`, exerciseId: byName.get(n)!, order, sets: [] })),
    ...extra,
  };
  await db.workouts.put(w);
  return w;
}

describe('套用胸背／腿手二分化課表', () => {
  beforeAll(async () => {
    await seedExercisesIfEmpty();
    await saveProgram(oldProgram);
    await workout('hist-1', '10/26 推', YESTERDAY, ['槓鈴臥推'], { programId: 'old-zongyuan', programSlotId: 'o-push', programCycleNumber: 4 });
    // 今天練的胸背：從範本直接開，沒掛計畫，標題是自動標題
    await workout('today-cb', '10/27 胸+背', NOW - 3_600_000, ['槓鈴臥推', '引體向上', '坐姿划船（窄握）']);
    await applyTwoSplitProgram(NOW);
  });

  test('新課表成為目前計畫，舊計畫進封存而不是被刪', async () => {
    const current = await getCurrentProgram();
    expect(current?.name).toBe(TWO_SPLIT_PROGRAM_NAME);
    expect(current?.slots.map((s) => s.label)).toEqual(['胸背 A（重）', '腿手 A（重）', '胸背 B（輕）', '腿手 B（輕）']);
    const old = await db.programs.get('old-zongyuan');
    expect(old?.status).toBe('abandoned');
    expect(old?.deletedAt).toBeUndefined();
    expect(old?.cycleCount).toBe(3);
    expect(await isTwoSplitProgramActive()).toBe(true);
  });

  test('今天已練的胸背：只算胸背 A 那一格，其餘三格仍待練', async () => {
    const current = (await getCurrentProgram())!;
    expect(current.completedSlotIdsThisLap).toEqual(['slot-twosplit-cb-a']);
    expect(pickOwnComboSlotId(current, '胸背')).toBe('slot-twosplit-cb-b');
  });

  test('今天那筆補上計畫、格子與輪數；舊紀錄一筆都沒動', async () => {
    const today = await db.workouts.get('today-cb');
    expect(today?.programId).toBe('program-twosplit-v1');
    expect(today?.programSlotId).toBe('slot-twosplit-cb-a');
    expect(today?.programCycleNumber).toBe(1);
    const hist = await db.workouts.get('hist-1');
    expect(hist?.programId).toBe('old-zongyuan');
    expect(hist?.programSlotId).toBe('o-push');
    expect(hist?.programCycleNumber).toBe(4);
    expect(hist?.deletedAt).toBeUndefined();
  });

  test('四份範本：動作數、組數與重／輕日差異符合菜單', async () => {
    const templates = await Promise.all(TWO_SPLIT_DAYS.map((d) => db.templates.get(`tpl-twosplit-${d.key}`)));
    const [cbA, laA, cbB, laB] = templates;
    expect(cbA?.entries.map((x) => x.sets.length)).toEqual([4, 4, 4, 4, 3, 3]);
    expect(cbB?.entries.map((x) => x.sets.length)).toEqual([4, 4, 4, 4, 3, 3]);
    expect(laA?.entries.map((x) => x.sets.length)).toEqual([4, 3, 3, 3, 3, 3]);
    expect(laB?.entries.map((x) => x.sets.length)).toEqual([3, 3, 3, 3, 2, 2]);
    // 2026-11-16 精簡版：腿後勾、提踵都拿掉
    const exercises = await listExercises();
    const nameOf = (id: string) => exercises.find((x) => x.id === id)?.name;
    expect(laA?.entries.map((x) => nameOf(x.exerciseId))).not.toContain('腿後勾');
    expect(laA?.entries.map((x) => nameOf(x.exerciseId))).not.toContain('站姿提踵');
    expect(laB?.entries.map((x) => nameOf(x.exerciseId))).not.toContain('腿後勾');
    // 臀部髖伸只擇一：A 日 RDL、B 日臀推，不在同一天重複
    expect(laA?.entries.map((x) => nameOf(x.exerciseId))).toContain('羅馬尼亞硬舉');
    expect(laA?.entries.map((x) => nameOf(x.exerciseId))).not.toContain('槓鈴臀推');
    expect(laB?.entries.map((x) => nameOf(x.exerciseId))).toContain('槓鈴臀推');
    expect(laB?.entries.map((x) => nameOf(x.exerciseId))).not.toContain('羅馬尼亞硬舉');
    // 胸背 B 的臥推與引體休息 120 秒
    expect(cbB?.entries.slice(0, 2).map((x) => x.defaultRestSeconds)).toEqual([120, 120]);
    expect(cbA?.category).toBe('胸背');
    expect(laA?.category).toBe('腿手');
    // 引體向上有滑輪下拉當替代
    expect(cbA?.entries[1].candidateExerciseIds).toHaveLength(2);
  });

  test('四格輪替各自對得到分類，A 與 B 不會互相吃掉', async () => {
    const current = (await getCurrentProgram())!;
    for (const slot of current.slots) {
      const category = getWorkoutSplitCategory(
        { id: 'x', title: slot.label, startedAt: 1, status: 'completed', entries: [] },
        current,
      );
      expect(category).toBe(slot.label.startsWith('胸背') ? '胸背' : '腿手');
    }
    expect(getComboSlotIds(current, '胸背')).toEqual([]);
    expect(getComboSlotIds(current, '腿手')).toEqual([]);
  });

  test('重複套用不會長出重複的範本', async () => {
    await applyTwoSplitProgram(NOW + 1000);
    const twoSplitTemplates = (await db.templates.toArray()).filter((t) => t.id.startsWith('tpl-twosplit-'));
    expect(twoSplitTemplates).toHaveLength(4);
  });
});

describe('切換課表（宗諺 ⇄ 二分化）', () => {
  test('切回宗諺：二分化期間練的腿手算進宗諺的手，紀錄與舊進度都不動', async () => {
    const during = await workout('during-la', '10/27 腿手', Date.now() + 5_000, ['槓鈴深蹲', '啞鈴彎舉']);
    const histBefore = JSON.stringify(await db.workouts.get('hist-1'));
    const { markedSlots } = await switchProgram('zongyuan');
    const current = (await getCurrentProgram())!;
    expect(current.id).toBe('old-zongyuan');
    expect(current.cycleCount).toBe(3);
    // 原本就有的 o-push 保留，腿手 → 手（腿是自行安排，不算輪替）
    expect(current.completedSlotIdsThisLap.sort()).toEqual(['o-arms', 'o-push']);
    expect(markedSlots).toBe(1);
    expect(JSON.stringify(await db.workouts.get('hist-1'))).toBe(histBefore);
    expect((await db.workouts.get(during.id))?.deletedAt).toBeUndefined();
    const twoSplit = await db.programs.get('program-twosplit-v1');
    expect(twoSplit?.status).toBe('abandoned');
    expect(twoSplit?.completedSlotIdsThisLap).toEqual(['slot-twosplit-cb-a']);
  });

  test('再切回二分化：用原本那份（進度保留），不會重複建立、也不覆蓋範本', async () => {
    const before = await db.templates.get('tpl-twosplit-cb-a');
    await switchProgram('twosplit');
    const current = (await getCurrentProgram())!;
    expect(current.id).toBe('program-twosplit-v1');
    expect(current.completedSlotIdsThisLap).toContain('slot-twosplit-cb-a');
    expect((await db.templates.get('tpl-twosplit-cb-a'))?.entries[0].id).toBe(before?.entries[0].id);
    expect((await db.programs.toArray()).filter((p) => p.id === 'program-twosplit-v1')).toHaveLength(1);
  });
});

describe('腿手範本精簡版（保留已填重量）', () => {
  test('conformTemplateToDay：多的組數丟最輕的、少的補、沒在菜單的動作移除、順序照菜單', async () => {
    const exercises = await listExercises();
    const nameToId = new Map(exercises.map((x) => [x.name, x.id]));
    const set = (weight: number, reps: number) => ({
      id: crypto.randomUUID(), weight, reps, isWarmup: false, completed: false, createdAt: 1,
    });
    const entry = (name: string, order: number, sets: ReturnType<typeof set>[]) => ({
      id: `e-${name}`, exerciseId: nameToId.get(name)!, order, sets, defaultRestSeconds: 77,
    });
    const day = TWO_SPLIT_DAYS.find((d) => d.key === 'la-a')!;
    const template = {
      id: 'tpl-twosplit-la-a', name: '腿手 A（重）', category: '腿手' as const, createdAt: 1, updatedAt: 1,
      entries: [
        entry('槓鈴深蹲', 0, [set(30, 10), set(40, 10), set(45, 8), set(45, 8), set(45, 8)]),
        entry('羅馬尼亞硬舉', 1, [set(40, 8), set(30, 8), set(35, 8), set(35, 8)]),
        entry('腿後勾', 2, [set(0, 12), set(0, 12), set(0, 12)]),
        entry('啞鈴側平舉', 3, [set(6, 15), set(6, 15)]),
      ],
    };
    const out = conformTemplateToDay(template, day, nameToId, 999);
    const names = out.entries.map((x) => exercises.find((ex) => ex.id === x.exerciseId)?.name);
    expect(names).toEqual(['槓鈴深蹲', '羅馬尼亞硬舉', '啞鈴肩推', '啞鈴側平舉', '啞鈴彎舉', '纜繩下壓（繩索）']);
    expect(out.entries.map((x) => x.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out.entries[0].sets.map((x) => x.weight)).toEqual([40, 45, 45, 45]); // 丟掉最輕的 30
    expect(out.entries[1].sets.map((x) => x.weight)).toEqual([40, 35, 35]); // 丟掉最輕的 30
    expect(out.entries[3].sets.map((x) => x.weight)).toEqual([6, 6, 6]); // 補一組
    expect(out.entries[0].defaultRestSeconds).toBe(77); // 沿用使用者的休息秒數
    expect(out.entries[2].sets).toHaveLength(3); // 範本沒有的動作用預設組數補上
    expect(out.updatedAt).toBe(999);
  });

  test('slimLegArmTemplatesOnce：只做一次，之後使用者自己加的組數不會被蓋掉', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    const before = await db.templates.get('tpl-twosplit-la-b');
    expect(before).toBeTruthy();
    expect(await slimLegArmTemplatesOnce(5000)).toBe(true);
    const after = await db.templates.get('tpl-twosplit-la-b');
    expect(after?.entries.map((x) => x.sets.length)).toEqual([3, 3, 3, 3, 2, 2]);
    // 使用者之後手動加一組
    await db.templates.put({
      ...after!,
      entries: after!.entries.map((x, i) => (i === 0 ? { ...x, sets: [...x.sets, { ...x.sets[0], id: 'extra' }] } : x)),
    });
    expect(await slimLegArmTemplatesOnce(6000)).toBe(false);
    expect((await db.templates.get('tpl-twosplit-la-b'))?.entries[0].sets).toHaveLength(4);
    vi.unstubAllGlobals();
  });
});
