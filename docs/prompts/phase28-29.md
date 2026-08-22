# Phase 28 + 29 工作清單：訓練計畫生命週期 ＋ 範本五分類整理

> 兩階段規格原本分開擬定（Phase 28 於 2026-08-19、Phase 29 於 2026-08-22），因使用者想一次進行而合併成單一檔案。**兩階段彼此獨立、無資料相依**：Phase 28 只碰 `TrainingProgram` ／ `src/db/programs.ts` ／ `store/program.ts` ／ `shiftPlan.ts`；Phase 29 只碰 `WorkoutTemplate` ／ `src/db/templates.ts` ／ `src/lib/splitRotation.ts`。唯一共同點是兩邊都會大幅改到 `src/pages/WorkoutLogger.tsx`（目前 1800+ 行）。
>
> 建議**實作與 commit 仍分兩批**：各自跑完自己的驗收清單、各自把 `src/version.ts` 的 `APP_VERSION` +0.1、各自在 `docs/ROADMAP.md` §4 補一列。不要為了「一次做完」把兩份 diff 混進同一個 commit——混在一起 review 跟回滾都會變麻煩。實作先後順序不拘，兩者沒有依賴關係，哪個先做都可以。
>
> 分工照工作協議（[[gymtracker-working-agreement]]）：以下兩份都是規格，由你自己動手寫 code，我事後獨立 review。

---

# Phase 28 訓練計畫生命週期：重新開始／暫停／終止／封存清單

> 觸發：2026-08-19 使用者提出——原本進行中的宗諺 8 週課表「打算重新來過」，而且「現在主要是先記錄訓練的重量跟容量」，希望計畫能有**從頭開始／暫停／終止**等操作。
>
> 對齊後拍板四件事：
> 1. 「從頭開始」＝**封存舊的＋開一份全新副本**（新 id、第 1 輪、開始日＝今天），不是原地把進度歸零。理由：歷史與進度頁能分辨「第一次跑」與「重跑這次」，舊紀錄的輪次統計不會混進新一輪。
> 2. 「暫停」＝**計畫凍結但留在畫面上**。班表月曆整片顯示「計畫暫停中」不再排課、不再催練；訓練照常記錄，且**完訓不消耗 slot、不推進輪次**；暫停的天數**不計入「已進行週數」**。隨時一鍵繼續，進度接續。
> 3. 「終止」要配**計畫封存清單**：列出全部計畫（進行中／暫停中／已完成／已中止），可查看、重新啟用、永久刪除；終止時區分「已完成（跑完）」與「已中止（不練了）」。
> 4. 分工照工作協議（[[gymtracker-working-agreement]]）：本文＝規格，由你自己動手寫 code，我事後獨立 review。
>
> 本文建立在 Phase 13（`programs`／`store/program.ts`）、Phase 21/23/25/26/26.1（`shiftPlan.ts`／`dayOverrides`／`SchedulePage.tsx`）、Phase 27（原定 vs 實際）之上。

---

## 0. 核心設計決策

### 0-1. `status` 從二值擴成四值，並引入「目前計畫」的概念

現況 `TrainingProgram.status` 只有 `'active' | 'completed'`（`src/db/schema.ts:130`），`getActiveProgram()`（`src/db/programs.ts:8`）只查 `'active'`。**任何非 active 狀態都會讓計畫整個從 App 消失**——這是暫停功能不能直接沿用現有欄位的原因。

```ts
export type ProgramStatus = 'active' | 'paused' | 'completed' | 'abandoned';
```

| 值 | 語意 | 是否為「目前計畫」 |
|---|---|---|
| `active` | 進行中，會排課、會推進輪次 | ✅ |
| `paused` | 凍結：不排課、不推進，但還是「我現在這份計畫」 | ✅ |
| `completed` | 跑完收工，進封存 | ❌ |
| `abandoned` | 中止不練了（含「重新開始」時被換掉的那份），進封存 | ❌ |

**同時最多只能有一份「目前計畫」**（`active` 或 `paused`）。這條唯一性守衛原本寫在 `saveProgram()` 裡、只在 `status === 'active'` 時才跑（`src/db/programs.ts:27`）——**這是本階段最容易漏掉的坑**：不改的話，「暫停舊計畫 → 建立新計畫」會同時留下兩份目前計畫，訓練頁與班表頁讀到哪一份取決於 Dexie 回傳順序。

### 0-2. store 拆成 `currentProgram` / `activeProgram` 兩個欄位，讓暫停自動生效

暫停期間，「排課／開訓帶 programId／完訓消耗 slot／7 天輪動」全部都該停掉，但這些讀取點散在 `WorkoutLogger.tsx`、`SchedulePage.tsx`、`store/activeWorkout.ts:183`、`shiftPlan.ts`。逐一加 `status !== 'paused'` 判斷既囉唆又容易漏。

改用**在 store 分流一次**：

```ts
currentProgram: TrainingProgram | null;  // status ∈ {active, paused}，UI 顯示用
activeProgram: TrainingProgram | null;   // 只有 status === 'active' 才有值；語意跟現在完全一樣
```

於是**所有既有讀 `activeProgram` 的程式碼一行都不用改**，暫停時它們自動退化成「沒有計畫」的行為（不排課、不帶 programId、完訓不 `completeSlot`）。只有「要顯示暫停中卡片／橫幅」的地方改讀 `currentProgram`。

實作上兩個欄位必須永遠一起寫入，抽一個內部 helper：

```ts
function applyCurrent(set, p: TrainingProgram | null) {
  set({ currentProgram: p, activeProgram: p?.status === 'active' ? p : null });
}
```

### 0-3. 「重新開始」複製既有計畫，不重跑匯入

不能用「再按一次 `/plan` 的匯入鈕」來重來：`importZongYuanProgram()`（`src/lib/importZongYuanProgram.ts:52`）每次都會**新建 4 個範本**，重跑一次範本庫就多 4 筆重複的拉/推/腿/手。

