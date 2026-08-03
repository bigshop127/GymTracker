# Phase 19（v1.13）有氧快捷鈕 ＋ 開訓前「沿用最近三次」選單

> 觸發：2026-08-03 使用者需求兩項——
> ① 計畫卡片（宗諺 8週4天分化訓練計畫）下面加一顆簡易「有氧」鈕，按下可挑之前存過的有氧範本開訓。
> ② 每次開始一個新的訓練（例如「推 (Push)」），點下去改成先跳出**最近三次**的訓練紀錄讓我選要導入哪一次。
>
> 本文＝規格。**實作由 Claude 直接完成**（使用者看完規格後說「直接處理好」＝工作協議例外 (a)，非常態）。

---

## 0. 範圍與前提

- 只動**首頁訓練頁**（`src/pages/WorkoutLogger.tsx`、狀態 A：無進行中訓練）與 store／純函式。
- **無 Dexie 版本變更、無 Firestore 規則變更、無 schema 欄位新增**——兩項功能都只是「換一種方式建立 `Workout`」，資料形狀完全沿用既有的。
- 不動 `History.tsx` 的「重複這次訓練」（`startWorkoutFromTemplate(workout: Workout)`）。它的既定語意是**重量/次數歸零重做**（`activeWorkout.ts:434` 明確寫 `weight: 0, reps: 0`），與本階段「沿用重量」語意相反，兩者共存不合併。

---

## 功能 A：計畫卡片下的「有氧」按鈕

### A1. 位置與外觀

放在**計畫卡片內部**、「今日該練」那塊 (`WorkoutLogger.tsx` 約 456–490 行的 `bg-indigo-50/50` 區塊) 的**正下方**，卡片最後一列。單獨一顆滿版次要鈕，不要跟「開始今天訓練」搶主行動：

```
┌─ 宗諺 8週4天分化訓練計畫 ──────── [管理] ┐
│ 拉(Pull) 推(Push) 腿(Leg) 手(Arms)      │
│ 最近 7 天輪動  …                        │
│ ┌ 今天該練：推 (Push)   [開始今天訓練] ┐ │
│ └──────────────────────────────────────┘ │
│ [ 🏃 有氧 ]        ← 新增這顆            │
└──────────────────────────────────────────┘
```

- 樣式比照現有次要鈕（例：`＋ 建立訓練計畫` 那顆的 slate 系）：`w-full py-2.5 rounded-xl text-xs font-bold`，slate 底 + 邊框，深色模式對應色一併寫齊。
- **只在有 `activeProgram` 時顯示**（它是計畫卡片的一部分）。沒有計畫時不需要這顆。

### A2. 點下去的行為

開一個**全螢幕 sheet**「選擇有氧範本」，版型直接抄現有的動作選擇器 sheet（`WorkoutLogger.tsx` 1089–1119 行）：`fixed inset-0 z-50 flex flex-col` ＋ 標題列 ＋ ✕ 關閉 ＋ 可捲動內容區。

內容 = **有氧範本清單**，每筆一張列卡（外觀比照「我的範本」那區的卡片），顯示：

- 範本名稱
- `📍 地點`（`t.location` 有才顯示，沿用既有 badge 樣式）
- 摘要副標：`{動作數} 個動作 • 共 {總分鐘} 分鐘`
  - 總分鐘 = 所有 entry 所有 set 的 `durationSeconds` 加總 ÷ 60，四捨五入到整數；全為 0 時副標退回既有寫法 `{n} 個動作 • {m} 組`。

點任一筆 → `startWorkoutFromTemplateEntity(t)`（**沿用現成 action，不要新寫**，它已保留 `durationSeconds/distanceKm/calories`）→ 關 sheet。錯誤處理直接複用 `handleStartFromTemplate` 的 try/catch（`ACTIVE_WORKOUT_EXISTS` → alert「你目前有一個進行中的訓練…」）。

**這條路徑不帶 `programId`/`programSlotId`**——有氧不是計畫的一天，完成後不該推進 cursor（`finishWorkout` 只在有 `programId` 時 `advanceCursor()`，所以照做即可自然滿足）。

### A3. 「有氧範本」怎麼判定 —— 新增純函式

新檔 `src/lib/cardioTemplates.ts`：

```ts
import type { WorkoutTemplate, Exercise } from '../db/schema';

/**
 * 有氧範本 = 至少有一個動作，且**所有** entry 對應的動作都是 muscleGroup === '有氧'。
 * 查不到對應動作（孤兒 id）一律視為「非有氧」，寧可漏抓不要錯抓。
 */
export function isCardioTemplate(template: WorkoutTemplate, exMap: Map<string, Exercise>): boolean;

/** 過濾出有氧範本，維持傳入順序（listTemplates 已是 createdAt 由新到舊） */
export function filterCardioTemplates(templates: WorkoutTemplate[], exMap: Map<string, Exercise>): WorkoutTemplate[];
```

