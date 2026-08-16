import Dexie, { type Table } from 'dexie';
import { seedExerciseId, SEED_EXERCISES, SEED_RENAMES } from '../data/seed-exercises';
import { remapEntryExerciseIds } from '../lib/exerciseIdMap';

// ---- 型別與介面定義 (依據 docs/ROADMAP.md §2) ----

export type Unit = 'kg' | 'lb';
export type MuscleGroup = '胸' | '背' | '腿臀' | '肩' | '手臂' | '核心' | '有氧';
export type Equipment = '槓鈴' | '啞鈴' | '機械' | '纜繩' | '徒手' | '壺鈴' | '其他';

export type ArmSubGroup = '二頭' | '三頭';

// ---- 動作 (Exercise) ----
export interface Exercise {
  id: string;             // crypto.randomUUID()
  name: string;           // 例：槓鈴臥推
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  isCustom: boolean;      // 內建 false / 使用者自訂 true
  notes?: string;
  createdAt: number;      // Date.now()
  updatedAt?: number;     // 雲端同步用：最後修改時間
  deletedAt?: number;     // 雲端同步用：軟刪除時間
  subGroup?: ArmSubGroup;
}

// ---- 一組 (SetLog) ----
export interface SetLog {
  id: string;
  weight: number;         // 一律存 kg（有氧組固定 0）
  reps: number;           // 一律存次數（有氧組固定 0）
  rpe?: number;           // 主觀強度 6-10，選填
  isWarmup: boolean;
  completed: boolean;
  createdAt: number;
  // ---- 有氧專用欄位（選填；力量組忽略）----
  durationSeconds?: number;  // 持續時長（秒）
  distanceKm?: number;       // 距離（公里）
  calories?: number;         // 消耗卡路里
  assistWeight?: number;     // 輔助重量（kg，正數＝被機器/彈力帶抵銷掉的重量）
}

// ---- 一次訓練中的某個動作 (WorkoutEntry) ----
export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  candidateExerciseIds?: string[]; // 替代動作候選清單（含當前選定）；缺省＝單一動作（向後相容）
  order: number;
  sets: SetLog[];
  defaultRestSeconds?: number;
}

// ---- 一次訓練 (Workout) ----
export interface Workout {
  id: string;
  title?: string;
  startedAt: number;
  endedAt?: number;
  entries: WorkoutEntry[];
  notes?: string;
  status: 'active' | 'completed';
  location?: string;        // 訓練地點，例如 '中壢建工'
  updatedAt?: number;
  deletedAt?: number;
  programId?: string;
  programSlotId?: string;
  programCycleNumber?: number;   // 這筆訓練發生在計畫的第幾輪（1-indexed，方便顯示「第3輪‧背日」）
}


// ---- 體重 / 體組成 (BodyMetric) ----
export interface BodyMetric {
  id: string;
  date: number;           // 時間戳 (通常是一天的開始或紀錄時間)
  bodyWeight?: number;    // kg
  bodyFatPct?: number;
  updatedAt?: number;
  deletedAt?: number;
}

// ---- 全域設定 (Settings) ----
export type ShiftLetter = 'A' | 'B' | 'C';

export interface DayOverride {
  id: string;                     // 'YYYY-MM-DD'（本地時區日期字串，直接當主鍵，比照 History.tsx 既有的 dateStr 慣例）
  shiftLetters?: ShiftLetter[];   // 當天有上的班，例如 ['A','B']；沒填/空陣列＝沒登記
  isDayOff?: boolean;             // 明確標記「休假」（截圖那個图示），與 shiftLetters 二選一，UI 互斥
  rawLabel?: string;              // 選填，原始顯示文字例如 'AC早'——只用來顯示，不參與判斷邏輯
  paused?: boolean;               // 手動暫停訓練建議（急事/下雨），跟班別無關，任何一天都能單獨勾
  updatedAt: number;
  deletedAt?: number;             // 沿用既有軟刪除慣例
}

export type ShiftPolicy = 'train' | 'restOrCardio';