正確作法：拿目前這份計畫，**沿用它的 `slots`（連 `slot.id` 與 `templateId` 一起沿用）**複製出新計畫。沿用 `slot.id` 是刻意的：月曆上未來日期若已經有「指定訓練部位」（`DayOverride.pinnedSlotId`，Phase 26），重新開始後那些指定仍然對得上，不會全部變成 `pinConflictReason: 'removed'`。

代價：新舊兩份計畫共用同一組 slot id，**所以任何以 slotId 當唯一鍵的邏輯都必須連 `programId` 一起看**。現有兩處都已經是對的，不用改，但你新寫的程式碼要守住：

- `getRecentWorkoutsForSlot()`（`src/lib/recentSessions.ts:21`）精準層比對 `programId + programSlotId` ✅
- `store/activeWorkout.ts:184` 完訓時先確認 `activeProgram.id === activeWorkout.programId` ✅

### 0-4. 暫停期間不計入「已進行週數」

訓練頁計畫卡片現在是 `((now - activeProgram.startedAt) / 604800000)`（`WorkoutLogger.tsx:685`）——暫停三個月後回來會顯示「已進行 13.2 週」，毫無意義。改用累計暫停時間扣抵（見 §2 的 `getElapsedWeeks`）。

### 0-5. 不需要 Dexie version bump

本階段只**新增選填欄位**、沒有動任何索引（`programs` 索引維持 `'id, name, status, createdAt, updatedAt'`），`status` 新增的兩個值對既有索引也完全相容。所以**不要新增 `version(13)`**——CLAUDE.md 那條「改 schema 要 `version(n).stores({...})`」講的是動到 stores／索引的情況，這次沒動。舊資料靠讀取端給缺省值即可（`accumulatedPausedMs ?? 0`、`runNumber ?? 1`）。

同理**不需要改 `firestore.rules`**（規則是整棵 `users/{uid}` 放行，沒有欄位白名單）、**不需要改 `src/lib/backup.ts`**（備份是整張 `programs` 表 dump）、**不需要改 `src/sync/sync.ts`**（LWW 是泛型的）。

---

## 1. 資料模型（`src/db/schema.ts`）

```ts
export type ProgramStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export interface TrainingProgram {
  // ---- 既有欄位不動 ----
  id: string;
  name: string;
  slots: ProgramSlot[];
  completedSlotIdsThisLap: string[];
  cycleCount: number;
  estimatedWeeks: { min: number; max: number };
  status: ProgramStatus;              // ← 型別擴充（原本是 'active' | 'completed'）
  startedAt: number;
  completedAt?: number;               // ← 語意改寫：「結束時間（completed 或 abandoned 皆填）」
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;

  // ---- 本階段新增（全部選填，舊資料相容）----
  pausedAt?: number;                  // 目前這段暫停的起點；status === 'paused' 時必有，繼續時清成 undefined
  accumulatedPausedMs?: number;       // 歷來暫停累計毫秒；繼續時 += (now - pausedAt)。缺省視為 0
  runNumber?: number;                 // 這份課表跑第幾次，從 1 起算。缺省視為 1
  restartedFromProgramId?: string;    // 「重新開始」時，被封存的那份的 id
}
```

`completedAt` 沿用、不新增 `endedAt`，是為了避免只為語意漂亮就多一次資料遷移；改註解說明它是「結束時間」即可，是完成還是中止由 `status` 區分。

---

## 2. 純函式層 `src/lib/programLifecycle.ts`（新檔）

依專案慣例（Phase 20/26/27），所有狀態轉換寫成**不碰 Dexie 的純函式**，才測得動。`now` 一律由呼叫端注入。

```ts
import { type TrainingProgram } from '../db/schema';

/** 這份計畫是不是「目前計畫」（進行中或暫停中） */
export function isCurrentProgram(p: TrainingProgram): boolean;

/** 進行中 → 暫停中。已經是 paused 就原樣回傳（冪等，避免重複點擊蓋掉 pausedAt） */
export function pauseProgram(p: TrainingProgram, now: number): TrainingProgram;

/** 暫停中 → 進行中，把這段暫停時間累加進 accumulatedPausedMs，清掉 pausedAt */
export function resumeProgram(p: TrainingProgram, now: number): TrainingProgram;

/** 結束：completed（跑完）或 abandoned（中止）。若當下是 paused，先把暫停時間結算掉再結束 */
export function endProgram(
  p: TrainingProgram,
  now: number,
  reason: 'completed' | 'abandoned',
): TrainingProgram;

/**
 * 重新開始：回傳「要封存的舊計畫」與「全新的計畫」兩筆，由呼叫端一起寫入。
 * - archived: status 'abandoned'、completedAt = now（若原本 paused 也先結算暫停時間）
 * - fresh:    新 id、status 'active'、cycleCount 0、completedSlotIdsThisLap []、
 *             startedAt/createdAt/updatedAt = now、pausedAt undefined、accumulatedPausedMs 0、
 *             completedAt undefined、runNumber = (p.runNumber ?? 1) + 1、
 *             restartedFromProgramId = p.id、
 *             slots = p.slots 深拷貝但 **id 與 templateId 原樣沿用**（見 0-3）、name 沿用不改
 */
export function restartProgram(
  p: TrainingProgram,
  now: number,
): { archived: TrainingProgram; fresh: TrainingProgram };

/** 已進行週數（扣掉暫停）。paused 期間以 pausedAt 當「現在」，週數才會真的停住 */
export function getElapsedWeeks(p: TrainingProgram, now: number): number;

/** 已暫停天數（只有 paused 才有意義，其餘回 0），給「已暫停 N 天」文案用 */
export function getPausedDays(p: TrainingProgram, now: number): number;
```

