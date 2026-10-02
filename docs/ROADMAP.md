# 健身動作紀錄器（Gymie-style）開發藍圖 ROADMAP

> 本檔是整個專案的 **SSOT（單一事實來源）**。所有階段提示詞都以此為準，資料模型有任何變更，先改這裡。

---

## 0. 專案定位

| 項目 | 內容 |
|---|---|
| 目標 | 自製一個類 [Gymie](https://apps.apple.com/us/app/gymie-fitness-tracker/id6758956867) 的健身訓練紀錄器 |
| 平台 | **Web PWA**（手機優先、可安裝、離線可用） |
| 首版範圍 | **精簡 MVP**：動作庫 + 訓練紀錄 + 組間休息計時 + 訓練歷史 + 基本進度圖 |
| 互動模式 | 2026-09-26 起：規格（Claude 擬、使用者確認）→ Claude 實作＋自我 review → 上線 → 使用者驗收（原「自己寫 code → Claude review」的寫 code 方是 Gemini，已退場） |
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
  exerciseId: string;     // 對應 Exercise.id（＝這次要記錄的那個，歷史/統計只看它＋sets）
  candidateExerciseIds?: string[];  // 替代動作候選（含當前選定）(v1.10)
  candidateSets?: { exerciseId: string; sets: SetLog[]; weeklyTargets?: WeekTarget[] }[];  // 沒被選中的替代動作各自的組數/重量 (v2.4)；範本裡可有自己的週次目標，缺省跟主動作 (v2.5)
  order: number;          // 在這次訓練中的排序
  sets: SetLog[];
  defaultRestSeconds?: number;
  weeklyTargets?: { sets: number; reps: number; note?: string }[];  // 範本專用：課表週次漸進；某週 sets=0＝那週跳過這個動作 (v2.5)
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
  selfScheduled?: boolean; // 自行安排：班表不自動排、不算進一輪（腿日）(v2.6)
}

