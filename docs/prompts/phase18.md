# Phase 18（v1.12）孤兒動作參照三層修復

> 觸發：2026-08-01 使用者回報「開始今天的訓練」後，`拉 (Pull)` 這天 5 個動作有 4 個顯示「讀取中...」，只有「機械水平划船」正常。
> 本階段由 Claude 直接實作（使用者明說「直接幫我修改處理好」），非一般的「規格→使用者實作」流程。

## 1. 病灶

`WorkoutLogger.tsx` 三處都是 `{ex ? ex.name : '讀取中...'}`：`ex` 是拿 `entry.exerciseId` 去 `listExercises()` 結果裡 find，**找不到就永遠是「讀取中...」**。沒有 timeout、沒有 fallback ——顯示的是假的載入中，實際是「查無此動作」。

為什麼只有自訂動作正常：

| 動作 | 類型 | id 來源 | 跨裝置 |
|---|---|---|---|
| 機械水平划船 / 肩膀後三角 | 自訂（匯入課表時建立） | `crypto.randomUUID()` | **會同步**，全裝置一致 → 查得到 |
| 槓鈴划船 / 滑輪下拉（寬握） | 內建 | v9 前是每台裝置各自的 randomUUID | **不同步**，別台查不到 → 孤兒 |

匯入宗諺課表（commit `c9994a7`）早於「內建動作改確定性 id」（commit `e319450`），所以範本裡寫進去的是**匯入當下那台裝置的隨機 id**。

## 2. 為什麼既有修復機制沒救到

`repairExerciseIds()` 只吃 `db.idAliases`，而那張表**只有跑過 Dexie `upgrade()` 的裝置生得出來**（`version(9)`/`version(10)`，且要求本機當時還存著那筆舊動作列）。於是兩個破口：

1. **全新安裝／清過網站資料／換瀏覽器／換手機**的裝置直接建新版庫，Dexie 不跑 upgrade → 一筆 alias 都沒有，卻照樣從雲端拉到指向舊 id 的範本。
2. 當年那台裝置若已經清掉資料，它那套 alias 就**永遠失傳**——而 `WorkoutEntry` 只存 id 不存名稱，沒有任何資訊可以反推 → 該筆參照永久孤兒。

## 3. 修法（三層，由弱到強疊加）

`src/db/repairExerciseIds.ts` 重寫成三層對照疊加：

1. **程式碼內建的改名表**：`SEED_RENAMES` / `STATIC_SEED_ID_ALIASES`（`src/data/seed-exercises.ts`）。`version(10)` migration 改成讀同一份名單，不再自己寫死一次。不依賴 upgrade 跑過 → 破口 1 消失。
2. **`db.idAliases`**：原有機制不動（會參與雲端同步，修別台裝置留下的舊隨機 id）。
3. **宗諺課表順序反推**：`src/lib/zongYuanIdRescue.ts` 的 `discoverZongYuanAliases()`。用「範本名 = 課表某天的 label」＋「entry 順序」對照 `ZONGYUAN_8WEEK_PLAN` 的權威名單，把名稱已失傳的孤兒 id 綁回正確動作。救到的對照**寫回 `idAliases`**，於是另一台裝置同步後也一起修好。

第 3 層的防呆（任一項不成立就整個範本跳過，寧可讓使用者手動指定，也不要綁錯動作）：

- 範本名稱要對得上課表某一天的 label
- entry 筆數要與該天動作數一致（使用者自己增刪過就不碰）
- 所有「查得到的」entry，名稱必須與課表同一格一致（順序被調動過就不碰）
- 目標動作本身要在動作庫裡且沒被軟刪除；同名多筆時以內建動作優先

## 4. UI fallback（治標但必要）

上面三層都救不回來的（非宗諺範本、使用者自己改過結構的），至少不要卡住整場訓練：

- 三處「讀取中...」→「⚠ 未知動作」（amber 配色）
- 動作面板標頭多一顆「此動作已不在動作庫 · 點我重新指定」→ 開動作選擇器 → `replaceEntryExercise(entryId, newId)`：直接換掉當前動作，候選清單裡的舊 id 一併換掉，換完只剩一個候選就收回單一動作。組數/重量原封不動。

## 5. 動到的檔案

```
src/data/seed-exercises.ts      + SEED_RENAMES / STATIC_SEED_ID_ALIASES
src/db/schema.ts                version(10) 改用 SEED_RENAMES（行為不變）
src/lib/exerciseIdMap.ts        抽出 resolveAliasId() 共用
src/lib/zongYuanIdRescue.ts     ★新增：順序反推救援（純函式）
src/db/repairExerciseIds.ts     三層對照疊加 + 把救到的對照寫回 idAliases
src/lib/workoutEntries.ts       + replaceEntryExercise()（純函式）
src/store/activeWorkout.ts      + replaceEntryExercise action
src/pages/WorkoutLogger.tsx     未知動作 fallback + 重新指定流程
```

測試：`src/lib/__tests__/zongYuanIdRescue.test.ts`（10 例，含所有防呆）、`src/db/__tests__/repairExerciseIds.test.ts`（fake-indexeddb 端到端）、`workoutEntries.test.ts` 加 4 例。

## 6. 驗收

- `npx eslint .` / `npm run build`（`tsc -b && vite build`）/ `npx vitest run` 全綠（91 tests）
- 手機與電腦各開一次 App（要 reload 讓 service worker 換新版），`拉/推/腿/手` 四個範本與進行中訓練的動作名稱全部顯示正常
- 若仍有「⚠ 未知動作」：點該按鈕重新指定一次即可，指定後會跟著同步到另一台
