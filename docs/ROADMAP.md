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
type MuscleGroup = '胸' | '背' | '腿臀' | '肩' | '手臂' | '核心' | '有氧';
type Equipment = '槓鈴' | '啞鈴' | '機械' | '纜繩' | '徒手' | '壺鈴' | '其他';
type ArmSubGroup = '二頭' | '三頭';

// ---- 動作（動作庫的一筆）----
interface Exercise {
  id: string;             // crypto.randomUUID()
  name: string;           // 例：槓鈴臥推
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  isCustom: boolean;      // 內建 false / 使用者自訂 true
  notes?: string;
  createdAt: number;      // Date.now()
  subGroup?: ArmSubGroup;  // (v1.11)
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
  assistWeight?: number;  // 輔助重量（kg）(v1.11)
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
  location?: string;      // 訓練地點，例如 '中壢建工' (v1.1)
  programId?: string;     // 訓練計畫 id (v1.7)
  programSlotId?: string; // 訓練計畫中的 slot id (v1.7)
  programCycleNumber?: number; // 計畫第幾輪 (v1.7, 1-based)
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
  locations?: string[];   // 可選地點清單，例如 ['中壢建工', '楊梅WG'] (v1.1)
}

// ---- 訓練範本 (v1.1) ----
interface WorkoutTemplate {
  id: string;
  name: string;           // 範本名稱，例如 '胸 + 三頭'
  location?: string;
  entries: WorkoutEntry[]; // 保留 weight/reps/isWarmup；completed 一律 false
  createdAt: number;
  updatedAt: number;
}

// ---- 計畫裡的一個循環項目 (v1.7) ----
interface ProgramSlot {
  id: string;
  label: string;           // 項目名稱 (例如：胸日)
  templateId?: string;     // 連結範本 ID
}

