# Phase 27 班表「原定計畫 vs 實際計畫」並排顯示

> 觸發：2026-08-18 使用者提出兩個需求，其中一個跟 GitHub Pages 網址有關（純確認，不需要開發：`https://bigshop127.github.io/GymTracker/` 本來就是穩定網址，push 到 master 就自動部署，`.github/workflows/deploy.yml` 已經是完整的 CI 流程，使用者確認直接沿用即可，本文不處理這件事）。另一個需求附了截圖（`/schedule` 月曆），訴求是：8/20 系統原本安排「拉 (Pull)」，如果使用者實際把當天改成「休息」，希望畫面能同時看到「原定」跟「實際」兩種狀態，而且後面幾天的建議要跟著重新算。
>
> 討論後透過三個問題跟使用者對齊：
> 1. 「原定計畫」定義——選了「**即時假設值**」：不是排程凍結快照，而是「如果忽略當天的訓練覆寫欄位，系統本來會建議什麼」，跟「實際」（套用覆寫後的目前建議）並排顯示，兩者都是動態算出來的。
> 2. 「後續重新生成」——選了「**全自動即時重算**」，也就是確認新欄位要跟現有架構相容，不用另外做一個「重新生成」按鈕。
> 3. 專用網址——「用現有的就好」。
>
> 查過 `src/lib/shiftPlan.ts` 的 `generateMonthPlan()` 後發現一個好消息：這個函式本來就是**每次重新整月從頭算一次的純函式**（`SchedulePage.tsx:155-169` 每次 `overridesByDate` 變動就整月重算），內部狀態（`pool`／`consecutiveTrainDays`／`trainedThisWeek`／`daysSinceWeights`／`effectiveWeeklyTarget`）全部是函式內的區域變數，兩次呼叫互不干擾。這代表「原定 vs 實際」跟「後續自動重新生成」這兩個訴求，可以用同一招做到，而且**不用改 `DayOverride` schema、不用 Dexie migration、不用碰 Firestore 規則**：
>
> - **實際**＝現有的 `generateMonthPlan(overridesByDate)`，原封不動。
> - **原定**＝拿同一份 `overridesByDate`，把每天覆寫裡「會改變練/不練決策」的四個欄位（`paused`／`forcedRest`／`pinnedSlotId`／`pinnedOutcome`）清空後，重新呼叫**同一個** `generateMonthPlan()`。`shiftLetters`／`isDayOff` 不清空——那是「當天實際上/下班」的客觀事實，不是使用者對訓練建議的主觀覆寫，原定計畫仍然要照班別規則走。
> - 因為兩次呼叫的 `pool`／週目標等狀態各自獨立累計，「原定」這條線會自己按照自己的邏輯把沒被消耗的訓練部位往後遞延——這就是「後續計畫重新生成」，不用額外寫級聯更新的程式碼，是兩次純函式呼叫的自然結果。
> - 過去的日期（`isPast`）在 `generateMonthPlan()` 裡一律短路回傳 `suggestion: 'past'`（`shiftPlan.ts:308-309`），跟覆寫內容無關——所以「原定」跟「實際」對過去日期永遠算出同一個 `'past'`，畫面上不會出現過去日期的落差標記。這是刻意不處理的範圍：過去的 `pool`/`consecutiveTrainDays` 狀態並沒有被歷史保存，硬要回推「當初原本會建議什麼」只會是不準確的猜測，不如就不比。這點如果你希望之後也支援回顧過去日期的落差，需要另外設計（例如在 `DayOverride` 完成訓練當下另存一份 snapshot），不在本次範圍內。
>
> 本文＝規格，建立在 Phase 21/23/25/26（`shiftPlan.ts`／`dayOverrides`／`SchedulePage.tsx`）之上。依工作協議（[[gymtracker-working-agreement]]）由你自己動手寫 code。

---

## 0. 核心設計決策

### 0-1. 「決策覆寫欄位」vs「客觀事實欄位」
`DayOverride`（`src/db/schema.ts:84-95`）目前 7 個功能欄位可以分成兩類：