`getElapsedWeeks` 的算式：

```ts
const end = p.status === 'paused' ? (p.pausedAt ?? now) : (p.completedAt ?? now);
const ms  = Math.max(0, end - p.startedAt - (p.accumulatedPausedMs ?? 0));
return ms / 604800000;
```

所有函式都要 `updatedAt = now`（否則雲端 LWW 不會把新狀態推出去，這是 Phase 15 修過的老坑）。

---

## 3. 資料存取層 `src/db/programs.ts`

1. **新增 `getCurrentProgram()`**：查 `status` 為 `'active'` 或 `'paused'` 且未軟刪除的第一筆，用 `db.programs.where('status').anyOf(['active', 'paused'])`。
2. **`getActiveProgram()` 保留原樣**（只查 `'active'`），仍有呼叫端。
3. **`saveProgram()` 的唯一性守衛條件放寬**：判斷式由 `updatedProgram.status === 'active'` 改成 `isCurrentProgram(updatedProgram)`；被擠掉的其他目前計畫改標成 **`'abandoned'`**（原本標 `'completed'`，語意錯——它不是跑完的，是被取代的），一樣填 `completedAt = now`。
4. **新增 `restartCurrentProgram(now)`**：在單一 `db.transaction('rw', db.programs, ...)` 內把 `restartProgram()` 產出的 `archived` 與 `fresh` 一起 `bulkPut`。**必須同一個 transaction**，否則中途失敗會留下「兩份 active」或「零份計畫」。
5. **`deleteProgram()` 不動**（軟刪除）。注意：**刪計畫絕不能連帶刪範本**——範本是新舊計畫共用的（0-3）。

---

## 4. Store `src/store/program.ts`

```ts
interface ProgramState {
  currentProgram: TrainingProgram | null;   // 新增
  activeProgram: TrainingProgram | null;    // 語意不變
  archivedPrograms: TrainingProgram[];      // 新增：封存清單（completed / abandoned），依 completedAt 新→舊
  isLoading: boolean;

  initProgram: () => Promise<void>;         // 改用 getCurrentProgram()，同時載入 archivedPrograms
  createProgram: (...) => Promise<void>;    // 既有簽章不變；內部「先結束舊的」改標 abandoned
  updateProgram: (...) => Promise<void>;    // 改成對 currentProgram 生效（暫停中也要能編輯名稱／slots）
  pause: () => Promise<void>;               // 新增
  resume: () => Promise<void>;              // 新增
  restart: () => Promise<void>;             // 新增
  finish: (reason: 'completed' | 'abandoned') => Promise<void>;  // 取代舊的 endProgram()
  reactivate: (programId: string) => Promise<void>;              // 新增：從封存清單重新啟用
  removeProgram: (programId: string) => Promise<void>;           // 新增：永久刪除（軟刪除）
  completeSlot: (slotId: string) => Promise<void>;               // 不動
}
```

要點：

- 每個異動完成後都要 `applyCurrent()`（0-2）＋刷新 `archivedPrograms`，畫面才會即時反映。
- **`completeSlot()` 維持只對 `activeProgram` 生效**：它的呼叫端 `store/activeWorkout.ts:183` 讀的就是 `activeProgram`，暫停時是 `null`，自然不會推進——這就是「暫停期間完訓不消耗 slot」的實作方式，不要另外寫判斷。
- `updateProgram()` 目前讀 `activeProgram`（`src/store/program.ts:78`），要改讀 `currentProgram`，否則暫停中按「編輯」會靜靜失效。
- 舊的 `endProgram()` 直接改名成 `finish(reason)`；`WorkoutLogger.tsx:360` 的呼叫點一併更新。

---

## 5. 排課 `src/lib/shiftPlan.ts`

1. `DayPlanSuggestion` 新增 `'programPaused'`：

   ```ts
   export type DayPlanSuggestion =
     | 'train' | 'restOrCardio' | 'cardio' | 'paused' | 'forcedRest'
     | 'programPaused' | 'noProgram' | 'past';
   ```

   注意跟既有的 `'paused'` 區分：`'paused'` 是**單日**「今日無法」（`DayOverride.paused`），`'programPaused'` 是**整份計畫**暫停。命名別搞混。

2. `describeSuggestionLabel()` 補一個 case：`case 'programPaused': return '計畫暫停中';`（switch 沒有 default，漏加會被 TS 抓到，這是好事）。

3. `GenerateMonthPlanInput` 新增選填 `programPaused?: boolean`。

4. 決策鏈插在 `isPast` 之後、`override?.paused` 之前（`shiftPlan.ts:445` 附近）：

   ```ts
   if (isPast) {
     suggestion = 'past';
   } else if (programPaused) {
     suggestion = 'programPaused';
     daysSinceWeights += 1;
     consecutiveTrainDays = 0;
     yesterdayWasLegsTrain = false;
   } else if (override?.paused) { ... }
   ```

   **刻意不動 `trainedThisWeek` 與 `effectiveWeeklyTarget`**：暫停期間沒有週目標可言，不必像 `forcedRest` 那樣扣抵配額。
   **順序刻意排在單日覆寫之前**：整份計畫暫停時，個別日期的「今日無法／強制休息」沒有作用對象，混著顯示反而讓人以為還在排課。班別底色與當天實際訓練紀錄照常顯示（那些不走 `suggestion`）。

5. 呼叫端（`SchedulePage.tsx:162,184`、`WorkoutLogger.tsx:162`）傳 `programPaused: currentProgram?.status === 'paused'`，`activeProgram` 照舊傳 store 的 `activeProgram`（暫停時已是 `null`）。就算漏傳新參數，最差也只是退回 `'noProgram'`，不會崩。

6. 「原定 vs 實際」（Phase 27）兩次呼叫傳**同一個** `programPaused`，暫停期間兩條線一致、不會產生假的 `diverged`。`stripDecisionOverride()` 不需要改。

