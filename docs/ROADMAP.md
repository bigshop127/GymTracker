# 健身動作紀錄器（Gymie-style）開發藍圖 ROADMAP

> 本檔是整個專案的 **SSOT（單一事實來源）**。所有階段提示詞都以此為準，資料模型有任何變更，先改這裡。

---

## 0. 專案定位

| 項目 | 內容 |
|---|---|
| 目標 | 自製一個類 [Gymie](https://apps.apple.com/us/app/gymie-fitness-tracker/id6758956867) 的健身訓練紀錄器 |
| 平台 | **Web PWA**（手機優先、可安裝、離線可用） |
| 首版範圍 | **精簡 MVP**：動作庫 + 訓練紀錄 + 組間休息計時 + 訓練歷史 + 基本進度圖 |
| 互動模式 | 規格（Claude 擬）→ 自己寫 code → Claude review |
| 儲存策略 | **本機離線優先（IndexedDB）+ 每筆即時自動寫入**；資料層設計成日後可加雲端同步而不需重寫 |

### 核心設計原則（每個階段都要守）
1. **手機單手操作**：大按鈕、加減步進器、底部導覽。
2. **紀錄一組 3 秒內完成**：輸入路徑越短越好。
3. **全部即時自動存**：沒有「儲存」按鈕，任何變更立即寫回 IndexedDB。
4. **資料層隔離**：只有 `src/db/` 能碰 Dexie/IndexedDB，UI 與元件一律走 repository。
5. **運算單一來源**：E1RM、容量、單位換算各只有一份實作（放 `src/lib/`）。

---

## 1. 技術棧

| 範疇 | 選擇 | 備註 |
|---|---|---|
| 建構 | Vite + React + TypeScript（strict） | |
| 樣式 | Tailwind CSS | 手機優先 RWD |
| 路由 | React Router | |
| 狀態 | Zustand | 進行中訓練、設定 |
| 本機資料庫 | **Dexie.js**（IndexedDB 封裝） | 別用 localStorage（容量/結構不夠） |
| 圖表 | Recharts | |
| PWA | vite-plugin-pwa | ⚠️ 見 §6 踩雷預告 |
| uuid | `crypto.randomUUID()` | 瀏覽器原生，免裝套件 |

---

## 2. 資料模型（SSOT）

```typescript
// ---- 列舉 ----
type Unit = 'kg' | 'lb';
type MuscleGroup = '胸' | '背' | '腿' | '肩' | '二頭' | '三頭' | '核心' | '臀' | '全身' | '有氧';
type Equipment = '槓鈴' | '啞鈴' | '機械' | '纜繩' | '徒手' | '壺鈴' | '其他';

// ---- 動作（動作庫的一筆）----
interface Exercise {
  id: string;             // crypto.randomUUID()
  name: string;           // 例：槓鈴臥推
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  isCustom: boolean;      // 內建 false / 使用者自訂 true
  notes?: string;
  createdAt: number;      // Date.now()
}

// ---- 一組（最小紀錄單位）----
interface SetLog {
  id: string;
  weight: number;         // 一律存 kg（顯示時才換算成使用者 unit）
  reps: number;
  rpe?: number;           // 主觀強度 6–10，選填
  isWarmup: boolean;      // 暖身組不計入 PR / 容量統計
  completed: boolean;     // 是否已打勾完成
  createdAt: number;
}

// ---- 一次訓練中的某個動作（含多組）----
interface WorkoutEntry {
  id: string;
  exerciseId: string;     // 對應 Exercise.id
  order: number;          // 在這次訓練中的排序
  sets: SetLog[];
  defaultRestSeconds?: number;
}

// ---- 一次訓練（一個 session）----
interface Workout {
  id: string;
  title?: string;         // 例：推日 / Push Day
  startedAt: number;
  endedAt?: number;       // 未結束 = 進行中
  entries: WorkoutEntry[];
  notes?: string;
  status: 'active' | 'completed';   // active = 進行中草稿，可恢復
}

// ---- 體重 / 體組成（MVP 可選做，標準版必做）----
interface BodyMetric {
  id: string;
  date: number;
  bodyWeight?: number;    // kg
  bodyFatPct?: number;
}

// ---- 全域設定 ----
interface Settings {
  unit: Unit;
  defaultRestSeconds: number;          // 例：90
  e1rmFormula: 'epley' | 'brzycki';
  theme: 'light' | 'dark' | 'system';
  soundOnRestEnd: boolean;
  vibrateOnRestEnd: boolean;
}
```

### 衍生運算定義（放 `src/lib/`，全 app 共用）
- **E1RM（預估一次最大重量）**
  - Epley：`1RM = w × (1 + reps/30)`
  - Brzycki：`1RM = w × 36 / (37 − reps)`（reps < 37）
  - `reps === 1` 時直接回傳 `weight`
- **單組容量**：`weight × reps`（**僅計** `isWarmup === false && completed === true` 的組）
- **單次訓練總容量**：該次所有有效組的容量加總
- **單位換算**：`1 kg = 2.2046226 lb`，集中放 `src/lib/units.ts`

---

## 3. 建議資料夾結構

```
GymTracker/
├─ src/
│  ├─ db/              # 唯一碰 Dexie/IndexedDB 的地方
│  │   ├─ schema.ts    # Dexie 實例 + table 宣告 + migration
│  │   ├─ exercises.ts # CRUD + seed
│  │   ├─ workouts.ts  # CRUD + 進行中草稿
│  │   ├─ bodyMetrics.ts
│  │   └─ settings.ts
│  ├─ lib/             # 純函式：e1rm.ts, volume.ts, units.ts, format.ts
│  ├─ store/           # Zustand：activeWorkout.ts, settings.ts
│  ├─ components/      # SetRow, RestTimer, NumberStepper, BottomNav…
│  ├─ pages/           # WorkoutLogger, History, ExerciseLibrary, Progress, SettingsPage
│  ├─ data/            # seed-exercises.ts（內建動作清單）
│  ├─ App.tsx
│  └─ main.tsx
└─ docs/
   ├─ ROADMAP.md       # 本檔（SSOT）
   └─ prompts/         # phase0.md ~ phase6.md
```

---

## 4. 階段索引

| 階段 | 主題 | 產出 |
|---|---|---|
| Phase 0 | 專案骨架 | Vite/React/TS/Tailwind/PWA + 5 頁導覽空殼 |
| Phase 1 | 資料層 + 自動儲存 | Dexie schema + repositories + seed + 草稿恢復 |
| Phase 2 | 動作庫頁 | 內建動作 + 篩選/搜尋 + 自訂 CRUD |
| Phase 3 | 訓練紀錄核心 | 開始訓練 + 逐組輸入 + 休息計時 + 即時存 |
| Phase 4 | 歷史頁 | 列表 + 明細 + 以此為範本再做一次 |
| Phase 5 | 進度圖表 | 每動作 E1RM/最大重量/容量趨勢 + PR |
| Phase 6 | 設定 + PWA 收尾 | 設定頁 + 可安裝 + 離線 |

> 一次做一個階段，做完讓 Claude review，過了再進下一階段。

---

## 5. Review 檢查清單（每階段完成時對照）

- **資料層隔離**：UI/元件有沒有直接呼叫 Dexie？（只能透過 `src/db/`）
- **自動儲存可恢復**：進行中訓練關 App 能否接續？有無「未存即遺失」破口？
- **計時器正確性**：休息倒數是否用「目標時間戳」算？背景/鎖屏回來會不會跳秒或停掉？
- **單位一致**：weight 一律存 kg？換算是否只放 `lib/units.ts` 一處？
- **E1RM 單一來源**：公式是否散落多份？暖身組有無被誤算進 PR/容量？
- **TS strict**：零 `any`、nullable（`endedAt?`、`rpe?`）有無守好？
- **效能**：歷史/圖表頁大量資料時，是否在 render 內重複統計（該 memo/預聚合）？
- **PWA**：SW 是否正確 emit 與註冊（見 §6）。

---

## 6. 踩雷預告（先避開）

1. **vite-plugin-pwa × Vite/Rolldown 兩坑**：
   - 手動維護的 `public/manifest.webmanifest` 會蓋掉 VitePWA 產的 → 二選一，別並存。
   - `registerSW.js` 有時不會被 emit → 設 `injectRegister: false`，在 `main.tsx` 手動 `navigator.serviceWorker.register(...)`。
2. **休息計時器別用 `setInterval` 累加秒數**：手機鎖屏/切背景時 timer 會被節流，回來秒數全錯。存「結束目標時間戳」，每次 render 用 `target − Date.now()` 算剩餘。
3. **weight 一律存 kg**，顯示層才換算 → 避免改單位時舊資料數值意義改變。
4. **uuid** 用 `crypto.randomUUID()`。

---

## 7. 未來雲端同步路徑（先不做，預留形狀）

- 每筆資料已帶 `id`（uuid）與 `createdAt`，未來加 `updatedAt` 與 `deletedAt`（軟刪除）即可做最後寫入勝出（LWW）同步。
- repository 介面（`src/db/`）就是未來抽換成「本機 + 遠端」的接縫；UI 不需改。
- 雲端後端可選 Supabase / Firebase（自帶 auth + 即時 DB），屆時再開一個 Phase。
