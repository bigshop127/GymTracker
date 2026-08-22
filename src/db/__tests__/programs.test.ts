import 'fake-indexeddb/auto';
import { describe, test, expect, beforeAll } from 'vitest';
import { db, type TrainingProgram } from '../schema';
import { saveProgram, getCurrentProgram, restartCurrentProgram } from '../programs';

function makeProgram(overrides: Partial<TrainingProgram>): TrainingProgram {
  const now = Date.now();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: '測試計畫',
    slots: [{ id: 's1', label: '拉' }, { id: 's2', label: '推' }],
    completedSlotIdsThisLap: [],
    cycleCount: 0,
    estimatedWeeks: { min: 4, max: 8 },
    status: 'active',
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeAll(async () => {
  await db.open();
});

describe('saveProgram：唯一性守衛涵蓋 paused', () => {
  test('存一份 paused 計畫時，另一份既有的 active 會被擠成 abandoned', async () => {
    const active = makeProgram({ id: 'p-active', status: 'active' });
    await saveProgram(active);

    const paused = makeProgram({ id: 'p-paused', status: 'paused', pausedAt: Date.now() });
    await saveProgram(paused);

    const reloadedActive = await db.programs.get('p-active');
    expect(reloadedActive?.status).toBe('abandoned');
    expect(reloadedActive?.completedAt).toBeDefined();

    const reloadedPaused = await db.programs.get('p-paused');
    expect(reloadedPaused?.status).toBe('paused');

    const current = await getCurrentProgram();
    expect(current?.id).toBe('p-paused');
  });
});

describe('restartCurrentProgram：同一個 transaction 內完成封存＋新建', () => {
  test('跑完後，programs 表恰好有一份目前計畫', async () => {
    const program = makeProgram({ id: 'p-restart', status: 'active', runNumber: 1 });
    await saveProgram(program);

    const { archived, fresh } = await restartCurrentProgram(Date.now());
    expect(archived.id).toBe('p-restart');
    expect(archived.status).toBe('abandoned');
    expect(fresh.status).toBe('active');
    expect(fresh.runNumber).toBe(2);

    const all = await db.programs.toArray();
    const currentOnes = all.filter((p) => !p.deletedAt && (p.status === 'active' || p.status === 'paused'));
    expect(currentOnes).toHaveLength(1);
    expect(currentOnes[0].id).toBe(fresh.id);
  });
});