| 分類 | 欄位 | 原定計畫要不要清空 |
|---|---|---|
| 客觀事實（當天上什麼班） | `shiftLetters`、`isDayOff`、`rawLabel` | 不清空——這是輸入條件，不是使用者對訓練建議的覆寫 |
| 決策覆寫（使用者主動蓋掉訓練建議） | `paused`、`forcedRest`、`pinnedSlotId`、`pinnedOutcome` | 清空——這四個正是「原本應該練，但我決定不練/練別的」的入口 |

依據：`generateMonthPlan()` 裡 `paused`/`forcedRest` 直接短路成對應的 `suggestion`（`shiftPlan.ts:310-321`），`pinnedSlotId`/`pinnedOutcome` 則是在正常決策路徑裡插隊蓋過演算法本來的判斷（`shiftPlan.ts:327-350`）——這四個都是「使用者說了算」的欄位；`shiftLetters`/`isDayOff` 則只是餵給 `classifyShiftCode()` 的原始輸入，不含使用者對訓練與否的主觀意見。

### 0-2. 不改資料模型，只加一層「用同一個純函式算兩次＋合併」
不新增 Dexie 欄位、不動 `DayOverride`、不動 `TrainingProgram`。新增的都是**衍生、不落地儲存**的欄位，掛在 `PlannedDay` 之上的新型別 `PlannedDayWithBaseline`。

### 0-3. 範圍限制（刻意不做的事）
- 過去日期不比較原定/實際（見上方觸發段落說明）。
- 首頁 `WorkoutLogger.tsx` 的「今日建議」卡片本次不加原定/實際對照，只做 `/schedule` 月曆＋編輯日期面板。如果之後想要首頁也顯示，可以直接複用本文新增的 `describeSuggestionLabel()`／`mergeBaselinePlan()`，是低成本擴充。
- 不處理「原定計畫」本身被使用者手動編輯的情境——原定永遠是「假設沒有決策覆寫」的即時計算結果，使用者不能直接改它，只能改「實際」（也就是現有的班表編輯面板）。

---

## 1. 演算法變更（`src/lib/shiftPlan.ts`）

### 1-1. 新增：清空決策覆寫欄位的純函式
```ts
const DECISION_OVERRIDE_KEYS = ['paused', 'forcedRest', 'pinnedSlotId', 'pinnedOutcome'] as const;

// 「原定計畫」用：忽略使用者對訓練建議的主觀覆寫，只保留客觀的班別/休假事實
export function stripDecisionOverride(override: DayOverride): DayOverride {
  const next = { ...override };
  for (const key of DECISION_OVERRIDE_KEYS) {
    delete next[key];
  }
  return next;
}

export function buildBaselineOverridesByDate(
  overridesByDate: Map<string, DayOverride>
): Map<string, DayOverride> {
  const result = new Map<string, DayOverride>();
  for (const [dateStr, override] of overridesByDate) {
    result.set(dateStr, stripDecisionOverride(override));
  }
  return result;
}
```

### 1-2. 新增：把 suggestion + slot 轉成中文標籤的共用函式
過去/原定/實際三種情境都要把 `DayPlanSuggestion` 轉成人看得懂的文字，抽成一個函式避免 UI 端重複判斷邏輯（`SchedulePage.tsx:429-455` 目前是 UI 端自己 if/else 判斷，本次新增的原定/實際對照不要再複製一份，直接呼叫這個函式）：

```ts
export function describeSuggestionLabel(
  suggestion: DayPlanSuggestion,
  slot: ProgramSlot | null
): string {
  switch (suggestion) {
    case 'train': return slot ? slot.label : '訓練';
    case 'restOrCardio': return '休息/有氧';
    case 'cardio': return '建議有氧';
    case 'paused': return '今日無法';
    case 'forcedRest': return '強制休息';
    case 'noProgram': return '尚未設定課表';
    case 'past': return '—';
  }
}
```

