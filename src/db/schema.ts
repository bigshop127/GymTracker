import Dexie, { type Table } from 'dexie';

// ---- 型別與介面定義 (依據 docs/ROADMAP.md §2) ----

export type Unit = 'kg' | 'lb';
export type MuscleGroup = '胸' | '背' | '腿' | '肩' | '二頭' | '三頭' | '核心' | '臀' | '全身' | '有氧';
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
}

// ---- 一組 (SetLog) ----
export interface SetLog {
  id: string;
  weight: number;         // 一律存 kg
  reps: number;
  rpe?: number;           // 主觀強度 6-10，選填
  isWarmup: boolean;
  completed: boolean;
  createdAt: number;
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
}

// ---- 體重 / 體組成 (BodyMetric) ----
export interface BodyMetric {
  id: string;
  date: number;           // 時間戳 (通常是一天的開始或紀錄時間)
  bodyWeight?: number;    // kg
  bodyFatPct?: number;
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
  }
}

export const db = new GymTrackerDatabase();
export default db;
