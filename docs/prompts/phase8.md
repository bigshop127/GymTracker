# Phase 8（v1.2）— 歷史強化：刪除 / 搜尋 / 自動命名 / 日曆部位圖

> 本檔是 Phase 8 的開發規格（spec）。實作前先讀 `docs/ROADMAP.md`（SSOT）與 §6 踩雷預告。
> 流程：**規格（本檔）→ 你寫 code → Claude review（獨立跑 build/lint/test）→ 過了才 commit**。

四個獨立小功能，建議**逐個做、逐個 review**（順序：#3 共用工具 → #1 → #2 → #3 → #4，因為 #3 與 #4 共用「主要部位」計算）。

---

## 共用基礎：`src/lib/workoutSummary.ts`（新檔，純函式，#3 與 #4 共用）

部位資訊在 `Exercise.muscleGroup`，但 `Workout` 只存 `exerciseId`，所以要先用動作庫建查表再聚合。

```ts
import type { Workout, Exercise, MuscleGroup } from '../db/schema';

/** 由動作清單建立 id → Exercise 查表 */
export function buildExerciseMap(exercises: Exercise[]): Map<string, Exercise> { /* ... */ }

/**
 * 計算這次訓練各部位的「組數」累計。
 * 規則：逐 entry 取其 exercise.muscleGroup，累加 entry.sets.length（含暖身，求穩定）。
 * 動作已被刪除（map 查不到）→ 略過不計。
 * 回傳 Map<MuscleGroup, number>。
 */
export function getMuscleGroupCounts(workout: Workout, exMap: Map<string, Exercise>): Map<MuscleGroup, number> { /* ... */ }

/**
 * 取主要部位，依組數由多到少；同數時用「首次出現順序」當 tie-break（穩定、可預期）。
 * topN 預設不限，呼叫端自行 slice。
 */
export function getPrimaryMuscleGroups(workout: Workout, exMap: Map<string, Exercise>, topN?: number): MuscleGroup[] { /* ... */ }

/**
 * 自動標題：`M/D 部位1+部位2`（取組數最多的前 2 個部位）。
 * 無可辨識部位（空訓練或動作都被刪）→ 回傳 `M/D 訓練`。
 * 日期一律用 workout.startedAt 的「本地時間」M/D（無補零，例：6/28）。
 */
export function buildAutoWorkoutTitle(workout: Workout, exMap: Map<string, Exercise>): string { /* ... */ }
```

> tie-break 的「首次出現順序」：依 `entries`（已按 `order`）第一次碰到該部位的索引。
> 注意 `getMuscleGroupCounts` 回傳 `Map` 的插入序即首見序，可直接利用。

驗收：對「胸 3 動作各 4 組 + 三頭 1 動作 3 組」的訓練，`buildAutoWorkoutTitle` 應得 `M/D 胸+三頭`；對「無 entries」得 `M/D 訓練`。

---

## #1 歷史紀錄「一鍵刪除」

**現況**：刪除已存在於明細底部面板（`History.tsx` 紅色「刪除此筆訓練紀錄」鈕，含二次確認 `handleDeleteWorkout`）。本項只**新增更快的入口**，不動既有邏輯。

**做什麼**：在兩處卡片各加一個小垃圾桶鈕，免進明細即可刪。
1. **清單檢視**：每張歷史卡片右上角（或容量數字旁）一個小 🗑 鈕。
2. **日曆檢視**：「當日訓練列表」每張小卡右側一個小 🗑 鈕。

**關鍵實作點**：
- 卡片本身有 `onClick={() => setSelectedWorkout(...)}`；垃圾桶鈕的 onClick **必須 `e.stopPropagation()`**，否則會同時觸發開啟明細。
- 重用既有 `handleDeleteWorkout(id)`（已含 `window.confirm` 二次確認 + `deleteWorkout` + `loadData`）。直接傳 `workout.id`。
- 樣式走既有 rose 色系（參考明細刪除鈕 `text-rose-600`），小尺寸 icon 鈕。

**驗收**：清單與日曆當日卡上點 🗑 → 跳確認 → 確認後該筆消失且**不會**開啟明細；取消則無事發生。明細頁原刪除鈕仍正常。

---