### 1-3. 新增：合併原定/實際兩條計算結果
```ts
export interface PlannedDayWithBaseline extends PlannedDay {
  baselineSuggestion: DayPlanSuggestion;
  baselineSuggestedSlot: ProgramSlot | null;
  diverged: boolean; // 原定 ≠ 實際，且不是過去日期，才算「有落差」
}

export function mergeBaselinePlan(
  actual: PlannedDay[],
  baseline: PlannedDay[]
): PlannedDayWithBaseline[] {
  const baselineByDate = new Map(baseline.map((d) => [d.dateStr, d]));
  return actual.map((day) => {
    const b = baselineByDate.get(day.dateStr);
    const baselineSuggestion = b?.suggestion ?? day.suggestion;
    const baselineSuggestedSlot = b?.suggestedSlot ?? day.suggestedSlot;
    const diverged =
      !day.isPast &&
      (baselineSuggestion !== day.suggestion ||
        baselineSuggestedSlot?.id !== day.suggestedSlot?.id);
    return { ...day, baselineSuggestion, baselineSuggestedSlot, diverged };
  });
}
```

`PlannedDay` 型別（`shiftPlan.ts:19-29`）跟 `generateMonthPlan()` 本身完全不用改。

---

## 2. `SchedulePage.tsx` 接線

### 2-1. 多算一次 baseline，合併進 `plannedDayMap`
現有的 `plannedDays`（`SchedulePage.tsx:155-169`）跟緊接著的 `plannedDayMap`（`:172` 附近，把陣列轉成 `Map<dateStr, PlannedDay>` 供月曆格子查）之間，插入：

```ts
const baselineOverridesByDate = useMemo(
  () => buildBaselineOverridesByDate(overridesByDate),
  [overridesByDate]
);

const baselinePlannedDays = useMemo(() => {
  if (dateStrings.length === 0) return [];
  return generateMonthPlan({
    dateStrings,
    activeProgram,
    completedWorkouts,
    activeWorkoutToday: activeWorkout,
    overridesByDate: baselineOverridesByDate,
    policyOverrides: settings?.shiftPolicyOverrides,
    restOverrideDays: settings?.restOverrideDays ?? 7,
    exerciseMap,
    today: now,
    weeklyTargetSessions: settings?.weeklyTargetSessions ?? 4,
    templatesById,
  });
}, [dateStrings, activeProgram, completedWorkouts, activeWorkout, baselineOverridesByDate, settings, exerciseMap, now, templatesById]);

const plannedDaysWithBaseline = useMemo(
  () => mergeBaselinePlan(plannedDays, baselinePlannedDays),
  [plannedDays, baselinePlannedDays]
);
```

`plannedDayMap` 的來源陣列從 `plannedDays` 改成 `plannedDaysWithBaseline`（型別也從 `Map<string, PlannedDay>` 變成 `Map<string, PlannedDayWithBaseline>`），下游（月曆格子渲染、編輯 Sheet）都改讀這張表就能拿到 `baselineSuggestion`/`diverged`。

記得在檔案頂部 import 區塊補上 `buildBaselineOverridesByDate`、`mergeBaselinePlan`、`describeSuggestionLabel`、`type PlannedDayWithBaseline`。

### 2-2. 月曆格子：有落差才加一個小徽章
月曆格子目前用掉三個角：左上是日期數字，右上是班別徽章（`:512-519`），左下是指定部位／指定休息有氧徽章（`:520-541`）。右下是空的，放落差提示：

```tsx
{plannedDay.diverged && (
  <span
    className="absolute bottom-0.5 right-1 text-[7px] font-extrabold px-1 py-0.2 rounded leading-none bg-orange-500 text-white"
    title={`原定：${describeSuggestionLabel(plannedDay.baselineSuggestion, plannedDay.baselineSuggestedSlot)}`}
  >
    改
  </span>
)}
```
放在 `:520` 那個 `{override?.pinnedSlotId && pinnedSlot && (...)}` 區塊之前或之後都可以（同一層級的 sibling）。

### 2-3. 編輯日期 Sheet：原定/實際兩行對照
Sheet 目前從 `selectedDateStr` 直接查 `overridesByDate.get(selectedDateStr)`（例如 `:652`/`:668`），但沒有一個綁在該範圍的 `plannedDay` 變數。在 Sheet 的條件區塊開頭（`:557` `{selectedDateStr && (` 之後）加一行：

```ts
const selectedPlannedDay = plannedDayMap.get(selectedDateStr);
```