- `exMap` 用既有的 `buildExerciseMap(allExercises)`（`src/lib/workoutSummary.ts`）建，**不要在元件裡重寫 find 迴圈**。
- 元件端用 `useMemo` 推導 `cardioTemplates`，依賴 `[templates, allExercises]`，不要用 effect + state。

⚠️ 注意 `allExercises` 目前的載入時機是 `useEffect(..., [activeWorkout?.entries.length])`（`WorkoutLogger.tsx:221`）。沒有進行中訓練時該值是 `undefined`，effect 在掛載時跑過一次，**狀態 A 拿得到動作庫**，這點不需要改；但實作時要確認 `allExercises` 還空著時 sheet 不會顯示成「一個範本都沒有」而誤導——空清單的空狀態文案照 A4 寫。

### A4. 邊界

| 情境 | 行為 |
|---|---|
| 一個有氧範本都沒有 | sheet 照開，內容顯示空狀態：「還沒有有氧範本。做一次有氧訓練，完成時另存為範本，之後就能從這裡一鍵開始。」 |
| 已有進行中訓練 | 這顆鈕只在狀態 A 出現，理論上碰不到；仍要保留 `ACTIVE_WORKOUT_EXISTS` 的 alert 防呆 |
| 範本裡混了重訓動作 | 不算有氧範本，不出現在清單（要練混合的走「我的範本」） |

---

## 功能 B：開始今天訓練 → 先選「沿用哪一次」

### B1. 觸發點

**只改「開始今天訓練」這顆**（`WorkoutLogger.tsx:465–489`，program slot 入口）。

不動的：頂部「開始新訓練」（空白訓練，本來就沒有分類可比對）、「我的範本」清單（點下去＝明確指定範本，再跳一層是多餘的）。

### B2. 新的流程

點「開始今天訓練」→ 先算出候選清單：

- **候選為空** → **維持現行行為，直接開訓**（`startWorkoutFromProgramSlot(...)`），不要跳一個只有一個選項的空 sheet。
- **候選非空** → 開 sheet「要沿用哪一次？」：

```
要沿用哪一次？                          ✕
今天該練：推 (Push)
──────────────────────────────────────
 8/01 (2天前)  推 (Push)          @中壢建工
 5 個動作 • 21 組 • 槓鈴臥推、上斜啞鈴推…
──────────────────────────────────────
 7/25 (9天前)  推 (Push)          @楊梅WG
 5 個動作 • 20 組 • …
──────────────────────────────────────
 7/18 (16天前) 推 (Push)
 5 個動作 • 18 組 • …
──────────────────────────────────────
 [ 用計畫範本開始（不沿用重量） ]
```

- 每列點擊 → 以那次紀錄開訓（見 B4）。
- 底部固定一顆次要鈕：slot 有 `templateId` 時文案「**用計畫範本開始（不沿用重量）**」；沒有 templateId 時「**以空白訓練開始**」。兩者都是呼叫現行的 `startWorkoutFromProgramSlot(...)`，行為與今天完全一致。
- ✕ 關閉 = 什麼都不做（不開訓）。

列卡顯示欄位：
- 日期 `M/D` ＋ `(N天前)`：N 用 `splitRotation.ts` 既有的「日曆天」演算法語意（跨午夜要準）。若 `N === 0` 顯示「今天」、`N === 1` 顯示「昨天」。
- 標題 `w.title`
- 地點 `@{w.location}`（有才顯示）
- 摘要：`{動作數} 個動作 • {總組數} 組 • {前 3 個動作名稱以「、」串接}{超過 3 個補「…」}`；動作名稱查不到就跳過該筆不顯示（不要印「⚠ 未知動作」塞滿摘要）。

### B3. 「最近三次」怎麼挑 —— 新增純函式

新檔 `src/lib/recentSessions.ts`：

```ts
import type { Workout } from '../db/schema';

/**
 * 取這個 slot 最近幾次的完成訓練（新→舊）。
 * 兩層來源，依序取用、去重（同一筆 workout.id 不重複）：
 *   1. 精準比對：w.programId === programId && w.programSlotId === slotId
 *   2. 補位：normalizeSplit(w.title) === normalizeSplit(slotLabel)（slotLabel 判不出分類時這層跳過）
 * 過濾：只收 status === 'completed' 且 !deletedAt；startedAt 由新到舊。
 */
export function getRecentWorkoutsForSlot(
  workouts: Workout[],
  programId: string,
  slotId: string,
  slotLabel: string,
  limit = 3,
): Workout[];
```