## #2 歷史紀錄關鍵字搜尋

**做什麼**：清單檢視頂端加一個搜尋框；輸入「胸」→ 列表即時過濾出含胸的訓練（最近的在上，本來就是 desc）。輸入「臥推」「建工」也要能中。

**比對規則**（trim、忽略大小寫，空字串=不過濾顯示全部）。某筆訓練命中的條件（任一即可）：
- `workout.title` 含關鍵字；或
- `workout.location` 含關鍵字；或
- 任一 entry 對應的 `exercise.name` 含關鍵字；或
- 任一 entry 對應的 `exercise.muscleGroup` 含關鍵字（← 這條讓「胸」能對到該次所有胸動作）。

**實作點**：
- 新增 state `searchKeyword`（受控 input）。
- 用 `useMemo` 由 `[historyStatsList, searchKeyword, allExercises]` 算出過濾後列表；先用 `buildExerciseMap(allExercises)` 做 id→exercise 查表（避免 O(n·m) 巢狀 find）。動作被刪 → 該 entry 名稱/部位視為無、不參與比對。
- 只套用在 `viewMode === 'list'`；日曆檢視不放搜尋框。
- 空結果顯示「找不到符合『關鍵字』的訓練」之類提示（沿用既有空狀態樣式）。

> 使用者例子說的是「最近三次胸的訓練」——這裡**不**硬性截斷 3 筆，直接過濾全部、最新在上即可（既有列表已 desc）。若想之後加「只看前 N 筆」可再議。

**驗收**：打「胸」→ 只剩含胸動作/標題/部位的訓練；清空→ 回到全部；打不存在字串→ 空狀態提示。

---

## #3 訓練儲存時自動命名（日期 + 部位）

**做什麼**：完成訓練時，若你**沒有自訂標題**，自動把標題填成 `M/D 部位1+部位2`（例 `6/28 胸+三頭`）。你有打過自己的名字就尊重你的、不覆蓋。

**判定「沒自訂」**：標題為空 `''` 或恰等於預設哨兵 `'今日訓練'`。
- 範本開始的訓練標題是範本名 / `xxx (範本)`（非 `'今日訓練'`）→ 視為已命名、**不覆蓋**。

**在哪改**：`src/store/activeWorkout.ts` 的 `finishWorkout()`（已是 async）。在組 `finished` 物件前：
```ts
let title = activeWorkout.title;
if (!title || title.trim() === '' || title.trim() === '今日訓練') {
  const exercises = await listExercises();           // 從 db/exercises import
  title = buildAutoWorkoutTitle(activeWorkout, buildExerciseMap(exercises));
}
const finished: Workout = { ...activeWorkout, title, status: 'completed', endedAt: Date.now() };
```
- `startNewWorkout` 維持用 `'今日訓練'` 當預設哨兵，**不要**改它（#3 靠這個哨兵判斷未自訂）。
- 不要在開始/輸入過程即時改標題（這次選的是「只在完成且未自訂時」命名）。

**驗收**：
- 不改標題、做胸+三頭 → 完成後歷史顯示 `6/28 胸+三頭`。
- 自己打了「推日」→ 完成後仍是「推日」。
- 用範本開始（標題=範本名）→ 完成後保留範本名。
- 空訓練直接完成 → `6/28 訓練`。

---

## #4 日曆：地點上色的部位圖（取代圓點）

**做什麼**：日曆格目前「當天有訓練就一顆靛色圓點」。改成顯示**當天主要部位的單色圖示**，並用**地點色**上色：中壢建工=藍、楊梅WG=紅、其他地點=灰、無地點=淺灰。例：當天在建工練胸 → 藍色胸圖。

### 素材（已備好，直接用）
- `src/data/muscle-icons.ts`（已建）：`getMuscleIcon(mg)` 回傳該部位的內層 SVG markup（`fill="currentColor"`，viewBox 0 0 24 24）。顏色由外層 `style={{ color }}` 決定。

