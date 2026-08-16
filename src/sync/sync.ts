import {
  collection,
  deleteField,
  doc,
  getDocs,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import { db } from '../db/schema';
import { repairExerciseIds } from '../db/repairExerciseIds';
import { stripUndefined } from '../lib/stripUndefined';

type SyncTable = 'exercises' | 'workouts' | 'templates' | 'bodyMetrics' | 'programs' | 'idAliases' | 'dayOverrides';

interface SyncRecord {
  id: string;
  updatedAt?: number;
  deletedAt?: number;
}

// ── 單筆推送到 Firestore ──────────────────────────────────────────
export async function pushDoc(uid: string, table: SyncTable, record: SyncRecord): Promise<void> {
  const fs = getFirebaseFirestore();
  const ref = doc(fs, 'users', uid, table, record.id);
  const source: Record<string, unknown> = { ...record, updatedAt: record.updatedAt ?? Date.now() };

  // Firestore 收不了 undefined。巢狀的直接把鍵拿掉；頂層的改送 deleteField()，
  // 因為這裡是 merge 寫入，只是省略鍵的話雲端會留著舊值 —— 清空欄位會失效。
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    payload[key] = value === undefined ? deleteField() : stripUndefined(value);
  }

  await setDoc(ref, payload, { merge: true });
}

// ── 從 Firestore 拉取某個 table 的全部資料 ─────────────────────────
async function pullAll(uid: string, table: SyncTable): Promise<SyncRecord[]> {
  const fs = getFirebaseFirestore();
  const col = collection(fs, 'users', uid, table);
  const snap = await getDocs(col);
  return snap.docs.map(d => d.data() as SyncRecord);
}

// ── 從 Firestore 拉取自上次同步後更新的資料 ───────────────────────
async function pullSince(uid: string, table: SyncTable, since: number): Promise<SyncRecord[]> {
  const fs = getFirebaseFirestore();
  const col = collection(fs, 'users', uid, table);
  const q = query(col, where('updatedAt', '>', since));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as SyncRecord);
}

// ── Dexie table ユニオン型 ────────────────────────────────────────
type AnyDexieTable =
  | typeof db.exercises
  | typeof db.workouts
  | typeof db.templates
  | typeof db.bodyMetrics
  | typeof db.programs
  | typeof db.idAliases
  | typeof db.dayOverrides;

// ── LWW merge：較新的 updatedAt 勝出 ──────────────────────────────
async function mergeRecords(dexieTable: AnyDexieTable, cloudRecords: SyncRecord[]): Promise<void> {
  for (const cloud of cloudRecords) {
    const local = await (dexieTable as typeof db.exercises).get(cloud.id) as SyncRecord | undefined;
    const localUpdatedAt = local?.updatedAt ?? 0;
    const cloudUpdatedAt = cloud.updatedAt ?? 0;
    if (cloudUpdatedAt > localUpdatedAt) {
      await (dexieTable as typeof db.exercises).put(cloud as Parameters<typeof db.exercises.put>[0]);
    }
  }
}

// ── 推送一批資料；單筆失敗不中斷其餘（失敗訊息收集起來最後回報）─────
async function pushBatch(
  uid: string,
  table: SyncTable,
  records: SyncRecord[],
  failures: string[],
): Promise<void> {
  const results = await Promise.allSettled(records.map(r => pushDoc(uid, table, r)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`Push failed: ${table}/${records[i].id}`, result.reason);
      failures.push(`${table}/${records[i].id}: ${reason}`);
    }
  });
}

async function pushBatches(uid: string, batches: [SyncTable, SyncRecord[]][]): Promise<void> {
  const failures: string[] = [];
  await Promise.all(batches.map(([table, records]) => pushBatch(uid, table, records, failures)));
  if (failures.length > 0) {
    throw new Error(`${failures.length} 筆資料上傳失敗（其餘已同步）：${failures[0]}`);
  }
}

