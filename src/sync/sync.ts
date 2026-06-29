import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import { db } from '../db/schema';

type SyncTable = 'exercises' | 'workouts' | 'templates' | 'bodyMetrics';

interface SyncRecord {
  id: string;
  updatedAt?: number;
  deletedAt?: number;
}

// ── 單筆推送到 Firestore ──────────────────────────────────────────
export async function pushDoc(uid: string, table: SyncTable, record: SyncRecord): Promise<void> {
  const fs = getFirebaseFirestore();
  const ref = doc(fs, 'users', uid, table, record.id);
  await setDoc(ref, { ...record, updatedAt: Date.now() }, { merge: true });
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
  | typeof db.bodyMetrics;

// ── LWW merge：較新的 updatedAt 勝出 ──────────────────────────────
async function mergeRecords(dexieTable: AnyDexieTable, cloudRecords: SyncRecord[]): Promise<void> {
  for (const cloud of cloudRecords) {
    if (cloud.deletedAt) {
      await (dexieTable as typeof db.exercises).delete(cloud.id);
      continue;
    }
    const local = await (dexieTable as typeof db.exercises).get(cloud.id) as SyncRecord | undefined;
    const localUpdatedAt = local?.updatedAt ?? 0;
    const cloudUpdatedAt = cloud.updatedAt ?? 0;
    if (cloudUpdatedAt > localUpdatedAt) {
      await (dexieTable as typeof db.exercises).put(cloud as Parameters<typeof db.exercises.put>[0]);
    }
  }
}

// ── 將本機全部資料推送到雲端 ─────────────────────────────────────
async function pushAllToCloud(uid: string): Promise<void> {
  const [exercises, workouts, templates, metrics] = await Promise.all([
    db.exercises.toArray(),
    db.workouts.where('status').equals('completed').toArray(),
    db.templates.toArray(),
    db.bodyMetrics.toArray(),
  ]);

  const pushBatch = async (table: SyncTable, records: SyncRecord[]) => {
    await Promise.all(records.map(r => pushDoc(uid, table, r)));
  };

  await Promise.all([
    pushBatch('exercises', exercises.filter(e => e.isCustom)),
    pushBatch('workouts', workouts),
    pushBatch('templates', templates),
    pushBatch('bodyMetrics', metrics),
  ]);
}

// ── Full sync（登入後執行）────────────────────────────────────────
export async function fullSync(uid: string): Promise<void> {
  const [cloudExercises, cloudWorkouts, cloudTemplates, cloudMetrics] = await Promise.all([
    pullAll(uid, 'exercises'),
    pullAll(uid, 'workouts'),
    pullAll(uid, 'templates'),
    pullAll(uid, 'bodyMetrics'),
  ]);

  await Promise.all([
    mergeRecords(db.exercises, cloudExercises),
    mergeRecords(db.workouts, cloudWorkouts),
    mergeRecords(db.templates, cloudTemplates),
    mergeRecords(db.bodyMetrics, cloudMetrics),
  ]);

  await pushAllToCloud(uid);
}

// ── Delta sync（前景化時執行）────────────────────────────────────
export async function deltaSync(uid: string, since: number): Promise<void> {
  const [cloudExercises, cloudWorkouts, cloudTemplates, cloudMetrics] = await Promise.all([
    pullSince(uid, 'exercises', since),
    pullSince(uid, 'workouts', since),
    pullSince(uid, 'templates', since),
    pullSince(uid, 'bodyMetrics', since),
  ]);

  await Promise.all([
    mergeRecords(db.exercises, cloudExercises),
    mergeRecords(db.workouts, cloudWorkouts),
    mergeRecords(db.templates, cloudTemplates),
    mergeRecords(db.bodyMetrics, cloudMetrics),
  ]);
}