### 顏色：`src/lib/locationStyle.ts`（新檔）
```ts
/** 地點 → 圖示顏色（hex）。用 inline style 設色，避免 Tailwind v4 動態 class 被 purge 掉。 */
export function getLocationColor(location?: string): string {
  switch (location) {
    case '中壢建工': return '#3b82f6'; // blue-500
    case '楊梅WG':   return '#f43f5e'; // rose-500
    default:        return location ? '#94a3b8' /* slate-400 其他地點 */ : '#cbd5e1' /* slate-300 無地點 */;
  }
}
```
> ⚠️ **必須用 inline style 上色，不要用拼出來的 Tailwind class**（如 `` `text-${x}-500` ``）。Tailwind v4 會在 build 時 purge 看不到的動態 class，色會默默失效（見 ROADMAP §6 同類坑）。

### 一天可能多筆訓練 → 取「主場」代表這天
新增（可放 `workoutSummary.ts`）：
```ts
/** 這天的代表：主場 = 總組數最多的那筆（同分取較晚 startedAt）。回傳其 location 與主要部位（top1）。 */
export function getDaySummary(dayWorkouts: Workout[], exMap: Map<string, Exercise>):
  { location?: string; primaryMuscle?: MuscleGroup } { /* ... */ }
```
- 同一格只畫 **1 個圖示**（主場的 top1 部位、主場的地點色），保持乾淨。多筆訓練的細節仍在點下去的當日列表看。

### 日曆格渲染（`History.tsx`）
把目前這段（約 line 402–404）：
```tsx
{hasWorkouts && !isSelected && (
  <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-indigo-500" />
)}
```
改為：當天有訓練且**算得出主要部位** → 顯示部位圖（地點色）；算不出部位（理論上少見）→ 退回小圓點（也上地點色）。例：
```tsx
{hasWorkouts && !isSelected && (() => {
  const summary = getDaySummary(workoutsByDate[cell.dateStr], exMap);
  const color = getLocationColor(summary.location);
  const markup = summary.primaryMuscle ? getMuscleIcon(summary.primaryMuscle) : null;
  return markup
    ? <svg viewBox="0 0 24 24" fill="currentColor" style={{ color }}
        className="absolute bottom-1 w-3.5 h-3.5" dangerouslySetInnerHTML={{ __html: markup }} />
    : <span className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />;
})()}
```
- `exMap` 用 `useMemo(() => buildExerciseMap(allExercises), [allExercises])` 算一次。
- `isSelected` 那格（靛底白字）維持不顯圖示，避免撞色；或改成白色圖示亦可，依視覺取捨。
- 圖示尺寸別太大（`w-3.5 h-3.5` 左右），避免蓋到日期數字；放格子底部置中。

### 可選：圖例（legend）
日曆下方加一行小圖例說明顏色：🔵 建工 / 🔴 楊梅WG。非必須，視覺加分用。

**驗收**：
- 建工練胸的日子 → 藍色胸圖；楊梅WG練背 → 紅色背圖（倒三角）。
- 同日兩筆不同地點 → 顯示組數較多那筆的部位與顏色。
- 無地點的訓練 → 淺灰圖示。
- 動作全被刪而算不出部位 → 退回小圓點（仍上地點色），不報錯。
- 圖示不蓋住日期數字；selected 格仍清楚。

---

## 全域注意（review 會逐項對照）
1. **Tailwind v4 靜默吞色階**：別用非標準色階（`-850/-650/-250`…），動態顏色一律 inline style。改完搜 `-\d{2,3}` 自查。
2. **資料層隔離**：UI 不直接碰 Dexie；刪除走既有 `deleteWorkout`（`src/db/workouts.ts`）。
3. **TS strict 零 any**：`MuscleGroup`、`Exercise` 由 `db/schema` import；Map 查不到要處理 undefined。
4. **效能**：搜尋/日曆聚合都用 `useMemo` + 預先 `buildExerciseMap`，別在 render 內巢狀 `find`。
5. **不破壞既有**：明細刪除鈕、範本、休息計時、自動儲存照常；`startNewWorkout` 的 `'今日訓練'` 哨兵不可改字串。
6. 完成後同步更新 `docs/ROADMAP.md` 階段索引（加 Phase 8 / v1.2 列）、Obsidian `健身APP開發/`、Claude 記憶。

## 不需要改資料模型
本階段**不動 Dexie schema**（不需 `version(3)`）：標題沿用 `Workout.title`、部位由動作庫即時推導、顏色由地點字串即時對應。