---

## 6. UI

### 6-1. 抽出 `src/components/ProgramFormSheet.tsx`（重構）

現在建立／編輯計畫的全屏表單埋在 `WorkoutLogger.tsx:1649-1822`，而新的 `/programs` 頁也要用同一張表單。`WorkoutLogger.tsx` 已經 1825 行，照抄一份必爆。抽成共用元件：

```ts
interface ProgramFormSheetProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: TrainingProgram | null;   // edit 時帶入
  templates: WorkoutTemplate[];
  onClose: () => void;
  onSaved?: () => void;               // 儲存成功後通知呼叫端（重載清單）
}
```

- 表單內部狀態（`programName` / `programSlots` / `estWeeksMin` / `estWeeksMax`）與 handler（`handleAddSlot` / `handleRemoveSlot` / `handleUpdateSlotLabel` / `handleUpdateSlotTemplate` / `handleMoveSlot` / `handleSaveProgram`）整組搬進去，`WorkoutLogger.tsx` 對應的 state 與 handler 一併刪除。
- **「結束此計畫 (封存)」那顆鈕從表單裡拿掉**（`WorkoutLogger.tsx:1809`），生命週期操作統一移到 `/programs`，避免兩個入口行為不一致。
- `open` 為 false 時回傳 `null`；每次 `open` 由 false→true 時用 `initial` 重置表單狀態（別讓上一次的殘留值帶進來）。

### 6-2. 新頁 `/programs`「訓練計畫」

`src/pages/ProgramsPage.tsx`，在 `App.tsx` 用 `lazy` + `Suspense` 註冊（比照 `/schedule`）。**不加進 `BottomNav`**——底部已經 9 個項目、手機要橫捲了，入口改走：

- 訓練頁計畫卡片右上「管理」鈕 → `navigate('/programs')`（原本開表單）
- 設定頁加一列「訓練計畫管理」

頁面內容：

**(a) 目前計畫區**（`currentProgram` 有值時）

- 名稱＋狀態徽章：`進行中`（indigo）／`暫停中`（amber）
- 副標：`第 N 次 · 第 X 輪 · 已進行 Y.Y 週（預估 min–max 週）`，週數用 `getElapsedWeeks()`
- 暫停中額外一行：`已暫停 Z 天`（`getPausedDays()`）
- 四顆操作鈕：

  | 鈕 | 行為 |
  |---|---|
  | 編輯 | 開 `ProgramFormSheet`（mode `edit`） |
  | 暫停／繼續 | `pause()` / `resume()`，依 `status` 切換文案與圖示 |
  | 重新開始 | `window.confirm` 後 `restart()` |
  | 終止 | 兩段確認（見下） |

- **「重新開始」確認文案**（把後果講清楚，這是不可逆操作）：

  > 確定要從頭開始嗎？\n目前的「{name}」（第 {N} 次，已進行 {Y.Y} 週）會標記為**已中止**並存進封存，同時建立一份全新的「{name}」（第 {N+1} 次）從第 1 輪開始。\n\n已完成的訓練紀錄不會被刪除。

- **「終止」的兩段確認**：先問「要標記成哪一種？」→ `已完成（跑完了）` / `已中止（不練了）` / 取消。用兩顆按鈕的小面板，別用 `window.prompt`。選定後呼叫 `finish(reason)`。

**(b) 沒有目前計畫時**

空狀態卡片：`＋ 建立訓練計畫`（開 `ProgramFormSheet`，mode `create`）＋ `前往課表匯入`（`/plan`）。

**(c) 封存清單區**（`archivedPrograms`）

- 標題 `封存的計畫（{n}）`，依 `completedAt` 新→舊
- 每列：名稱＋`第 N 次` ＋狀態徽章（`已完成` emerald／`已中止` slate）＋期間 `YYYY/MM/DD – YYYY/MM/DD` ＋ `共 X 輪`
- 兩顆次要操作：
  - **重新啟用**：若已有目前計畫，先 `window.confirm`「目前的『{name}』會標記為已中止並封存，確定嗎？」；確認後把該筆改成 `status: 'active'`（`completedAt` 清成 `undefined`）存回，唯一性守衛會自動處理舊的那份
  - **永久刪除**：`window.confirm` 後 `removeProgram()`（軟刪除）。文案要註明「不會刪除訓練紀錄與範本」
- 清單為空時整區不顯示

### 6-3. 訓練頁 `src/pages/WorkoutLogger.tsx`

三態分支（`WorkoutLogger.tsx:670` 附近）：

| 狀態 | 畫面 |
|---|---|
| 沒有目前計畫 | 維持現狀：`＋ 建立訓練計畫` |
| `paused` | **新的「⏸ 計畫暫停中」卡片**：名稱、`已暫停 N 天`、主鈕 `繼續計畫`（`resume()`）、次鈕 `管理`（→ `/programs`）。**不顯示** slot 藥丸列、7 天輪動、今日建議與「開始今天訓練」 |
| `active` | 維持現狀，只有兩處改：「管理」鈕改導 `/programs`；「已進行 X 週」改用 `getElapsedWeeks()` |

「開始新訓練」與有氧快捷鈕**三態都照常可用**——這正是使用者要的「只記重量跟容量」模式，別跟著藏起來。

### 6-4. 班表頁 `src/pages/SchedulePage.tsx`

現在 `!activeProgram` 會 **early-return 擋掉整頁**（`SchedulePage.tsx:382`），暫停或終止之後班表頁直接變空殼。改法：