然後在標頭（`:562-584`）跟「內容：分區」（`:587`）之間插入對照區塊，只有非過去日期才顯示：

```tsx
{selectedPlannedDay && !selectedPlannedDay.isPast && (
  <div className="text-xs bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1">
    <div className="flex justify-between">
      <span className="text-slate-500 dark:text-slate-400">原定建議</span>
      <span className="font-semibold text-slate-700 dark:text-slate-300">
        {describeSuggestionLabel(selectedPlannedDay.baselineSuggestion, selectedPlannedDay.baselineSuggestedSlot)}
      </span>
    </div>
    <div className="flex justify-between">
      <span className="text-slate-500 dark:text-slate-400">實際安排</span>
      <span className={`font-semibold ${selectedPlannedDay.diverged ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-300'}`}>
        {describeSuggestionLabel(selectedPlannedDay.suggestion, selectedPlannedDay.suggestedSlot)}
      </span>
    </div>
  </div>
)}
```

`selectedPlannedDay` 理論上一定存在（`selectedDateStr` 只會被設成月曆上顯示過的日期），但 `plannedDayMap.get()` 型別是 `| undefined`，用 `selectedPlannedDay &&` 擋一下就好，不用另外處理 fallback。

批次編輯 Sheet（`:692` 起）不用加這個對照——批次編輯本來就是一次改一段日期範圍的「實際」，不特別對照原定，維持現狀即可。

---

## 3. 測試（`src/lib/__tests__/shiftPlan.test.ts`）

比照既有的 fixture 風格（檔案開頭 `makeExercise`/`exMap`/固定 `now`），新增：

1. `stripDecisionOverride` / `buildBaselineOverridesByDate`：給一個同時有 `shiftLetters` 跟 `pinnedOutcome: 'rest'` 的 `DayOverride`，驗證回傳值 `shiftLetters` 還在、`pinnedOutcome` 被清掉。
2. `mergeBaselinePlan`：組一個 2-3 天的 `activeProgram`（可抄現有測試裡建 `TrainingProgram` 的寫法），其中一天實際 `pinnedOutcome: 'rest'` 蓋掉了本來的 `'train'`，斷言：
   - `diverged === true` 且 `baselineSuggestion === 'train'`、`suggestion === 'restOrCardio'`。
   - 該天之後的日期，因為原定跟實際兩條線消耗 `pool` 的節奏不同，`baselineSuggestedSlot` 跟 `suggestedSlot` 應該指向不同的 `ProgramSlot`（驗證「後續自動重新生成」確實生效，不是只有當天不一樣）。
3. 過去日期：把 `dateStrings` 裡最早一天設成早於 `now` 對應的日期，斷言 `diverged === false`（不管該天 override 內容是什麼）。
4. `describeSuggestionLabel`：對 7 種 `DayPlanSuggestion` 各斷言一次中文文案，純粹防止之後改字串時漏改測試。

跑 `npm run build`（比本機 `tsc --noEmit` 嚴格，之前 opt24 系列踩過這個坑）確認型別過關，再跑 `npm test`。

---

## 4. Review 檢查清單（完成時對照）

- `generateMonthPlan()` 本體完全沒被改動——原本呼叫它的地方（`WorkoutLogger.tsx` 等）行為應該零變化。
- `DayOverride`／`TrainingProgram` 型別、Dexie schema version、Firestore 同步都沒有異動。
- 過去日期（`isPast`）不會出現「改」徽章或原定/實際對照區塊。
- 沒有 `activeProgram`（`noProgram`）時，原定跟實際都應該是 `'noProgram'`，不會誤判成 diverged。
- `pinnedSlotId` 指定「這一輪已練過」導致 `pinConflict: true` 的情境（`shiftPlan.ts:330-339`）：這種情況下 `resolvedPinSlot` 是 `null`，決策會退回一般判斷邏輯——確認這種「指定沒生效」的日子，原定/實際本來就會算出同一個結果，不會被誤標成 diverged（因為 baseline 那次呼叫的 override 沒有 `pinnedSlotId`，會直接照一般規則走；如果一般規則跟「指定失敗後退回的一般規則」剛好一致，兩者不 diverge，這是預期行為，不是 bug）。