export interface Settings {
  id: 'global';           // 固定為 'global' 單一紀錄
  unit: Unit;
  defaultRestSeconds: number;
  e1rmFormula: 'epley' | 'brzycki';
  theme: 'light' | 'dark' | 'system';
  soundOnRestEnd: boolean;
  vibrateOnRestEnd: boolean;
  locations?: string[];     // 可選地點清單，例如 ['中壢建工', '楊梅WG']
  shiftPolicyOverrides?: Record<string, ShiftPolicy>;  // key 是正規化後的班別代碼，例如 'AB'、'ABC'、'DAYOFF'
  restOverrideDays?: number;    // 「太久沒重量訓練」的門檻天數，預設 7
}

// ---- 訓練範本 (WorkoutTemplate) ----
export interface WorkoutTemplate {
  id: string;
  name: string;             // 範本名稱，例如 '胸 + 三頭'
  location?: string;
  entries: WorkoutEntry[];  // 保留 weight/reps/isWarmup；completed 一律 false
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// ---- 計畫裡的一個循環節點 (ProgramSlot) ----
export interface ProgramSlot {
  id: string;
  label: string;           // 例：'胸日'、'背日'、'腿臀日'、'肩日'、'手臂日'（自由文字，不綁 MuscleGroup）
  templateId?: string;     // 對應 WorkoutTemplate.id；還沒補內容時是 undefined
}

// ---- 訓練計畫 (TrainingProgram) ----
export interface TrainingProgram {
  id: string;
  name: string;                      // 例：'五分化 8-12週'
  slots: ProgramSlot[];               // 有序循環清單，長度任意
  cursor: number;                     // 下一個要練的 slot index（0-based）
  cycleCount: number;                 // 已完整跑完幾輪，從 0 起算
  estimatedWeeks: { min: number; max: number };  // 參考值，例：{min:8, max:12}，可隨時編輯
  status: 'active' | 'completed';     // 同時只能有一個 'active'
  startedAt: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;                 // 雲端同步用：軟刪除
}

// ---- 動作 id 對照 (IdAlias) ----
// 記錄「舊的隨機內建動作 id → 新的確定性 id」。
// 這張表會參與雲端同步：各裝置把自己的舊 id 對照表推上去，
// 於是任何一台都能修好其他裝置留下來的舊 id 參照。
export interface IdAlias {
  id: string;             // 舊 id
  newId: string;          // 新 id（seedExerciseId(name)）
  updatedAt: number;
}

// ---- Dexie 資料庫定義 ----

class GymTrackerDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  workouts!: Table<Workout, string>;
  bodyMetrics!: Table<BodyMetric, string>;
  settings!: Table<Settings, string>;
  templates!: Table<WorkoutTemplate, string>;
  programs!: Table<TrainingProgram, string>;
  idAliases!: Table<IdAlias, string>;
  dayOverrides!: Table<DayOverride, string>;


