import Dexie, { type Table } from 'dexie';

// ---- 型別與介面定義 (依據 docs/ROADMAP.md §2) ----

export type Unit = 'kg' | 'lb';
export type MuscleGroup = '胸' | '背' | '腿' | '肩' | '手臂' | '核心' | '臀' | '全身' | '有氧';
export type Equipment = '槓鈴' | '啞鈴' | '機械' | '纜繩' | '徒手' | '壺鈴' | '其他';

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
}

// ---- 一次訓練中的某個動作 (WorkoutEntry) ----
export interface WorkoutEntry {
  id: string;
  exerciseId: string;
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
export interface Settings {
  id: 'global';           // 固定為 'global' 單一紀錄
  unit: Unit;
  defaultRestSeconds: number;
  e1rmFormula: 'epley' | 'brzycki';
  theme: 'light' | 'dark' | 'system';
  soundOnRestEnd: boolean;
  vibrateOnRestEnd: boolean;
  locations?: string[];     // 可選地點清單，例如 ['中壢建工', '楊梅WG']
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

// ---- Dexie 資料庫定義 ----

class GymTrackerDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  workouts!: Table<Workout, string>;
  bodyMetrics!: Table<BodyMetric, string>;
  settings!: Table<Settings, string>;
  templates!: Table<WorkoutTemplate, string>;

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
  }
}

export const db = new GymTrackerDatabase();
export default db;