- `normalizeSplit` 直接 import `src/lib/splitRotation.ts` 現成的，**不要另寫一套分類規則**（宗諺 4 個 label 是 `拉 (Pull)`／`推 (Push)`／`腿 (Leg)`／`手 (Arms)`，現有規則四個都判得出來）。
- 第 1 層先照 `startedAt` 排序取滿；不足 `limit` 才用第 2 層補到 `limit`。第 2 層要排除第 1 層已收的 id。
- 資料來源用元件裡現成的 `completedWorkouts` state（`WorkoutLogger.tsx:77–91` 已載入，`listCompletedWorkouts()` 本身就已 `reverse().sortBy('startedAt')` ＋濾墓碑）。**不要再去 DB 拉一次**。
- 元件端 `useMemo` 推導，依賴 `[completedWorkouts, activeProgram]`。

### B4. 「導入」的語意 —— 新增 store action

`src/store/activeWorkout.ts` 加：

```ts
startWorkoutFromPastWorkout: (
  source: Workout,
  ctx?: { programId: string; slotId: string; slotLabel: string; cycleNumber: number },
) => Promise<void>;
```

實作照 `startWorkoutFromProgramSlot` 的 template 分支（`activeWorkout.ts:546–577`）改寫，逐項對照：

| 欄位 | 值 |
|---|---|
| `id` | 新 `crypto.randomUUID()` |
| `title` | 有 ctx → `ctx.slotLabel`；無 ctx → `source.title`。**不要疊「(範本)」字樣** |
| `startedAt` | `Date.now()` |
| `status` | `'active'` |
| `location` | `source.location` |
| `programId`/`programSlotId`/`programCycleNumber` | 有 ctx 就帶 `ctx` 的值；**沒有 ctx 就整個鍵省略**（不要塞 `undefined`，見 ROADMAP §6-5 Firestore 不收 undefined） |
| `entries[].id` | 新 uuid |
| `entries[].exerciseId` / `order` / `defaultRestSeconds` | 原樣複製 |
| `entries[].candidateExerciseIds` | 長度 > 1 才帶（照現有三處寫法） |
| `sets[].weight` / `reps` / `isWarmup` | **原樣沿用**（這就是「導入」的重點） |
| `sets[].durationSeconds` / `distanceKm` / `calories` / `assistWeight` | 有才帶（`!== undefined &&` 的既有寫法） |
| `sets[].rpe` | **不帶**。上次的主觀感受不該預填成這次的預設 |
| `sets[].completed` | 一律 `false` |
| `sets[].id` / `createdAt` | 新 uuid／`Date.now()` |

前置防呆完全比照既有 action：`if (get().activeWorkout) throw new Error('ACTIVE_WORKOUT_EXISTS')`、`cancelPendingSave()`、`useRestTimerStore.getState().skipTimer()`、最後 `await saveWorkoutImmediate(newWorkout)` ＋ `set({ activeWorkout: newWorkout })`。

> 帶著 `programId`/`programSlotId` 是必要的：`finishWorkout()` 靠它推進 cursor，`getSplitRotationStatus()` 靠它算 7 天輪動。漏帶會讓「沿用最近一次」開出來的訓練不算進計畫進度——這是本階段最容易踩的回歸，review 會重點看。

---

## 3. 驗收標準

功能 A：
1. 首頁計畫卡片最下方出現「🏃 有氧」鈕；沒有 active program 時不出現。
2. 按下去跳 sheet，只列出「所有動作都是有氧」的範本；混合範本、純重訓範本不出現。
3. 點一筆 → 直接開訓，時長/距離欄位帶著上次的值，所有 `completed` 為 false。
4. 完成這場有氧訓練後，計畫 cursor **沒有**被推進（今天該練還是原本那天）。
5. 沒有任何有氧範本時顯示空狀態文案，不是空白畫面。

功能 B：
6. 點「開始今天訓練」，若該 slot 有過往紀錄 → 跳「要沿用哪一次？」sheet，最多 3 筆，新到舊。
7. 點其中一筆 → 開訓，動作與組數與那次相同、**重量/次數沿用**、`completed` 全 false、`rpe` 全空。
8. 開出來的訓練有帶計畫資訊：完成後 cursor 前進一格、「最近 7 天輪動」該分類變 ✓。
9. 底部「用計畫範本開始」→ 行為與改版前一模一樣。
10. 該 slot 沒有任何過往紀錄 → 不跳 sheet，直接開訓（跟現在一樣）。
11. ✕ 關閉 → 沒有任何訓練被建立（重新整理後也不會冒出草稿）。