- **移除 early-return**，月曆一律照常渲染（班別底色、實際訓練紀錄、長按批次編輯都與計畫無關，本來就該能用）。
- 改在月曆上方放一條**提示橫幅**：
  - `paused`：amber 底 `⏸ 計畫暫停中，暫不安排課表` ＋ `繼續計畫` 鈕（`resume()`）
  - 沒有目前計畫：slate 底 `尚未設定訓練計畫，目前只顯示班別與訓練紀錄` ＋ `前往課表匯入` 鈕（`/plan`）
  - `active`：不顯示橫幅
- 建議欄位在這兩種情況分別顯示 `計畫暫停中` 與 `尚未設定課表`（`describeSuggestionLabel()` 已涵蓋）。
- **hooks 順序**：原本的 early-return 在所有 hooks 之後，改成條件渲染不會違反 hooks 規則；但要確認 `useMemo` 內部對 `activeProgram` 為 `null` 的處理仍安全（`generateMonthPlan()` 本來就吃 `null`，Phase 21 已有測試涵蓋）。

### 6-5. 課表頁 `src/pages/ProgramGuide.tsx`

匯入前的確認只看 `activeProgram`（`ProgramGuide.tsx:30`），暫停中的計畫會被無聲換掉。改讀 `currentProgram`，文案補上狀態：

> 目前已有{進行中／暫停中}的計畫「{name}」，匯入這份課表將會結束它，確定嗎？

`isActiveHere` 與「目前第 N 輪」也改讀 `currentProgram`（暫停時顯示 `（已暫停）`）。

---

## 7. 測試（Vitest）

### 新檔 `src/lib/__tests__/programLifecycle.test.ts`

- `pauseProgram` → `status='paused'`、`pausedAt=now`、`updatedAt` 有 bump；**對已 paused 的計畫再呼叫一次，`pausedAt` 不變**（冪等）
- `resumeProgram` → `status='active'`、`pausedAt` 清空、`accumulatedPausedMs` 累加正確（連續兩次 pause/resume 要累加兩段）
- `getElapsedWeeks`：① 進行中扣掉累計暫停；② **暫停中時間不再前進**（`now` 往後推 30 天，回傳值不變）；③ 已結束用 `completedAt` 當終點
- `endProgram`：兩種 reason 都寫 `completedAt`；從 `paused` 結束時，最後那段暫停時間有被結算進 `accumulatedPausedMs`
- `restartProgram`：`archived.status==='abandoned'`、`fresh.id !== p.id`、`fresh.runNumber === (p.runNumber ?? 1) + 1`、`fresh.cycleCount === 0`、`fresh.completedSlotIdsThisLap` 為空、`fresh.restartedFromProgramId === p.id`、**`fresh.slots` 的 id 與 templateId 與原本逐一相同**、`fresh.startedAt === now`
- `isCurrentProgram` 四種 status 各一

### 追加 `src/lib/__tests__/shiftPlan.test.ts`

- `programPaused: true` → 整個月未來日期全部 `'programPaused'`，過去日期仍是 `'past'`
- `programPaused: true` 時，帶 `pinnedSlotId` 的那天**不會**產生 `pinConflict`（根本沒進排課分支）
- 「原定 vs 實際」兩邊都 paused → `diverged` 全為 `false`
- `programPaused: false`（或不傳）→ 既有測試結果一字不變（回歸保護）

### 追加 `src/db/__tests__/`（既有 fake-indexeddb 環境）

- `saveProgram()` 存一份 `paused` 計畫時，另一份 `active` 會被擠成 `'abandoned'`（唯一性守衛，0-1 那個坑）
- `restartCurrentProgram()` 跑完後，`programs` 表恰好有一份目前計畫

---

## 8. 驗收清單

- [ ] 訓練頁計畫卡片「管理」→ `/programs`，四顆鈕都在且文案正確
- [ ] 按「暫停」後：訓練頁變成「⏸ 計畫暫停中」卡片；班表頁月曆**還在**且整片顯示「計畫暫停中」；「開始新訓練」照常可用
- [ ] 暫停期間完成一次訓練 → 該訓練**沒有** `programId`／`programSlotId`；輪次（`cycleCount`）與 `completedSlotIdsThisLap` 都沒動
- [ ] 隔一天（或手動改系統時間）再看，「已進行 X 週」在暫停期間**沒有增加**；按「繼續」後從原本的週數接續往前
- [ ] 按「重新開始」：封存清單多一筆「已中止」的舊計畫；目前計畫變成同名、`第 2 次`、第 1 輪、已進行 0.0 週；**範本庫沒有多出重複的拉/推/腿/手**
- [ ] 重新開始後，月曆上原本已指定的未來訓練部位仍然有效（沒有變成「指定失效」）
- [ ] 按「終止」→ 選「已完成」或「已中止」→ 計畫進封存清單；訓練頁回到「＋ 建立訓練計畫」；班表頁**不再整頁被擋**，改顯示提示橫幅＋月曆
- [ ] 封存清單「重新啟用」把舊計畫救回來，且原本的目前計畫被正確封存（不會同時存在兩份）
- [ ] 封存清單「永久刪除」後，該計畫消失，但**歷史訓練紀錄與範本都還在**
- [ ] 手動同步（上傳→另一台下載）後，暫停狀態與封存清單一致
- [ ] `npx eslint .` 無錯
- [ ] `npm run build`（`tsc -b && vite build`）通過
- [ ] `npx vitest run` 全綠
- [ ] `src/version.ts` 的 `APP_VERSION` +0.1
- [ ] `docs/ROADMAP.md` §4 階段索引補上 Phase 28 一列

---

## 9. 踩雷預告