// ── 將本機更新的增量推送到雲端 ─────────────────────────────────────
async function pushChangedSince(uid: string, since: number): Promise<void> {
  const [exercises, workouts, templates, metrics, programs, aliases, overrides] = await Promise.all([
    db.exercises.where('updatedAt').above(since).toArray(),
    db.workouts.where('updatedAt').above(since).toArray(),
    db.templates.where('updatedAt').above(since).toArray(),
    db.bodyMetrics.where('updatedAt').above(since).toArray(),
    db.programs.where('updatedAt').above(since).toArray(),
    db.idAliases.where('updatedAt').above(since).toArray(),
    db.dayOverrides.where('updatedAt').above(since).toArray(),
  ]);

  await pushBatches(uid, [
    ['exercises', exercises.filter(e => e.isCustom)],
    ['workouts', workouts.filter(w => w.status === 'completed' || w.deletedAt !== undefined)],
    ['templates', templates],
    ['bodyMetrics', metrics],
    ['programs', programs],
    ['idAliases', aliases],
    ['dayOverrides', overrides],
  ]);
}

// ── 將本機全部資料推送到雲端 ─────────────────────────────────────
async function pushAllToCloud(uid: string): Promise<void> {
  const [exercises, workouts, templates, metrics, programs, aliases, overrides] = await Promise.all([
    db.exercises.toArray(),
    db.workouts.toArray(),
    db.templates.toArray(),
    db.bodyMetrics.toArray(),
    db.programs.toArray(),
    db.idAliases.toArray(),
    db.dayOverrides.toArray(),
  ]);

  await pushBatches(uid, [
    ['exercises', exercises.filter(e => e.isCustom)],
    ['workouts', workouts.filter(w => w.status === 'completed' || w.deletedAt !== undefined)],
    ['templates', templates],
    ['bodyMetrics', metrics],
    ['programs', programs],
    ['idAliases', aliases],
    ['dayOverrides', overrides],
  ]);
}

// ── Full sync（登入後執行）────────────────────────────────────────
// 回傳被修好的舊動作 id 筆數，讓呼叫端決定要不要重新載入畫面上的訓練
export async function fullSync(uid: string): Promise<number> {
  const [cloudExercises, cloudWorkouts, cloudTemplates, cloudMetrics, cloudPrograms, cloudAliases, cloudOverrides] = await Promise.all([
    pullAll(uid, 'exercises'),
    pullAll(uid, 'workouts'),
    pullAll(uid, 'templates'),
    pullAll(uid, 'bodyMetrics'),
    pullAll(uid, 'programs'),
    pullAll(uid, 'idAliases'),
    pullAll(uid, 'dayOverrides'),
  ]);

  await Promise.all([
    mergeRecords(db.exercises, cloudExercises),
    mergeRecords(db.workouts, cloudWorkouts),
    mergeRecords(db.templates, cloudTemplates),
    mergeRecords(db.bodyMetrics, cloudMetrics),
    mergeRecords(db.programs, cloudPrograms),
    mergeRecords(db.idAliases, cloudAliases),
    mergeRecords(db.dayOverrides, cloudOverrides),
  ]);

  // 先用（含對方裝置的）對照表修好舊動作 id，修好的版本才能在這一輪就推上去
  const repaired = await repairExerciseIds();

  await pushAllToCloud(uid);
  return repaired;
}

// ── Delta sync（前景化時執行）────────────────────────────────────
export async function deltaSync(uid: string, since: number): Promise<number> {
  const [cloudExercises, cloudWorkouts, cloudTemplates, cloudMetrics, cloudPrograms, cloudAliases, cloudOverrides] = await Promise.all([
    pullSince(uid, 'exercises', since),
    pullSince(uid, 'workouts', since),
    pullSince(uid, 'templates', since),
    pullSince(uid, 'bodyMetrics', since),
    pullSince(uid, 'programs', since),
    pullSince(uid, 'idAliases', since),
    pullSince(uid, 'dayOverrides', since),
  ]);

  await Promise.all([
    mergeRecords(db.exercises, cloudExercises),
    mergeRecords(db.workouts, cloudWorkouts),
    mergeRecords(db.templates, cloudTemplates),
    mergeRecords(db.bodyMetrics, cloudMetrics),
    mergeRecords(db.programs, cloudPrograms),
    mergeRecords(db.idAliases, cloudAliases),
    mergeRecords(db.dayOverrides, cloudOverrides),
  ]);

  const repaired = await repairExerciseIds();

  await pushChangedSince(uid, since);
  return repaired;
}
