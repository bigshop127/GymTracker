# Phase 13 — 訓練計畫（循環排程）（v1.7）

> 前置：v1.6（雲端同步）已上線。本階段回應的需求：「匯入三個月訓練計畫」。
> 分工：規格由我寫、你實作、我 review。過了才 commit/push。
>
> **已確定的設計方向（不要重新討論，照這個做）：**
> 1. **純排程，不做自動漸進負荷**——App 只負責「今天該練哪個」，重量/次數照舊手動輸入調整。之後要加自動加重建議，是加一層計算，不用動這階段的資料結構。
> 2. **彈性推進，不綁日曆日期**——完成一天才推進到下一天，中間停練幾天不會打亂後面排程，也不會有「今天是第幾週」這種被日期綁死的顯示。
> 3. **循環，不是週曆格**——五分化不要求「一週練完 5 天」，就是一個會不斷繞回去的有序清單（胸→背→腿臀→肩→手臂→胸→…）。**Slot 數量做成通用（任意 N 個）**，不要寫死 5——這不會增加工作量，陣列本來就是這樣存，寫死 5 反而要多寫限制。
> 4. **內容之後補**——建立計畫當下可以先不指定任何動作/組數，之後直接用「另存為範本」把內容補上去（見 13C 的關鍵機制，這樣就不用另外做一套「編輯計畫內容」UI）。
> 5. **預估週數是參考值，隨時可改**——使用者說會「根據身體狀況更改」，`estimatedWeeks` 要能在計畫進行中隨時編輯，不是建立時鎖死。
>
> 建議實作順序（由小到大，每塊各自獨立、做完就給我 review）：**13A → 13B → 13C → 13D**。

---

## 資料模型變更（先看，貫穿全 Phase）

### schema.ts 新增

```ts
// 計畫裡的一個循環節點（例：胸日）
interface ProgramSlot {
  id: string;
  label: string;           // 例：'胸日'、'背日'、'腿臀日'、'肩日'、'手臂日'（自由文字，不綁 MuscleGroup）
  templateId?: string;     // 對應 WorkoutTemplate.id；還沒補內容時是 undefined
}

// 訓練計畫（循環排程）
interface TrainingProgram {
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

// Workout 新增（非索引欄位，免動 Dexie stores()）
interface Workout {
  // ...原欄位
  programId?: string;
  programSlotId?: string;
  programCycleNumber?: number;   // 這筆訓練發生在計畫的第幾輪（1-indexed，方便顯示「第3輪‧背日」）
}
```

### ⚠️ Dexie 版本升級

目前最新是 `version(6)`。**保留 1-6 不動**，往後追加 `version(7)`，只宣告新表：

```ts
this.version(7).stores({
  programs: 'id, name, status, createdAt, updatedAt',
});
```

- `Workout` 新增的 3 個欄位**不是索引欄位** → 不需要寫進 `stores()`，也不需要 upgrade()（新欄位對舊資料而言就是 undefined，程式邏輯本來就要當它可能不存在處理）。
- `programs` 是全新的表，沒有舊資料要搬，不需要 `upgrade()`。

### cursor / cycleCount 的推進規則（先講清楚，13C 會用到）

`cursor` 指向「下一個要練的 slot」。完成一次掛在該計畫的訓練後才推進，規則：

```ts
const nextCursor = (program.cursor + 1) % program.slots.length;
const wrapped = nextCursor === 0;
program.cursor = nextCursor;
if (wrapped) program.cycleCount += 1;
```

範例（5 個 slot）：`cursor` 依序 0→1→2→3→4→（繞回）0，繞回的那次 `cycleCount` 0→1。開始一筆訓練時，寫入該筆 `Workout.programCycleNumber = program.cycleCount + 1`（人類看的「第幾輪」用 1-indexed）。

---

## 13A — 資料層：Program CRUD

### 目標
比照 `src/db/templates.ts` 的寫法，新增 `src/db/programs.ts`。