1. **唯一性守衛沒放寬**（0-1）：`saveProgram()` 只在 `'active'` 分支擠掉別的計畫。忘了改的話，「暫停 → 建新計畫」會留下兩份目前計畫，且**症狀不明顯**——畫面看起來正常，但 `getCurrentProgram()` 拿到哪一份取決於 Dexie 回傳順序，換台裝置就可能不一樣。
2. **`updateProgram()` 還讀 `activeProgram`**：暫停中按「編輯計畫」會靜靜地什麼都沒發生（`if (!activeProgram) return;`），不報錯，最難查。
3. **`'paused'` 撞名**：`DayPlanSuggestion` 既有的 `'paused'` 是單日「今日無法」，新加的是 `'programPaused'`。在 `SchedulePage` 的配色／emoji 查表補值時特別容易漏掉新的那個 key。
4. **Tailwind v4 靜默吞非標準色階**（老坑，CLAUDE.md 有記）：新卡片與徽章的 amber/slate 色階只能用 `50/100/…/900/950`。寫完搜一次 `-\d{2,3}` 自查。
5. **`updatedAt` 忘了 bump**：任何狀態轉換都要更新，否則雲端 LWW 判定本機比較舊，暫停／終止在另一台裝置上會被舊資料蓋回去（Phase 15 修過同類 bug）。
6. **舊裝置相容**：還沒更新到本版的裝置同步下來 `status: 'paused'` 時，它的 `getActiveProgram()` 查不到 → 會顯示成「還沒有啟用中的訓練計畫」。這是可接受的降級，但**兩台裝置都更新完再開始用暫停功能**比較不會嚇到自己。
7. **刪計畫別動範本**：新舊計畫共用同一批 `templateId`，順手清理範本會把還在用的課表刪掉。
8. **`restartCurrentProgram()` 要包在同一個 transaction**：分兩次寫入若中途失敗，會留下兩份 active 或零份計畫。

---

# Phase 29 範本分類整理：拉／推／腿／手／自訂 五分類 + 兩段式選擇

> 觸發：2026-08-22 使用者提出——「我的範本」清單（`WorkoutLogger.tsx` 首頁下半段）已經累積到要捲軸才看得完，希望比照既有的 拉/推/腿/手 四分法分類整理，選擇流程改成**先選類別、再選範本**，同一類別內的範本**新到舊排序**。
>
> 分工照工作協議（[[gymtracker-working-agreement]]）：本文＝規格，由你自己動手寫 code，我事後獨立 review。

---

## 0. 核心設計決策

### 0-1. 分類邏輯整套重用 `src/lib/splitRotation.ts`，不新造一套判斷規則

專案裡已經有一套一模一樣的四分類系統：`SplitCategory = '拉' | '推' | '腿' | '手'`、`normalizeSplit(text)`（`splitRotation.ts:3-29`），用「文字裡有沒有特定關鍵字」判斷類別（腿→拉→推→手依序比對，先比對到的算），且**已經在 `recentSessions.ts:34` 拿來判斷 workout 標題的類別**、也是首頁「最近 7 天輪動」四顆藥丸（`WorkoutLogger.tsx:722-742`）背後的分類依據。範本要分類，直接接上這套既有邏輯（ROADMAP 核心原則 #5「運算單一來源」），不要另外寫一份關鍵字比對。

### 0-2. 範本比 workout 多一種情況：判不出來的要有地方放

`normalizeSplit()` 判不出來時回 `null`（例如範本名稱是「8/15 核心」或單純沒取名）。範本分類需要一個第五個桶接住這些，所以：

```ts
// src/db/schema.ts
export type TemplateCategory = '拉' | '推' | '腿' | '手' | '自訂';
```

**不要**從 `schema.ts` 反過來 `import` `splitRotation.ts` 的 `SplitCategory`——`splitRotation.ts:1` 已經 `import { type Workout, type TrainingProgram } from '../db/schema'`，反向 import 會產生循環引用。`TemplateCategory` 直接在 `schema.ts` 用字面量寫一份即可；`SplitCategory`（拉/推/腿/手）結構上是它的子集合，指派相容，不需要轉換函式。

### 0-3. `WorkoutTemplate.category` 選填，不用一次性資料搬遷

```ts
export interface WorkoutTemplate {
  // ...既有欄位不動...
  category?: TemplateCategory;   // 使用者手動指定過才有值；沒有就即時用名稱推斷
}
```

新增選填、未建索引的欄位，比照 Phase 28 §0-5 的先例：**不需要 `db.version(13)`**，舊資料靠讀取端給 fallback 即可。

**有效分類**用一個新的純函式算，`category` 有值就直接用（使用者明確指定過，優先權最高——即使名稱恰好也含其他分類關鍵字，也不要覆蓋使用者的選擇）；沒有值才退回 `normalizeSplit(name)`；還是判不出來才落在 `'自訂'`：

```ts
// src/lib/splitRotation.ts（延伸既有檔案，不開新檔）
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [...SPLIT_CATEGORIES, '自訂'];

export function getTemplateCategory(
  template: Pick<WorkoutTemplate, 'name' | 'category'>
): TemplateCategory {
  return template.category ?? normalizeSplit(template.name) ?? '自訂';
}
```

這代表原本從宗諺課表匯入的四筆範本（名稱就是 `'拉 (Pull)'`、`'推 (Push)'`、`'腿 (Leg)'`、`'手 (Arms)'`，見 `zongyuan-8week-program.ts:30/61/82/108`）**完全不用搬遷**，`normalizeSplit()` 直接就能判對；判不出來的舊範本會先落在「自訂」，使用者之後手動改分類即可（見 §3-2），不需要開工前先跑一次分類精靈。

### 0-4. 有氧範本整批排除在五分類之外

有氧範本（`isCardioTemplate()`，`cardioTemplates.ts:7`）已經有專屬的「🏃 有氧」入口（`isCardioSheetOpen` sheet）。五分類的目的是替「拉/推/腿/手/自訂」這種重量訓練範本瘦身，**不要把有氧範本也塞進五分類的計數與清單裡**——這樣才不會變成兩套地方要同時維護同一批範本。分組前先用現有的 `filterCardioTemplates` / `isCardioTemplate` 濾掉即可，`exerciseMap` 這個變數 `WorkoutLogger.tsx` 裡已經有現成的（`filterCardioTemplates(templates, exerciseMap)` 已經在用，見 `WorkoutLogger.tsx:225-226`），不用重新 `buildExerciseMap`。

