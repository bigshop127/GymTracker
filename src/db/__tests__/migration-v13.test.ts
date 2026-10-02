import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, test, expect, beforeAll } from 'vitest';
import { ZONGYUAN_PROGRAM_NAME } from '../../data/zongyuan-8week-program';

const V12_STORES = {
  exercises: 'id, name, muscleGroup, equipment, isCustom, createdAt, updatedAt',
  workouts: 'id, startedAt, endedAt, status, updatedAt',
  bodyMetrics: 'id, date, updatedAt',
  settings: 'id',
  templates: 'id, name, createdAt, updatedAt',
  programs: 'id, name, status, createdAt, updatedAt',
  idAliases: 'id, updatedAt',
  dayOverrides: 'id, updatedAt',
};

const OLD_TIME = 1_000_000;
const ZONGYUAN_SLOTS = [
  { id: 's-pull', label: '拉 (Pull)', templateId: 't-pull' },
  { id: 's-push', label: '推 (Push)', templateId: 't-push' },
  { id: 's-legs', label: '腿 (Leg)', templateId: 't-legs' },
  { id: 's-arms', label: '手 (Arms)', templateId: 't-arms' },
];

function program(id: string, extra: Record<string, unknown>) {
  return {
    id,
    name: ZONGYUAN_PROGRAM_NAME,
    slots: ZONGYUAN_SLOTS,
    completedSlotIdsThisLap: [],
    cycleCount: 0,
    estimatedWeeks: { min: 8, max: 8 },
    status: 'active',
    startedAt: OLD_TIME,
    createdAt: OLD_TIME,
    updatedAt: OLD_TIME,
    ...extra,
  };
}

async function seedV12Database() {
  const legacy = new Dexie('GymTrackerDatabase');
  legacy.version(12).stores(V12_STORES);
  await legacy.open();
  await legacy.table('programs').bulkPut([
    // 目前計畫：這輪練過拉跟腿
    program('current', { completedSlotIdsThisLap: ['s-pull', 's-legs'], cycleCount: 3 }),
    // 這輪只剩腿沒練：腿改自行安排後，推拉手都練完了 → 直接進下一輪
    program('paused-almost-done', { status: 'paused', completedSlotIdsThisLap: ['s-pull', 's-push', 's-arms'], cycleCount: 1 }),
    // 封存的不動
    program('archived', { status: 'abandoned' }),
    // 別的計畫不動
    program('other', { name: '我的訓練計畫', status: 'completed' }),
  ]);
  legacy.close();
}

describe('Dexie version(13)：宗諺課表改成 推→拉→手 輪替、腿自行安排', () => {
  let db: typeof import('../schema').db;

  beforeAll(async () => {
    await seedV12Database();
    ({ db } = await import('../schema'));
    await db.open();
  });

  test('目前計畫：順序變成 推、拉、手、腿，腿標成自行安排，這輪已練的腿被拿掉', async () => {
    const p = (await db.programs.get('current'))!;
    expect(p.slots.map((s) => s.id)).toEqual(['s-push', 's-pull', 's-arms', 's-legs']);
    expect(p.slots.find((s) => s.id === 's-legs')?.selfScheduled).toBe(true);
    expect(p.slots.filter((s) => s.selfScheduled)).toHaveLength(1);
    expect(p.slots.find((s) => s.id === 's-push')?.templateId).toBe('t-push');
    expect(p.completedSlotIdsThisLap).toEqual(['s-pull']);
    expect(p.cycleCount).toBe(3);
    expect(p.updatedAt).toBeGreaterThan(OLD_TIME); // 雲端同步時以這份為準
  });

  test('推拉手這輪都練完了（只差腿）→ 直接進下一輪', async () => {
    const p = (await db.programs.get('paused-almost-done'))!;
    expect(p.completedSlotIdsThisLap).toEqual([]);
    expect(p.cycleCount).toBe(2);
  });

  test('封存的、別的計畫都不動', async () => {
    for (const id of ['archived', 'other']) {
      const p = (await db.programs.get(id))!;
      expect(p.slots.map((s) => s.id)).toEqual(ZONGYUAN_SLOTS.map((s) => s.id));
      expect(p.slots.some((s) => s.selfScheduled !== undefined)).toBe(false);
      expect(p.updatedAt).toBe(OLD_TIME);
    }
  });
});