  constructor() {
    super('GymTrackerDatabase');
    
    // 定義 tables 與索引 (依據 docs/prompts/phase1.md)
    this.version(1).stores({
      exercises: 'id, name, muscleGroup, equipment, isCustom, createdAt',
      workouts: 'id, startedAt, endedAt, status',
      bodyMetrics: 'id, date',
      settings: 'id'
    });

    this.version(2).stores({
      templates: 'id, name, createdAt',
    });

    // version(3): 加入 updatedAt 索引以供雲端同步使用，並回填舊紀錄
    this.version(3).stores({
      exercises: 'id, name, muscleGroup, equipment, isCustom, createdAt, updatedAt',
      workouts: 'id, startedAt, endedAt, status, updatedAt',
      bodyMetrics: 'id, date, updatedAt',
      templates: 'id, name, createdAt, updatedAt',
    }).upgrade(async (tx) => {
      const now = Date.now();
      await tx.table('exercises').toCollection().modify((item) => {
        if (!item.updatedAt) item.updatedAt = item.createdAt ?? now;
      });
      await tx.table('workouts').toCollection().modify((item) => {
        if (!item.updatedAt) item.updatedAt = item.startedAt ?? now;
      });
      await tx.table('bodyMetrics').toCollection().modify((item) => {
        if (!item.updatedAt) item.updatedAt = item.date ?? now;
      });
      await tx.table('templates').toCollection().modify((item) => {
        if (!item.updatedAt) item.updatedAt = item.createdAt ?? now;
      });
    });

    // version(4): 合併 '二頭' / '三頭' → '手臂'
    this.version(4).stores({}).upgrade(async (tx) => {
      await tx.table('exercises').toCollection().modify((item) => {
        if (item.muscleGroup === '二頭' || item.muscleGroup === '三頭') {
          item.muscleGroup = '手臂';
        }
      });
    });

    // version(5): 合併 '腿' / '臀' → '腿臀'
    this.version(5).stores({}).upgrade(async (tx) => {
      await tx.table('exercises').toCollection().modify((item) => {
        if (item.muscleGroup === '腿' || item.muscleGroup === '臀') {
          item.muscleGroup = '腿臀';
        }
      });
    });

    // version(6): 移除 '全身' 類別；有氧只保留跑步機與登階機
    this.version(6).stores({}).upgrade(async (tx) => {
      const toDelete = await tx.table('exercises').filter((item) =>
        item.muscleGroup === '全身' ||
        ['飛輪', '划船機', '橢圓機', '爬梯機', '跳繩'].includes(item.name)
      ).primaryKeys();
      await tx.table('exercises').bulkDelete(toDelete);
    });

    // version(7): 新增訓練計畫表 (programs)
    this.version(7).stores({
      programs: 'id, name, status, createdAt, updatedAt',
    });

    // version(8): 軟刪除支援 (exercises, workouts, templates, bodyMetrics, programs)
    this.version(8).stores({});

    // version(9): 內建動作改用確定性 id（seed:動作名稱），跨裝置一致。
    // 舊的隨機 id 寫進 idAliases，並就地修好 workouts / templates 裡的參照。
    this.version(9).stores({
      idAliases: 'id, updatedAt',
    }).upgrade(async (tx) => {
      const now = Date.now();
      const exercises: Exercise[] = await tx.table('exercises').toArray();

      const idMap = new Map<string, string>();
      const canonical = new Map<string, Exercise>();
      for (const ex of exercises) {
        if (ex.isCustom) continue;              // 自訂動作本來就會同步，id 不動
        const newId = seedExerciseId(ex.name);
        if (newId === ex.id) continue;          // 已經是新格式
        idMap.set(ex.id, newId);
        // 同名多筆（理論上不會發生）只留一筆，避免撞主鍵
        if (!canonical.has(newId)) {
          canonical.set(newId, { ...ex, id: newId, updatedAt: ex.updatedAt ?? now });
        }
      }
      if (idMap.size === 0) return;

      await tx.table('exercises').bulkDelete([...idMap.keys()]);
      await tx.table('exercises').bulkPut([...canonical.values()]);
      await tx.table('idAliases').bulkPut(
        [...idMap].map(([oldId, newId]) => ({ id: oldId, newId, updatedAt: now })),
      );

      // 改寫參照；有動到的才 bump updatedAt，讓修好的版本推得上雲端
      await tx.table('workouts').toCollection().modify((w: Workout) => {
        if (remapEntryExerciseIds(w.entries, idMap)) w.updatedAt = now;
      });
      await tx.table('templates').toCollection().modify((t: WorkoutTemplate) => {
        if (remapEntryExerciseIds(t.entries, idMap)) t.updatedAt = now;
      });
    });

    // version(10): 內建動作拆分/改名/重分類；移除宗諺課表的「斜板推」
    this.version(10).stores({}).upgrade(async (tx) => {
      const now = Date.now();

      // ── (1) 內建動作改名 → 換 id，沿用 idAliases ──
      // 名單見 SEED_RENAMES（同一份也給 repairExerciseIds 當內建對照用）
      const idMap = new Map<string, string>();
      for (const [oldName, newName] of SEED_RENAMES) {
        const oldId = seedExerciseId(oldName);
        const row: Exercise | undefined = await tx.table('exercises').get(oldId);
        if (!row) continue;                       // 新裝置沒有舊資料，正常
        const newId = seedExerciseId(newName);
        await tx.table('exercises').delete(oldId);
        await tx.table('exercises').put({ ...row, id: newId, name: newName, updatedAt: now });
        idMap.set(oldId, newId);
      }
      if (idMap.size > 0) {
        await tx.table('idAliases').bulkPut(
          [...idMap].map(([id, newId]) => ({ id, newId, updatedAt: now })),
        );
        await tx.table('workouts').toCollection().modify((w: Workout) => {
          if (remapEntryExerciseIds(w.entries, idMap)) w.updatedAt = now;
        });
        await tx.table('templates').toCollection().modify((t: WorkoutTemplate) => {
          if (remapEntryExerciseIds(t.entries, idMap)) t.updatedAt = now;
        });
      }

      // ── (2) 啞鈴飛鳥 胸 → 肩（id 不變，不需要 alias）──
      // ── (3) 回填手臂動作的 subGroup（依 SEED_EXERCISES 對照）──
      for (const seed of SEED_EXERCISES) {
        const id = seedExerciseId(seed.name);
        const row: Exercise | undefined = await tx.table('exercises').get(id);
        if (row) {
          let changed = false;
          if (row.muscleGroup !== seed.muscleGroup) {
            row.muscleGroup = seed.muscleGroup;
            changed = true;
          }
          if (row.subGroup !== seed.subGroup) {
            row.subGroup = seed.subGroup;
            changed = true;
          }
          if (changed) {
            row.updatedAt = now;
            await tx.table('exercises').put(row);
          }
        }
      }

      // ── (4) 移除「斜板推」──
      // 兩台裝置各匯入過一次宗諺課表時，會有兩筆 uuid 不同的自訂「斜板推」被同步在一起，
      // 所以要收全部而不是 first()。
      const xieBanTuiRows: Exercise[] = await tx.table('exercises')
        .filter((e: Exercise) => e.name === '斜板推' && e.isCustom)
        .toArray();

      if (xieBanTuiRows.length > 0) {
        const removedIds = new Set(xieBanTuiRows.map((row) => row.id));

        // 已經有墓碑的不重蓋，免得白白 bump updatedAt 再推一次雲端
        const toBury = xieBanTuiRows.filter((row) => row.deletedAt === undefined);
        if (toBury.length > 0) {
          await tx.table('exercises').bulkPut(
            toBury.map((row) => ({ ...row, deletedAt: now, updatedAt: now })),
          );
        }

        // 移除參照；候選清單（替代動作）也要清，否則切換時會出現查不到的動作
        const stripEntries = (holder: { entries?: WorkoutEntry[] }): boolean => {
          if (!holder.entries) return false;
          const nextEntries = holder.entries.filter((entry) => !removedIds.has(entry.exerciseId));
          let changed = nextEntries.length < holder.entries.length;
          for (const entry of nextEntries) {
            const candidates = entry.candidateExerciseIds;
            if (!candidates) continue;
            const nextCandidates = candidates.filter((id) => !removedIds.has(id));
            if (nextCandidates.length !== candidates.length) {
              entry.candidateExerciseIds = nextCandidates;
              changed = true;
            }
          }
          if (!changed) return false;
          nextEntries.forEach((entry, i) => { entry.order = i; });
          holder.entries = nextEntries;
          return true;
        };

        await tx.table('templates').toCollection().modify((t: WorkoutTemplate) => {
          if (stripEntries(t)) t.updatedAt = now;
        });

        // 已完成的訓練是使用者真的做過的紀錄，一律不動
        await tx.table('workouts')
          .filter((w: Workout) => w.status === 'active')
          .modify((w: Workout) => {
            if (stripEntries(w)) w.updatedAt = now;
          });
      }
    });

    // version(11): 班表感知的月訓練計畫自動生成
    this.version(11).stores({
      dayOverrides: 'id, updatedAt',
    });
  }
}

export const db = new GymTrackerDatabase();
export default db;