共通：
12. `eslint .` 0 error／`npm run build`（`tsc -b`，比本機 `tsc --noEmit` 嚴格）通過／`vitest` 全綠。
13. 新增測試：`src/lib/__tests__/cardioTemplates.test.ts`、`src/lib/__tests__/recentSessions.test.ts`。至少涵蓋：混合範本不算有氧、孤兒 id 不算有氧、空範本不算有氧；精準比對優先於 title 補位、去重、不足 3 筆、只收 completed、濾掉 `deletedAt`。
14. 搜 `-\d{2,3}` 確認沒有 Tailwind v4 無效色階（如 `slate-850`）。
15. 深色模式：兩個新 sheet 與新按鈕都要有 `dark:` 對應色。

---

## 4. 預期動到的檔案

```
src/lib/cardioTemplates.ts            ★新增：有氧範本判定（純函式）
src/lib/recentSessions.ts             ★新增：取 slot 最近 N 次紀錄（純函式）
src/lib/__tests__/cardioTemplates.test.ts   ★新增
src/lib/__tests__/recentSessions.test.ts    ★新增
src/store/activeWorkout.ts            + startWorkoutFromPastWorkout action（介面 + 實作）
src/pages/WorkoutLogger.tsx           + 有氧鈕與 sheet、+ 沿用選單 sheet、改「開始今天訓練」的 onClick
docs/ROADMAP.md                       表格補一列 Phase 19（v1.13）
```

---

## 5. 實作順序建議

1. 兩個純函式 + 測試（先綠再接 UI，UI 就只剩排版問題）。
2. `startWorkoutFromPastWorkout` action。
3. WorkoutLogger 的兩個 sheet（版型抄動作選擇器那段，state 就兩個 boolean：`isCardioSheetOpen`、`isRecentSheetOpen`）。
4. `npm run build` + `vitest` + `eslint .` 全過 → 交給 Claude review。

## 功能 C（追加）：「開始新訓練」改成先選部位

> 2026-08-03 使用者看到成品後追加：頂部「開始新訓練」也要能挑——先跳部位（胸／背／腿…），點進去才出現最近三次紀錄。
> 原本第 6 節寫「刻意不做」，此處推翻。

兩步全螢幕 sheet，共用同一個容器（`isNewWorkoutSheetOpen` ＋ `selectedGroup`）：

1. **今天要練哪裡？** 2 欄網格列出 7 個部位（順序沿用 `MUSCLE_ORDER`：胸／背／腿臀／肩／手臂／核心／有氧），每格副標顯示「N 天前練過／今天練過／未練過」。
2. 點下部位 →
   - 有過往紀錄 → 換成 **要沿用哪一次？**（同一張紀錄卡，共用 `renderRecentWorkoutCard`），底部「以空白訓練開始（胸）」，左上角 ‹ 可回上一步。
   - 沒有紀錄 → **直接開一場空白訓練**，不停在空選單。

差異點（與功能 B 對照）：

| | 功能 B（開始今天訓練） | 功能 C（開始新訓練） |
|---|---|---|
| 比對依據 | `programSlotId` → 標題分類補位 | **實際做過的動作**：主要部位（組數最多）→「有練到就算」補位 |
| 開訓帶 ctx | 帶 programId/slotId/cycleNumber | **不帶**（不屬於任何計畫，不推進 cursor） |
| 空白起手 | `startWorkoutFromProgramSlot` | `startNewWorkout(部位)`——標題直接帶部位，讓自動命名與週輪動分類有依據 |

比對刻意不看標題只看動作：標題可能是「今日訓練」或被改過，`getPrimaryMuscleGroups()` 讀的是真的做了什麼。

新增純函式（`src/lib/recentSessions.ts`）：`getRecentWorkoutsForMuscleGroup()`、`getLastTrainedByMuscleGroup()`；`MUSCLE_ORDER` 改由 `src/lib/exerciseOrder.ts` 匯出共用。

## 6. 這版刻意不做（想做再開下一階段）

- 「我的範本」不套沿用選單（點範本＝明確指定，再問一次是多餘的）。
- 沿用選單不做「只帶動作不帶重量」的第二種模式（要空重量就走底部的「用計畫範本開始」）。
- 有氧鈕不做「直接新增一個有氧動作到目前訓練」——它只走範本，維持「簡易」。
