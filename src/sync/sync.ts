import {
  collection,
  deleteField,
  doc,
  getDocs,
  setDoc,
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

export interface UploadResult {
  pushed: number;
  skipped: number;
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

function localTables(): [SyncTable, () => Promise<SyncRecord[]>][] {
  return [
    ['exercises', async () => (await db.exercises.toArray()).filter(e => e.isCustom)],
    ['workouts', async () => (await db.workouts.toArray()).filter(w => w.status === 'completed' || w.deletedAt !== undefined)],
    ['templates', () => db.templates.toArray()],
    ['bodyMetrics', () => db.bodyMetrics.toArray()],
    ['programs', () => db.programs.toArray()],
    ['idAliases', () => db.idAliases.toArray()],
    ['dayOverrides', () => db.dayOverrides.toArray()],
  ];
}

// ── 下載：把雲端七張表全部拉回本機、用 LWW merge（雲端較新才覆蓋本機）──
// 回傳被修好的舊動作 id 筆數，讓呼叫端決定要不要重新載入畫面上的訓練
export async function downloadAll(uid: string): Promise<number> {
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

  return repairExerciseIds();
}

// ── 上傳：把本機七張表全部推上雲端，推送前逐筆比對雲端現有的 updatedAt ──
// 雲端比較新的那筆跳過、不覆蓋，避免用本機舊資料蓋掉別台裝置剛推上去的更新
export async function uploadAll(uid: string): Promise<UploadResult> {
  const tables = localTables();
  const [localRecords, cloudRecords] = await Promise.all([
    Promise.all(tables.map(([, load]) => load())),
    Promise.all(tables.map(([table]) => pullAll(uid, table))),
  ]);

  let pushed = 0;
  let skipped = 0;
  const batches: [SyncTable, SyncRecord[]][] = tables.map(([table], i) => {
    const cloudUpdatedAtById = new Map(cloudRecords[i].map(r => [r.id, r.updatedAt ?? 0]));
    const toPush = localRecords[i].filter(r => {
      const cloudUpdatedAt = cloudUpdatedAtById.get(r.id);
      return cloudUpdatedAt === undefined || (r.updatedAt ?? 0) > cloudUpdatedAt;
    });
    pushed += toPush.length;
    skipped += localRecords[i].length - toPush.length;
    return [table, toPush];
  });

  await pushBatches(uid, batches);
  return { pushed, skipped };
}