### 0-5. 兩段式 UI：首頁只放 5 顆分類藥丸，範本清單挪進點進去才看得到的全螢幕清單

現在 903-956 行整段「我的範本」是攤平列表，用 `max-h-[35vh] overflow-y-auto` 硬壓出捲軸——這正是使用者說「太多了」的來源。改成：

- 首頁只顯示 **5 顆分類藥丸**（拉/推/腿/手/自訂），每顆帶數量，例如「拉 (5)」。
- 點一顆 → 開全螢幕 Sheet（比照 `WorkoutLogger.tsx:1498-1505` 「開始新訓練」Sheet 那樣用 `SheetHeader` + `fixed inset-0`），裡面才是該分類的範本卡片列表，**新到舊排序**。
- 這樣首頁永遠只有 5 顆藥丸那麼高，不管使用者存了幾十筆範本都不會再把首頁往下擠。

---

## 1. 資料模型（`src/db/schema.ts`）

```ts
export type TemplateCategory = '拉' | '推' | '腿' | '手' | '自訂';

export interface WorkoutTemplate {
  id: string;
  name: string;
  location?: string;
  entries: WorkoutEntry[];
  category?: TemplateCategory;   // ← 新增，選填
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
```

不動 `class GymTrackerDatabase` 的 `stores()` 定義，不新增 `version()`。

---

## 2. 純函式層（延伸 `src/lib/splitRotation.ts`）

```ts
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [...SPLIT_CATEGORIES, '自訂'];

/** 範本的「有效分類」：手動指定優先，沒指定才用名稱推斷，判不出來落在自訂 */
export function getTemplateCategory(
  template: Pick<WorkoutTemplate, 'name' | 'category'>
): TemplateCategory;

/**
 * 依有效分類分組，5 個 key 一律都存在（沒有該分類就是空陣列，不是 undefined）。
 * 維持傳入陣列的原始順序（呼叫端負責先排好序、先濾掉有氧），這裡不重新排序。
 */
export function groupTemplatesByCategory(
  templates: WorkoutTemplate[]
): Record<TemplateCategory, WorkoutTemplate[]>;
```

`groupTemplatesByCategory` 內部五個 key 要顯式初始化（比照 `splitRotation.ts:78-83` 現有 `statuses` 那個 `Record` 的寫法），不要用 `reduce` 動態塞 key。

`import type { WorkoutTemplate, TemplateCategory } from '../db/schema';` 加到 `splitRotation.ts` 檔頭既有的 import 那行旁邊。

---

## 3. UI（`src/pages/WorkoutLogger.tsx`）

### 3-1. 首頁「我的範本」區塊改版（取代現有 903-956 行）

```tsx
{nonCardioTemplates.length > 0 && (
  <div className="w-full text-left space-y-3 pt-6 border-t border-slate-100 dark:border-slate-800">
    <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
      我的範本 (保留重量)
    </h3>
    <div className="flex flex-wrap gap-2">
      {TEMPLATE_CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => setSelectedTemplateCategory(cat)}
          className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-indigo-300 transition cursor-pointer"
        >
          {cat} ({grouped[cat].length})
        </button>
      ))}
    </div>
  </div>
)}
```

- `nonCardioTemplates = templates.filter((t) => !isCardioTemplate(t, exerciseMap))`（`useMemo`，依賴 `templates`／`exerciseMap`）。
- `grouped = groupTemplatesByCategory(nonCardioTemplates)`（`useMemo`）。
- 判斷區塊要不要顯示，改用 `nonCardioTemplates.length > 0`（不是原本的 `templates.length > 0`）——避免「全部範本都是有氧」時還顯示 5 顆全 0 的藥丸。
- 5 顆藥丸**固定都顯示**，即使某類 0 筆也照樣列出（點進去看到空清單即可），不要因為數量 0 就整顆藏起來或 disable——分類固定 5 種，藏掉反而讓人以為分類變動了。

### 3-2. 分類清單 Sheet（新狀態 `selectedTemplateCategory: TemplateCategory | null`）

`selectedTemplateCategory !== null` 時開一個全螢幕 Sheet（比照 `WorkoutLogger.tsx:1498-1505` `SheetHeader` 寫法，`title` 用 `${selectedTemplateCategory} 範本`），內容把原本 903-956 行那個卡片列表原封不動搬進來，`templates.map` 換成 `grouped[selectedTemplateCategory].map`，並在既有「改名」「刪除」兩顆按鈕旁邊加第三顆「分類」：

```tsx
<button
  onClick={() => handleChangeTemplateCategory(t)}
  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 transition cursor-pointer"
  title="分類"
>
  分類
</button>
```

```ts
const handleChangeTemplateCategory = async (template: WorkoutTemplate) => {
  const current = getTemplateCategory(template);
  const input = window.prompt(
    `分類（輸入 ${TEMPLATE_CATEGORIES.join('/')} 其中一個）：`,
    current
  );
  if (input === null) return;
  const picked = TEMPLATE_CATEGORIES.find((c) => c === input.trim());
  if (!picked) {
    alert(`請輸入 ${TEMPLATE_CATEGORIES.join('/')} 其中一個`);
    return;
  }
  try {
    await saveTemplate({ ...template, category: picked, updatedAt: Date.now() });
    await loadTemplates();
  } catch (err) {
    console.error(err);
    alert('修改分類失敗');
  }
};
```