### 規格
- `listPrograms(): Promise<TrainingProgram[]>`——依 `createdAt` 排序。
- `getActiveProgram(): Promise<TrainingProgram | null>`——查 `status === 'active'` 的第一筆（約定同時最多一筆 active，比照 `getActiveWorkout()` 的單一進行中精神）。
- `getProgram(id): Promise<TrainingProgram | undefined>`
- `saveProgram(p: TrainingProgram): Promise<void>`——`put`，並蓋上 `updatedAt: Date.now()`（比照 `saveTemplate`）。
- `deleteProgram(id): Promise<void>`
- **新增 `src/store/program.ts`（Zustand）**，不要只用頁面內 `useState`：因為 13C 的 `finishWorkout()`（在 `store/activeWorkout.ts`，不是 component）需要直接讀寫「目前 active 的計畫」並推進 cursor，用全域 store 才不用 prop-drilling。
  - State：`activeProgram: TrainingProgram | null`、`isLoading: boolean`。
  - Actions：`initProgram()`（載入 active）、`createProgram(input)`、`updateProgram(updates)`（改名/調整 slots/調整 estimatedWeeks）、`endProgram()`（`status → 'completed'`, `completedAt = Date.now()`）、`advanceCursor()`（套用上面的推進規則並 `saveProgram`）。
  - 供非 component 呼叫的地方（`activeWorkout.ts` 的 `finishWorkout`）用 `useProgramStore.getState()` 存取，比照現有 `useRestTimerStore.getState().skipTimer()` 的用法。

### 驗收標準
- 建立一筆 Program、重整頁面、`initProgram()` 撈得到同一筆（status active）。
- 同時只有一筆 active：建立新計畫時若已有 active，先擋下或詢問是否結束舊計畫（哪種 UX 由你決定，13B 會用到）。

---

## 13B — 建立與編輯計畫 UI

### 目標
在「訓練」頁的**開始畫面**（目前只有「開始訓練」大按鈕跟「我的範本」的那個狀態）新增計畫入口，全螢幕表單建立/編輯。

### 規格
- **入口位置**：`WorkoutLogger.tsx` 開始畫面，「開始新訓練」按鈕下方、「我的範本」上方，新增：
  - 沒有 active 計畫時：一顆次要按鈕「＋ 建立訓練計畫」。
  - 有 active 計畫時：不顯示這顆，改顯示 13C 的「進行中計畫」卡片（卡片上要有「管理」或「編輯」入口，開同一個表單做編輯）。
- **表單內容**（全螢幕 sheet，比照現有「動作選擇器 (全屏)」的樣式）：
  - 計畫名稱（文字輸入）。
  - Slot 清單：每列 = 上下移動排序 + label 文字輸入 + 刪除鈕；底部「＋ 新增循環項目」。**新建立計畫時預設帶 5 個 slot**，label 預填 `['胸日', '背日', '腿臀日', '肩日', '手臂日']`（沿用你現有 `MuscleGroup` 的用語），使用者可自由改文字/增刪/排序，不強制跟 `Exercise.muscleGroup`有資料關聯，純自由字串。
  - 每個 slot 可選擇「綁定現有範本」（下拉選單，選項 = `listTemplates()` 結果），不綁也可以直接儲存（之後用 13C 的機制自動補）。
  - 預估週數：兩個 `NumberStepper`（最少/最多），預設 8 / 12。
  - 儲存鈕：新建 → `createProgram(...)`，`status: 'active'`；編輯 → `updateProgram(...)`。
  - 編輯模式下額外提供「結束此計畫」按鈕（`endProgram()`，需二次確認，比照現有 `window.confirm` 風格）。
- **若建立新計畫時已存在 active 計畫**：`window.confirm('目前已有進行中的計畫「{name}」，建立新計畫將會結束它，確定嗎？')`，確定就先 `endProgram()` 舊的再建新的。