// ---- 訓練計畫 (v1.7) ----
interface TrainingProgram {
  id: string;
  name: string;            // 計畫名稱
  slots: ProgramSlot[];    // 循環排程項目
  completedSlotIdsThisLap: string[]; // 這一輪已消耗的 slot id
  cycleCount: number;      // 已完成輪數（只算自動輪替的格子；不限 8 輪，一直累加）
  estimatedWeeks: { min: number; max: number }; // 預估週數（v2.6 起不再顯示，保留相容）
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
| Phase 28（v1.22） | 訓練計畫生命週期：重新開始／暫停／終止／封存清單 | `TrainingProgram.status` 擴成 `active/paused/completed/abandoned`＋新增 `pausedAt/accumulatedPausedMs/runNumber/restartedFromProgramId`；純函式層 `src/lib/programLifecycle.ts`；store 拆 `currentProgram`/`activeProgram` 兩欄位讓暫停自動生效（既有讀 `activeProgram` 的程式碼不用改）；新頁 `/programs` 管理目前計畫（暫停/繼續/重新開始/終止）與封存清單（重新啟用/永久刪除）；`shiftPlan.ts` 新增 `programPaused` 建議；`SchedulePage` 移除 early-return 改顯示提示橫幅；表單抽成共用 `ProgramFormSheet`。無 Dexie version bump（純新增選填欄位）。 |
| v2.4（2026-09-28） | 空白範本＋範本編輯器／課表找不到範本不再卡死＋完成時比對課表／替代動作各自組數／班表刪紀錄 | ①`TemplateEditorSheet`：手動建空白範本、編輯名稱/分類/地點/動作/每組重量次數/替代動作 ②課表頁某天範本被刪時只標那天（復原／改用其他範本／建空白），刪除課表在用的範本會先警告 ③完成訓練時 `diffWorkoutAgainstTemplate` 列出跟範本／課表的差異，選「更新，之後照這樣」（`mergeWorkoutIntoTemplate`，保留 weeklyTargets）或「只有今天」；一組都沒打勾先提醒 ④`WorkoutEntry.candidateSets`：每個替代動作自己的組數，切換時互換、第一次切過去沿用上次紀錄 ⑤班表點日期可查看/刪除當天紀錄（過去日子也可），刪課表訓練會退回課表進度（`revertSlotForDeletedWorkout`）；進行中草稿改虛線「進行中」不再顯示 ✓ ⑥所有全屏/底部彈窗改 z-[60]，不再被底部導覽列蓋住按鈕。無 Dexie version bump（純新增選填欄位）。 |
| v2.5（2026-09-28） | 課表頁：用某週內容產生空白範本／編輯時選「8 週同步」或「只改這週」／替代動作各自的週次組數 | ①課表頁「用 Wn 的內容產生空白範本」：勾選要的天，照那週的動作、替代、組數×次數建一般範本（重量 0、不帶 weeklyTargets、跳過的動作不放）②課表編輯改成草稿（`ProgramDayEditCard`＋`lib/programWeeks`），按「套用到全部 8 週」＝改過的數字 8 週都一樣、刪掉的 8 週都拿掉、新增的 8 週都有；「只改這週」＝只動那週、刪掉的那週 sets=0 跳過、新增的其他週 0；換動作／替代增減／排序兩種都套 8 週；編輯中不能切週次 ③課表可加替代動作，每個替代可設自己的週次組數×次數（`candidateSets[].weeklyTargets`），開訓時照它自己的週次、重量用範本存的或上次做它的 ④開訓時跳過那週 0 組的動作；完成比對不把跳過的列成「沒做」，「更新課表」原樣保留跳過的動作；改做有自己週次的替代時，更新後週次一起換 ⑤數字加減鈕補上深色主題樣式。無 Dexie version bump。 |
| v2.6（2026-10-02） | 班表 推→拉→手 輪替＋腿自行安排／不限 8 週一直累加輪數／課表「每輪紀錄」／歷史頁趨勢＋比例圖 | ①`ProgramSlot.selfScheduled`（自行安排）：班表不自動排、不算進一輪（`lib/programRotation`：`rotationSlotsOf`／`settleLap`），班表指定那天或訓練頁點那格才練，算一次訓練（佔每週次數、算連續天數）；Dexie version(13) 一次性把目前的宗諺課表改成 推、拉、手、腿(自行安排)，重新匯入也是這個順序 ②排課 `generateMonthPlan` 嚴格照輪替順序接下去，拿掉「手/腿先讓路」「腿日前後避開」「N 天沒練強制插隊」三條規則（設定頁「太久沒訓練門檻」一併移除）；沒登記班別的日子有餘裕時也隔天練 ③輪數不限：第 1~8 輪用 W1~W8，第 9 輪起固定 W7（`weekIdxForCycle`，開訓／跳過判斷／完成比對都走它）；計畫卡改「第 N 輪（Wk）· 開始後第 X 週」，管理可改開始日期、目前第幾輪 ④課表頁「課表內容／每輪紀錄」切換：選一天，依輪列出每個動作實際組數×次數＠最重一組，跟上一次比重量▲▼、組數、次數、新動作、沒做的都標出來（`lib/lapHistory`）⑤歷史頁：上方「訓練總覽」卡＝趨勢（近 8 週堆疊格子，每格一次訓練、點了開那筆）／比例（某月部位甜甜圈），清單改依週分段的精簡列＋分類篩選鈕（`lib/historyStats`）；超過 4 小時的時長（忘了按結束）不顯示也不算平均；分類色改 dataviz 色盤驗過的一組（手 cyan→sky、其他取 -600）。 |
| Phase 29（v1.23） | 範本分類整理：拉／推／腿／手／自訂 五分類＋兩段式選擇 | 重用既有 `splitRotation.ts` 的 `normalizeSplit` 判斷邏輯（運算單一來源），新增 `TemplateCategory`（`WorkoutTemplate.category?`，選填、手動指定優先）與 `getTemplateCategory`/`groupTemplatesByCategory`；首頁「我的範本」改成 5 顆分類藥丸＋點進去才看全螢幕清單（新到舊排序），有氧範本整批排除在外；清單內每筆範本新增「分類」按鈕；完成訓練另存範本時新增分類選擇（有預選猜測值）；計畫表單的綁定範本下拉選單改用 `<optgroup>` 依分類分組。無 Dexie version bump（純新增選填欄位）。 |

> 一次做一個階段，做完自我 review（eslint／build／vitest＋讀變更檔），過了再進下一階段。
> **進度（2026-08-17）**：Phase 0–26.1 全數完成並上線（https://bigshop127.github.io/GymTracker/ ）：MVP v1.0（Phase 0–6）+ v1.1–v1.21（Phase 7–26.1）。之後的現況見 Obsidian `健身APP開發/GymTracker 目前進度.md`（2026-09-26 起只留這一頁，舊的各階段完成紀錄已整理掉）。
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

8. **底部導覽列是 `fixed z-50`**：任何全屏 Sheet／底部彈窗若也用 `z-50`，最底下約 65px 會被導覽列蓋住——按鈕看得到一半、按不到（範本細項的「開始這份訓練」、歷史明細的「刪除此筆訓練紀錄」都中過）。**彈窗一律 `z-[60]` 以上**，彈窗裡再疊的選單用 `z-[70]`。
9. **課表的 slot 指到的範本可能被刪（軟刪除）**：讀課表內容時查不到就該「那一天」顯示修復選項，**不能整頁 return null 當成還在載入**（v2.3 以前課表頁就這樣永遠卡在「載入課表中…」）。復原範本要把 `deletedAt` 明寫成 `undefined`（鍵存在），同步才會送 `deleteField()` 清掉雲端的刪除標記。
10. **課表週次 `sets = 0` 代表「那週跳過」**：凡是「依週次排這天要做什麼」的地方（開訓 `startWorkoutFromProgramSlot`、完成比對、更新課表、產生空白範本、課表頁顯示／當週總計）都要先濾掉 `isSkippedInWeek`；更新課表（`mergeWorkoutIntoTemplate`）不能把沒做的跳過動作刪掉。替代動作的週次一律用 `ownTargetsOf(entry, id)` 取（自己的優先、沒有就主動作的），不要直接讀 `entry.weeklyTargets`。
11. **輪數 → 課表第幾週一律用 `weekIdxForCycle(cycleNumber)`**（第 1~8 輪對 W1~W8、第 9 輪起固定 W7），不要再寫 `cycleNumber - 1`——超過 8 輪會被夾到 W8 測試週。
12. **「自行安排」的格子不算進一輪**：完成一格、改課表、刪紀錄退回進度、排課的輪替池，都要用 `rotationSlotsOf`／`settleLap`，不要拿 `program.slots.length` 判斷一輪練完沒（會被腿日卡住永遠不進下一輪）。

---

## 7. 未來雲端同步路徑（先不做，預留形狀）

- 每筆資料已帶 `id`（uuid）與 `createdAt`，未來加 `updatedAt` 與 `deletedAt`（軟刪除）即可做最後寫入勝出（LWW）同步。
- repository 介面（`src/db/`）就是未來抽換成「本機 + 遠端」的接縫；UI 不需改。
- 雲端後端可選 Supabase / Firebase（自帶 auth + 即時 DB），屆時再開一個 Phase。