用 `window.prompt` 是刻意的最小改法——這個檔案裡改名（`handleRenameTemplate`，`WorkoutLogger.tsx:581`）本來就是同一種寫法，5 選 1 用文字輸入＋驗證比另外做一個按鈕面板元件更快、對這個已經 1800+ 行的檔案也更省事。如果你實作時想做成 5 顆按鈕的小面板（比照本檔 Phase 28 §6-2「終止計畫」那種兩顆按鈕的小面板），也可以，體驗更好但不是必要條件。

### 3-3. 存範本流程（`WorkoutLogger.tsx:1444-1487`「完成訓練」→ 另存範本）

現有流程：`window.confirm` 問要不要存 → `window.prompt` 取名（預設值 `defaultName`，組成見 1449-1456 行）→ `saveTemplate`。在 `saveTemplate` 之前插入分類選擇，預選值用既有的 `bodyPart`／`rawTitle` 文字跑一次 `normalizeSplit`：

```ts
const guessedCategory = normalizeSplit(bodyPart) ?? normalizeSplit(templateName) ?? '自訂';
const categoryInput = window.prompt(
  `分類（${TEMPLATE_CATEGORIES.join('/')}，直接 Enter 使用預設）：`,
  guessedCategory
);
const category = TEMPLATE_CATEGORIES.find((c) => c === categoryInput?.trim()) ?? guessedCategory;
const template = createTemplateFromWorkout(activeWorkout, templateName);
await saveTemplate({ ...template, category });
```

`bodyPart` 變數在 1453-1456 行已經算好（是文字，不是型別化的分類），直接餵給 `normalizeSplit` 即可。

### 3-4.（順手做，非必要）計畫 slot 綁定範本的下拉選單分組

`WorkoutLogger.tsx:1771-1782` 那個 `<select>`（幫 `ProgramSlot` 綁定範本）可以用 `<optgroup label={cat}>` 依 `groupTemplatesByCategory` 分組，讓下拉選單也不用長長一串平舖。時間有限可以先跳過，不影響本階段主要驗收項目。

---

## 4. 測試（`src/lib/__tests__/splitRotation.test.ts` 追加）

- `getTemplateCategory`：
  - 明確設定 `category` 時，即使 `name` 含其他分類關鍵字，仍以 `category` 為準
  - 沒有 `category` 時退回 `normalizeSplit(name)`（沿用既有 `normalizeSplit` 測資，例如名稱含「背」判成拉）
  - `name` 判不出來（例如 `'核心強化'`）且沒有 `category` → 回傳 `'自訂'`
- `groupTemplatesByCategory`：
  - 5 個 key 一律存在，沒有範本的分類回傳空陣列（不是 `undefined`）
  - 保留傳入陣列的原始相對順序，不做二次排序

---

## 5. 驗收清單

- [ ] 首頁「我的範本」變成 5 顆分類藥丸＋數量，不再是可捲動的長列表
- [ ] 有氧範本不計入五分類數量，也不出現在任何分類清單裡（仍只能從「🏃 有氧」入口找到）
- [ ] 點分類藥丸開全螢幕清單，同分類範本維持新到舊排序（沿用 `listTemplates()` 既有順序，不重新排序）
- [ ] 清單裡每筆範本都能改名／刪除／改分類；改分類後回首頁，藥丸數量與該範本歸屬立刻反映
- [ ] 完成訓練另存範本時會被問分類（有預選猜測值，直接 Enter 可用），存檔後立刻歸類正確
- [ ] 既有舊範本（`category` 欄位是 `undefined`）不用任何搬遷就能正確落在對的分類；宗諺課表匯入的 拉/推/腿/手 四筆範本尤其要對
- [ ] `npx eslint .` 無錯
- [ ] `npm run build`（`tsc -b && vite build`）通過
- [ ] `npx vitest run` 全綠
- [ ] `src/version.ts` 的 `APP_VERSION` +0.1
- [ ] `docs/ROADMAP.md` §4 階段索引補上 Phase 29 一列

---

## 6. 踩雷預告

1. **`schema.ts` 不能 import `splitRotation.ts`**：方向反了會循環引用（`splitRotation.ts` 已經 import `schema.ts` 的型別）。`TemplateCategory` 就地用字面量定義在 `schema.ts`，不要嘗試 `import { SplitCategory } from '../lib/splitRotation'` 再組合。
2. **改分類一定要 bump `updatedAt`**：跟本檔 Phase 28 §9-5、Phase 15 提過的老坑一樣，忘了 bump 的話雲端 LWW 會判定本機比較舊，換裝置後分類選擇會被舊資料蓋回去。
3. **`normalizeSplit` 的比對順序是 腿→拉→推→手**（`splitRotation.ts:11-26`）：名稱恰好同時含兩類關鍵字時，以先比對到的為準。這是既有行為（`recentSessions.ts` 也依賴同一順序），不要在本階段順手「修正」，會動到既有功能的既有結果。
4. **`category` 是「使用者手動指定過」的訊號，不是快取**：只有使用者按過「分類」或存新範本時選過，才寫入這個欄位。不要在讀取端（例如 `listTemplates()`）偷偷把 `normalizeSplit` 推斷出來的值寫回資料庫——那樣使用者之後想把某筆範本硬性歸到「自訂」（即使名稱含分類關鍵字）會失效，因為下次讀取又被推斷值覆蓋掉。推斷值只能算出來當下用，不落地。
5. **`Record<TemplateCategory, WorkoutTemplate[]>` 五個 key 要顯式初始化**：比照 `splitRotation.ts:78-83` 現有 `statuses` 那段寫法先建好 5 個空陣列，不要用 `reduce`／動態賦值，否則 TS 型別會不滿意，也可能漏 key。
6. **`isCardioTemplate` 需要 `exerciseMap`**：`WorkoutLogger.tsx` 裡已經有現成的 `exerciseMap`（`filterCardioTemplates(templates, exerciseMap)` 已經在用），過濾有氧範本時直接用它，不要重新 `buildExerciseMap(allExercises)`。