### 驗收標準
- 從空白建立一個 5-slot 計畫（用預設 label）、存檔 → 訓練頁看得到「進行中計畫」卡片。
- 拖曳/上下移調整 slot 順序、改名、刪除單一 slot 都正常，且不影響已綁定的 `templateId`。
- 已有 active 計畫時再建新計畫 → 依上面規則詢問並正確結束舊計畫。
- 編輯 `estimatedWeeks` 後即時反映在進行中計畫卡片的顯示上（13C）。

---

## 13C — 訓練頁串接：從計畫開始今天的訓練（核心）

### 目標
有 active 計畫時，訓練頁開始畫面顯示「今天該練哪個」，一鍵開始；完成後自動推進到下一個 slot；沒內容的 slot 能優雅退回手動模式，並在存範本時「順便」把內容補回計畫。

### 規格

**進行中計畫卡片**（`WorkoutLogger.tsx` 開始畫面，「開始新訓練」下方、「我的範本」上方）：
- 顯示：計畫名稱、目前 slot（`slots[cursor].label`）、「第 {cycleCount+1} 輪」、已經過時間 vs 預估週數（`(Date.now() - startedAt) / 一週毫秒數`，顯示成「已進行 X.X 週（預估 8-12 週）」，純顯示不做任何強制或提醒）。
- 大按鈕：「開始今天的訓練（{slot.label}）」。

**開始今天的訓練**（`store/activeWorkout.ts` 新增 `startWorkoutFromProgramSlot()`）：
- 沿用既有 single-active-workout 防呆：已有 `activeWorkout` → `throw new Error('ACTIVE_WORKOUT_EXISTS')`（跟現有 `startWorkoutFromTemplateEntity` 一致的擋法與 UI 提示）。
- 取 `slots[cursor]`：
  - 有 `templateId` 且能查到該範本 → 邏輯等同 `startWorkoutFromTemplateEntity(template)`（保留 weight/reps）。
  - 沒有 `templateId`，**或 `templateId` 指向的範本已被刪除**（查不到）→ 邏輯等同 `startNewWorkout(slot.label)`（空白訓練，標題帶 slot label）。兩種情況都不可以噴錯，第二種是正常路徑不是異常。
  - 產生的 `Workout` 額外寫入：`programId`、`programSlotId`、`programCycleNumber = activeProgram.cycleCount + 1`。

**完成訓練時推進 cursor**（`finishWorkout()`，`store/activeWorkout.ts`）：
- 完成後，若剛結束的 `activeWorkout.programId` 存在 → 取該 Program，套用本檔開頭的推進規則，`saveProgram(...)`，並更新 `useProgramStore` 的 state。
- **關鍵機制**——「另存為範本」順便補齊計畫內容：現有「完成訓練」流程會問「要不要存成範本？」（`WorkoutLogger.tsx` 約 539 行）。若這筆 `activeWorkout.programSlotId` 有值，**且**該 slot 目前 `templateId` 是 undefined，存完範本後，順手把新範本的 id 寫回 `program.slots[該slotId].templateId`（`saveProgram`）。
  - 這樣使用者完全不用另外做「編輯計畫內容」的 UI：第一輪每個 slot 都用空白訓練練、練完存成範本，計畫就自動補滿了；之後每一輪都會自動帶上這份範本的重量/次數。
  - 若該 slot 已經有 `templateId`（例如使用者又重新存了一次範本，或這個 slot 本來就綁過），**不要覆蓋**——避免意外洗掉使用者原本綁定的範本。
- 取消訓練（`cancelWorkout`）**不推進** cursor（呼應「彈性推進」——沒完成就不算數）。

**自由訓練不受影響**：「開始新訓練」按鈕、既有「我的範本」清單，行為完全不變，也不會被打上 `programId`。使用者隨時可以在有 active 計畫的情況下，練跟計畫無關的訓練。