// ---- 訓練計畫 (v1.7) ----
interface TrainingProgram {
  id: string;
  name: string;            // 計畫名稱
  slots: ProgramSlot[];    // 循環排程項目
  completedSlotIdsThisLap: string[]; // 這一輪已消耗的 slot id
  cycleCount: number;      // 已完成輪數
  estimatedWeeks: { min: number; max: number }; // 預估週數
  status: 'active' | 'completed';
  startedAt: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
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
   └─ prompts/         # phase0.md ~ phase7.md
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
| Phase 6 | 設定 + PWA 收尾 | 設定頁 + 可安裝 + 離線 → **MVP v1.0** |
| — | GitHub Pages 部署 | base path + Actions 自動部署，手機可安裝 |
| Phase 7（v1.1） | 訓練地點 + 範本 + 日曆 + 示意圖 | 4 項擴充：地點選擇 / 範本(保留重量) / 日曆檢視 / 動作示意圖 |
| Phase 8（v1.2） | 歷史強化：刪除 / 搜尋 / 自動命名 / 日曆部位圖 | 4 項優化：一鍵刪除 / 關鍵字搜尋 / 自動命名 / 地點上色部位圖 |
| Phase 9（v1.3） | 訓練頁修正 + 動作庫示意圖縮圖 | 3 項：修 NumberStepper 行動端輸入 / 移除組間休息選單 / 動作庫卡片加示意圖縮圖 |
| Phase 10（v1.4） | 動作庫視覺卡片 | select 模式預設 2 欄圖片網格 + list/grid 切換按鈕；manage 模式縮圖放大至 64 px |
| Phase 11（v1.5） | 有氧訓練模式 | SetLog 新增 durationSeconds/distanceKm/calories；WorkoutLogger 有氧 UI 分支；History/Progress 有氧顯示；seed 補充橢圓機/爬梯機/跳繩 |
| Phase 12（v1.6） | Google 雲端同步 | Firebase Auth（Google 登入）+ Firestore LWW 同步；schema version(3) 加 updatedAt；設定頁同步區塊 |
| Phase 13（v1.7） | 訓練計畫（循環排程） | interface ProgramSlot/TrainingProgram + programs CRUD / store + WorkoutLogger UI + 備份/同步收錄 |
| Phase 14（v1.8） | 1RM 計算機分頁 | 獨立 1RM 速算工具分頁 + NumberStepper + 沿用既有 e1rm 公式與設定 |
| Phase 15（v1.9） | 雲端同步修正 + 訓練感受選單 + 週輪動 | 修 3 個掉資料 bug（雙向增量/不覆寫 updatedAt/軟刪除墓碑）+ header 同步鈕 + RPE 改四句中文 + 拉推腿手滾動 7 天輪動；schema version(8) 軟刪除 |
| Phase 16（v1.10） | 替代動作擇一紀錄 + 訓練菜單頂部分頁 | WorkoutEntry 加 candidateExerciseIds?（擇一切換、範本綁+當場加）+ 進行中訓練改頂部橫向捲動分頁（一頁一動作、點開才展開）；純函式 `src/lib/workoutEntries.ts`，無 Dexie 版本/Firestore 規則變更。 |
| Phase 17（v1.11） | 動作庫整理 + 輔助重量 + 手臂細分 | 內建動作拆分/改名/重分類 (version 10 遷移) + 輔助重量欄位 + 手臂細分二頭/三頭次級篩選與自訂部位。 |
| Phase 18（v1.12） | 孤兒動作參照三層修復 | 修掉「讀取中...」永久卡死：內建改名表改寫在程式碼裡（`SEED_RENAMES`，不再只靠 Dexie upgrade 產的 idAliases）＋宗諺課表按「範本名＋順序」反推救回名稱已失傳的孤兒 id（救到的對照寫回 idAliases 同步出去）＋UI 改顯示「⚠ 未知動作」並可一鍵重新指定（`replaceEntryExercise`）。無 schema 版本變更。 |
| Phase 19（v1.13） | 有氧快捷鈕 + 開訓前「沿用最近三次」 | 計畫卡片加「🏃 有氧」鈕（只列全有氧範本，開訓不帶 programId 故不推進 cursor）＋「開始今天訓練」改先跳選單挑最近 3 次同 slot 紀錄沿用重量（`startWorkoutFromPastWorkout`，帶回計畫資訊；無紀錄則直接開訓）。＋「開始新訓練」改兩步：先選部位（7 個肌群，顯示上次練是幾天前）再挑最近 3 次同部位紀錄沿用（比對看實際做過的動作而非標題）。純函式 `src/lib/cardioTemplates.ts`、`src/lib/recentSessions.ts`，無 schema／Firestore 規則變更。 |
| Phase 20（v1.14） | 全站「前一步／下一步」 | Header 左上加上一頁／下一頁按鈕，放在 `Layout` 故每一頁都有（PWA 獨立視窗沒有瀏覽器工具列，原本回不去）。瀏覽器不提供「還能不能上一頁」，故自記一份 `location.key` 堆疊：純函式 `src/lib/historyStack.ts` + zustand `src/store/historyNav.ts`（外部系統，避免 setState-in-effect），不能按時按鈕變灰。全屏 Sheet 會蓋掉 header，故另抽 `src/components/SheetHeader.tsx`（上一步＋標題＋✕）給五張全屏頁共用。無 schema／Firestore 規則變更。 |
| Phase 21（v1.15） | 班表感知的月訓練計畫自動生成 | 月計畫純函式即時計算＋`dayOverrides` 表（記錄班別代碼與手動暫停）＋設定頁自訂對照表與門檻＋課表頁頂部月曆與編輯日期彈出面版；schema version(11) 儲存與 Firestore 同步。 |
| Phase 22（v1.16） | 月曆長按拖曳批次編輯班表 | 月曆格子改用 pointer 事件判定長按與拖曳範圍＋高亮反白視覺＋批次編輯 Sheet 套用同一組設定至多日。 |
| Phase 23（v1.17） | 班表獨立分頁＋每週目標次數＋今日無法快速鍵 | 班表獨立為 /schedule 路由並有獨立 NavItem ＋ 新增 settings.weeklyTargetSessions 決定未登記/休假訓練頻率 ＋ 9 宮格面板一鍵單點即存 ＋ 今日無法（paused: true）直接跳過 ＋ 分類配色與 emoji。 |
| Phase 24（v1.18） | 進度頁與歷史清單視覺強化 | Progress 頁 1RM/最大重量 PR 卡片各自識別色 + 趨勢圖圓點上地點色 + 圖表加部位圖示 + 歷史清單卡片加部位圖示與地點色徽章。 |
| Phase 25（v1.19） | 班別狀態擴充＋月曆滿版配色＋智慧排課規則 | 新增 forcedRest 狀態（z-index 修正/10顆按鈕分區/扣抵週目標） + 月曆格滿版配色 + 智慧排課腿日前後/避免連練/胸背優先（只看當天要不要練，不碰 slot 順序與 cursor/cycleCount）。 |
| Phase 26（v1.20） | 班別配色分色＋預設政策校正＋指定訓練部位 | `ShiftCodeCategory` 拆分＋預設 policies 修正 ＋ `DayOverride.pinnedSlotId` ＋ `completedSlotIdsThisLap` 取代 `cursor` (含 Dexie version 12) ＋ 月曆指定提示與 conflict 標記 ＋ `WorkoutLogger` 循序列表連動修復。 |
| Phase 26.1（v1.21） | 訓練排程隔天分散＋AB/AC/BC 底色改色＋指定休息／有氧 | `generateMonthPlan` 明確排班分支追加「週目標已達成不硬練」＋「沒有 urgent 壓力偏好隔天訓練」，避免連續訓練天數擠成一坨 ＋ AB/AC/BC 底色改用 indigo/green/yellow（原本 rose/orange/pink 色相太集中） ＋ 新增 `DayOverride.pinnedOutcome`（'rest' \| 'cardio'），「指定訓練部位」面板擴充成「指定當天安排」可直接指定休息或有氧。 |

> 一次做一個階段，做完讓 Claude review，過了再進下一階段。
> **進度（2026-08-17）**：Phase 0–26.1 全數完成並上線（https://bigshop127.github.io/GymTracker/ ）：MVP v1.0（Phase 0–6）+ v1.1–v1.21（Phase 7–26.1）。各階段完成紀錄見 Obsidian `健身APP開發/`。
>
> **Phase 12 啟用前置作業**（雲端同步需自行設定）：
> 1. 至 console.firebase.google.com 建立 Firebase 專案
> 2. 啟用 Authentication（Google 提供者）+ Firestore Database
> 3. 取得 Web App 設定，複製 `.env.local.example` → `.env.local` 並填入
> 4. Firebase Console → Authentication → Authorized domains → 加入 `bigshop127.github.io`
> 5. GitHub repo → Settings → Secrets → Actions → 加入 6 個 `VITE_FIREBASE_*` 變數


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
4. **uuid** 用 `crypto.randomUUID()` —— **但「內建 seed 資料」不行**。內建動作若用隨機 uuid，每台裝置各生一套 id；雲端同步又只推自訂動作，於是 A 裝置的範本／訓練同步到 B 就指到查不到的 id（UI 卡在「讀取中...」，進度統計也被切成兩半）。內建資料一律用**確定性 id**（`seedExerciseId(name)` → `seed:動作名稱`，見 `src/data/seed-exercises.ts`）；歷史資料靠 Dexie version(9) + `idAliases` 對照表修復（`src/db/repairExerciseIds.ts`）。
5. **Firestore 不收 `undefined` 欄位**：`setDoc()` 遇到任一個值為 undefined 的鍵（含 `entries[]` 巢狀）就整筆拋錯。搭配 `Promise.all` 會讓**一筆髒資料害整輪同步中斷**，而且 `lastSyncAt` 不前進 → 每次重試都撞同一筆，永久卡死。三層防護：`initializeFirestore({ ignoreUndefinedProperties: true })`、`pushDoc` 送出前 `stripUndefined()`、推送改 `Promise.allSettled`。
    - 另注意 merge 寫入時「省略鍵」不等於「清空欄位」——雲端會留著舊值。要清空得送 `deleteField()`（只有頂層鍵需要；陣列裡的巢狀物件本來就是整包覆蓋）。
6. **改內建動作的名稱＝改它的 id**：一定要配 version bump + `idAliases` 遷移，**而且要在 `SEED_RENAMES` 補一行**。Dexie 的 `upgrade()` 只在「舊庫升級」時跑：全新安裝／清過網站資料／換瀏覽器的裝置直接建新版庫，永遠不會產生對照，卻照樣從雲端拉到指向舊 id 的範本／訓練。改名表寫在程式碼裡（`src/data/seed-exercises.ts` 的 `SEED_RENAMES` → `STATIC_SEED_ID_ALIASES`），任何裝置只要跑到新版就修得動。
7. **WorkoutEntry 只存 `exerciseId`、不存名稱** → id 一旦查不到就無從反推，任何自動修復都救不回來（`idAliases` 只有「當年還存著那筆舊動作列」的那台裝置生得出來，那台清過資料就永遠失傳）。因此：
    - UI 一律要有 fallback，**不准再顯示「讀取中...」**——查不到就顯示「⚠ 未知動作」並提供「重新指定」（`replaceEntryExercise`），別讓使用者卡在假的載入中。
    - 宗諺課表的 4 個範本有權威名單，可用「範本名＋entry 順序」反推（`src/lib/zongYuanIdRescue.ts`）；其餘範本沒有名單可對，只能靠使用者手動指定。

---

## 7. 未來雲端同步路徑（先不做，預留形狀）

- 每筆資料已帶 `id`（uuid）與 `createdAt`，未來加 `updatedAt` 與 `deletedAt`（軟刪除）即可做最後寫入勝出（LWW）同步。
- repository 介面（`src/db/`）就是未來抽換成「本機 + 遠端」的接縫；UI 不需改。
- 雲端後端可選 Supabase / Firebase（自帶 auth + 即時 DB），屆時再開一個 Phase。
