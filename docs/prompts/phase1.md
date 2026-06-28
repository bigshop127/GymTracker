# Phase 1 — 資料層 + 自動儲存（最關鍵，先做穩）

> 前置：先讀 `docs/ROADMAP.md` §2 資料模型（這是地基，照著 interface 寫）。

## 目標
建立 IndexedDB 資料層與 repository，做到 seed 內建資料、即時自動儲存、以及「進行中訓練可恢復」。

## 規格
1. 在 `src/db/schema.ts` 用 Dexie 建立資料庫，tables：
   - `exercises`、`workouts`、`bodyMetrics`、`settings`
   - 依 §2 的 interface 定型別；為常用查詢建索引（如 `exercises.muscleGroup`、`workouts.startedAt`、`workouts.status`）。
   - 寫好初始 version/schema，預留 migration 寫法。
2. 各 table 寫 repository（`src/db/exercises.ts` 等），對外只暴露純函式 CRUD：
   - 例：`listExercises()`, `addExercise()`, `updateExercise()`, `deleteExercise()`
   - `workouts.ts` 另含：`getActiveWorkout()`, `saveActiveWorkout()`, `completeWorkout()`, `listCompletedWorkouts()`。
   - **規則：只有 `src/db/` 能 import Dexie**；UI/store 一律透過 repository。
3. 首次啟動初始化：
   - 若 `exercises` 為空 → seed 內建動作庫（清單在 Phase 2 提供，這裡先預留 `seedExercisesIfEmpty()` 介面，可先塞 3–5 筆測試）。
   - 若 `settings` 不存在 → 寫入預設值（`unit:'kg'`, `defaultRestSeconds:90`, `e1rmFormula:'epley'`, `theme:'system'`, `soundOnRestEnd:true`, `vibrateOnRestEnd:true`）。
4. 建立 `src/store/activeWorkout.ts`（Zustand）：
   - 持有目前進行中的 `Workout`。
   - **任何修改（加動作、加組、改重量次數、打勾）都即時呼叫 `saveActiveWorkout()` 寫回 IndexedDB**（可 debounce 200–300ms，但不可只存記憶體）。
   - App 啟動時呼叫 `getActiveWorkout()`，若有 `status:'active'` 的 workout 就載回 store（草稿恢復）。
5. 建 `src/lib/e1rm.ts`、`src/lib/volume.ts`、`src/lib/units.ts`，依 §2 衍生運算定義實作 + 單元測試（至少各 1–2 個案例）。

## 驗收標準
- 在 browser console（或暫時的測試按鈕）能呼叫 repository 增/刪/查，重開分頁資料還在。
- 用 store 開一個進行中訓練、加幾組、**關掉分頁重開 → 草稿仍在、能接續**。
- `e1rm(100, 5)`（Epley）≈ 116.7；`volume` 不計暖身組；kg↔lb 換算正確。

## 注意
- weight 一律以 kg 存（§6.3）。
- 即時寫入務必涵蓋「打勾完成一組」這條路徑（之後休息計時靠它觸發）。