### 驗收標準
- 有 active 計畫、slot 沒綁範本 → 點「開始今天的訓練」→ 開一個標題帶 slot label 的空白訓練 → 練完問要不要存範本，選是 → 存檔後該 slot 自動綁定新範本，卡片上的下一個 slot 正確推進。
- 同一計畫繞回第一個 slot 時，「第 X 輪」正確 +1。
- slot 已綁範本 → 開始訓練直接帶入該範本的重量/次數（跟現有「以範本開始」行為一致）。
- slot 綁定的範本被使用者刪除後 → 開始今天的訓練仍正常（退回空白訓練，不出現「讀取中...」卡死或報錯）。
- 已有進行中訓練時點「開始今天的訓練」→ 被擋下並提示，行為與現有範本防呆一致。
- 取消訓練 → cursor 不變、`cycleCount` 不變。
- 不影響「開始新訓練」與既有「我的範本」清單的原有行為。

---

## 13D — 管理現有計畫 + 備份/同步收錄

### 目標
`estimatedWeeks` 與 slot 內容要能隨時調整；`programs` 要跟 `templates`/`bodyMetrics` 一樣收錄進備份與雲端同步，不然計畫資料換裝置會不見。

### 規格
- 13B 的表單本身就是編輯入口（有 active 計畫時「管理」按鈕開同一表單）——這裡只需確認 `estimatedWeeks` 跟每個 slot 的 `templateId`／`label`／順序都能在計畫進行中隨時修改並即時反映到 13C 的卡片。
- `src/lib/backup.ts`：匯出/匯入比照現有 `templates`／`bodyMetrics` 的寫法，加入 `programs`。
- `src/sync/sync.ts`：雲端同步比照現有 `templates`／`bodyMetrics` 的寫法，加入 `programs`（LWW，用 `updatedAt` 比對，`deletedAt` 軟刪除）。

### 驗收標準
- 修改 active 計畫的 `estimatedWeeks` 或某個 slot 的 label → 訓練頁卡片立即反映新值。
- 匯出備份 JSON 裡看得到 `programs`；清空 DB 後匯入同一份 JSON，計畫（含 `cursor`/`cycleCount`）完整還原。
- 有登入雲端同步的情況下，改一個計畫的 slot 順序，另一台裝置同步後看到相同順序（走現有 LWW 邏輯，不用另外設計衝突處理）。

---

## 全域檢查清單（完成前自查）
- **Tailwind v4**：改完搜 `-\d{2,3}` 確認沒打到非標準色階（合法只有 50/100/.../900/950）。
- **TS strict**：零 `any`；`ProgramSlot`/`TrainingProgram` 的 optional 欄位（`templateId?`、`completedAt?`、`deletedAt?`）要守好。
- **資料層隔離**：UI 不直接呼叫 Dexie，一律走 `src/db/programs.ts`。
- **單一 active 計畫**的約定在 `db/programs.ts` 與 `store/program.ts` 兩層都要守住，不要只靠 UI 擋。
- **不破壞既有**：自動儲存、休息計時器、範本（獨立於計畫存在）、單一進行中訓練防呆、雲端同步、備份匯出入。
- **獨立驗證**（review 時我會重跑）：`eslint .`、`tsc -b && vite build`、`vitest`。

## 建議實作順序
1. **13A**（資料層，其他三塊都靠它）。
2. **13B**（建立/編輯 UI，先能建立出一筆計畫）。
3. **13C**（核心串接，最複雜，尤其是 cursor 推進跟「另存範本自動回填」那段，建議寫完自己手動跑一輪 5 個 slot 全部繞回來測一次）。
4. **13D**（管理 + 備份/同步收尾）。

每塊做完先 build/lint/test + 給我 review，再進下一塊。全部過關後即 v1.7；`docs/ROADMAP.md` §2/§4 的同步更新等這階段全部做完、review 過了再一次補上（比照之前每個 phase 的慣例）。

## 之後可以再加（這階段不做，先別擴大範圍）
- 自動漸進負荷建議（根據上次 RPE/是否完成目標次數，算下次目標重量）。
- 減量週自動排程（例如每 4-6 輪自動插入一次降量）。
- 訓練提醒通知（PWA 排程通知「今天是計畫的訓練日」）。
- 計畫層級儀表板（每週各部位容量趨勢、依從度百分比）。
- History 日曆標註「這天屬於哪個計畫的第幾輪」。
