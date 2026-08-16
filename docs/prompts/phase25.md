# Phase 25（v1.19）班別狀態擴充＋月曆滿版配色＋智慧排課規則

> 觸發：2026-08-16 使用者回報三件事——① 九宮格面板裡點不到 ABC／休假／今日無法，且想再加一個「強制休息日」（選了代表整天不上班也不健身，連有氧都沒有）；② 想把月曆格子改成整格底色，仿照另一款班表 App（截圖）；③ 希望 `generateMonthPlan` 排出來的訓練建議能遵守「腿日前後盡量安排休息/有氧」「傾向練一休一，真的沒辦法才連續 2、3 天」「胸背為主」三條經驗法則，並要求先討論衝突點再落規格。
>
> 討論後查明：① 其實 9 顆按鈕本來就都在（Phase 23 已做），是 `SchedulePage.tsx` 編輯面板浮層跟 `BottomNav` 的 z-index 打平、DOM 順序輸給後者，導致面板最後一排被導覽列蓋住蓋到點不到——這是 bug，不是缺功能；② Phase 23 §0-5 當初「刻意不做」滿版底色，原因是怕跟「今天」「拖曳選取中」兩個既有視覺狀態疊在一起分不清楚，這次要做，需要處理好優先序；③ 追查後發現使用者目前 `/plan` 啟用中的是宗諺 8 週 4 天課表，只有「拉 (Pull)／推 (Push)／腿 (Leg)／手 (Arms)」四個 slot，胸永遠跟肩綁在「推」、背永遠跟肩綁在「拉」，沒辦法真的把「胸」「背」從 slot 裡單獨挑出來；而且現有排課是靠 `TrainingProgram.cursor` 固定順序前進、`cycleCount` 用來對應宗諺課表 W1~W8 的漸進負荷數字，兩者是同步的——如果為了「胸背為主」去打亂 slot 出現順序，`cycleCount`（決定要顯示第幾週的組數/次數）就會跟腿/手兩個 slot 的實際訓練次數脫勾，會把整份 8 週漸進負荷表搞壞。討論後拍板：**規則優先序 b（連續訓練上限）> 每週目標達成急迫性 > a（腿日間距）> c（胸背優先），且 c 只調整「哪幾天要不要練」，不重排 slot 固定順序**——用這個前提換取「不用碰 cursor/cycleCount，不會弄壞 8 週課表同步」。「強制休息日」拍板為獨立新欄位（不沿用 `paused`），且 `paused`／`forcedRest` 這兩種「休息」都要讓演算法扣掉當週目標次數，避免把沒練到的量硬塞進剩下幾天。
>
> 本文＝規格，建立在 Phase 21/22/23（`shiftPlan.ts` 核心算法、`dayOverrides`、`SchedulePage.tsx`）之上。依工作協議（[[gymtracker-working-agreement]]）由你自己動手寫 code。

---

## 0. 核心設計決策

### 0-1. z-index bug：編輯面板被 `BottomNav` 蓋住（連帶修正）
`SchedulePage.tsx` 的單日／批次編輯 sheet 外層都是 `fixed inset-0 ... z-50`，`BottomNav.tsx` 也是 `fixed bottom-0 ... z-50`——兩者 z-index 打平時看 DOM 順序，`Layout.tsx` 裡 `<BottomNav />` 排在 `<main>{children}</main>` **之後**，所以畫面上 `BottomNav` 蓋在 sheet 最下面那排上面。這次面板要再加一顆「強制休息」按鈕（見 0-2），內容變得更長，不修這個 bug 的話會蓋掉更多，必須一起修。
- 修法：兩個 sheet 的外層 `z-50` 都改成比 `BottomNav` 高（例如 `z-[60]`），不用動 `BottomNav` 本身。

### 0-2. 新增「強制休息日」：獨立欄位，不沿用 `paused`
- `DayOverride` 新增 `forcedRest?: boolean`，跟 `shiftLetters`／`isDayOff`／`paused` 一樣是四選一互斥的登記狀態（九宮格面板變成 10 顆單點即存按鈕，選任何一顆都會把其他三個欄位明確清成 `undefined`，沿用 Phase 23 已經定好的寫入慣例）。
- **為什麼不沿用 `paused`**：`paused`（今日無法）語意上是臨時性的（急事/下雨），`forcedRest`（強制休息日）是使用者主動排定的休息節奏，兩者存進同一個欄位，日後回顧月曆／歷史會分不出「臨時取消」跟「本來就排休息」。獨立欄位也讓月曆徽章／面板按鈕可以各自獨立配色，不用共用同一個「🚫」視覺語意。
- 行為上兩者高度相似：`generateMonthPlan` 判斷順序跟 `paused` 一樣排在最前面，直接短路成專屬的建議值，不進班別分類或每週目標判斷；`WorkoutLogger.tsx` 不會因為登記了 `forcedRest` 就擋住使用者手動開練（跟現有 `paused` 行為一致，只是「今天該練」建議卡片不會出現）。

### 0-3. `paused`／`forcedRest` 兩種休息都要扣抵當週目標次數
現況：標記 `paused` 的日子完全不影響 `weeklyTargetSessions` 的計算，所以這週剩下的天數還是會照原目標湊次數，等於把休息掉的那次訓練量硬塞進剩下更少的天數——這正是使用者說的「傾向練一休一，不希望被逼連續訓練」的反例。
- 修法：迴圈內維護一個 `effectiveWeeklyTarget`（初始＝`weeklyTargetSessions`，每次跨到新的一週重置），只要當天判定為 `paused` 或 `forcedRest`，就把它 `-1`（下限 0）。這週後續的「還沒到目標就排訓練」判斷一律改看 `effectiveWeeklyTarget`，不是原始 `weeklyTargetSessions`。
- `休假`（`isDayOff`）跟`明確排班`不受影響，維持現況——休假是「沒上班、練不練交給次數決定」的自由日，本來就該正常算進目標次數的分母，跟「休息」語意不同。

### 0-4. 月曆格滿版配色：推翻 Phase 23 §0-5 的「刻意不做」
Phase 23 當時不做整格染色的顧慮是「跟『今天』『拖曳選取中』兩個互動狀態的底色疊在一起會分不清楚哪個是哪個」。這次要做，用**優先序**解決而不是放棄：拖曳選取中 > 今天 > 當天登記類別的分類色 > 預設灰。也就是類別色只出現在「不是今天、也不是正在拖曳選取」的格子上，跟另外兩個互動狀態不會同時出現在同一格。
- 沿用 Phase 23 已經建立的「完整 Tailwind class 查表」寫法（`SHIFT_CODE_BUTTON_CLASSES` 那個模式），新增一張 `SHIFT_CODE_CELL_BG_CLASSES`，不要用動態組字串（`bg-${xxx}-50` 這種在 Tailwind v4 JIT 下會被掃描器漏掉，Phase 23 已經踩過這個雷、寫進規格提醒過）。
- 右上角小徽章（`badgeText`）保留不拿掉——滿版底色讓人一眼看出「這天屬於哪一類」，徽章文字補上「是哪個班別組合」的細節（例如同樣是 combo 底色，徽章文字分得出 AB 還是 ABC），兩者互補不是重複。

### 0-5. 智慧排課規則：只調整「哪天練/哪天休」，不重排 slot 固定順序
使用者要的三條規則——(a) 腿日前後盡量休息/有氧、(b) 傾向練一休一避免連續、(c) 胸背為主——原始講法聽起來像是要調整「下一個該練哪個部位」，但宗諺 8 週課表的 `cursor`／`cycleCount` 是靠**固定順序前進**（拉→推→腿→手→拉→…）來對應 W1~W8 的漸進負荷數字（`ZONGYUAN_8WEEK_PLAN[i].exercises[j].weekly[N]`），四個 slot 假設同步推進到同一週——如果為了「胸背優先」讓推/拉出現得比腿/手更頻繁，幾週後推/拉可能已經跑到「W5」的重量，腿/手卻還停在「W2」，整份表格的漸進負荷邏輯就對不起來了。

因此這次**刻意不動 slot 前進順序**（`cursor` 還是線性 `+1`，`slots[cursor % length]` 還是決定「下一個要練的是誰」），三條規則全部發生在另一個維度：**每一天決定「今天要不要練」的那個判斷**，具體換算成：

| 規則 | 換算成演算法怎麼判斷 |
|---|---|
| (b) 避免連續訓練超過必要 | 硬上限：連續訓練天數達到 `MAX_CONSECUTIVE_TRAIN_DAYS`（3）時，即使班別政策查表結果是「練」也強制改成休息——這是唯一一條連明確排班都能推翻的規則。 |
| 週目標急迫性（既有邏輯，非新規則，但排序上介於 b 跟 a/c 之間） | 沒明確排班的「自由日」，先看「剩餘天數是否已經不夠湊到目標次數」（`remainingQuota >= daysLeftInWeek`）——不夠的話是硬需求，照練，跳過 a/c 的軟性偏好；還有餘裕才輪到 a/c 發揮。 |
| (a) 腿日前後盡量休息/有氧 | 自由日才生效（明確排班的日子尊重班別，不套用）：往前看一步，若「明天要消耗的 slot 是腿」或「昨天練的是腿」，且目前還有餘裕（不急迫），就把今天改判休息；若最終判定休息、且明天是腿日，建議文字用「有氧」而非籠統的「休息/有氧」。 |
| (c) 胸背為主 | 因為胸/背在宗諺課表裡分別跟肩綁在推/拉 slot，沒辦法單獨挑，改成：自由日只要「還有餘裕、不急迫」，就優先把訓練機會留給下一個要消耗的 slot是推或拉（胸背相關）的日子；下一個 slot 是腿或手的話，寧可先休息，把這次訓練機會遞延到餘裕用完、真正需要湊次數時再消耗（腿/手還是會被練到，只是被排擠到比較晚，不會整個跳過）。 |

**為什麼這樣換算是對的**：這個做法完全不碰 `cursor`／`cycleCount`，`WorkoutLogger.tsx` 裡「今天該練」卡片（`activeProgram.slots[activeProgram.cursor]`）跟 `/schedule` 月曆的建議（`generateMonthPlan` 算出的 `suggestedSlot`）永遠指向同一個 slot，兩個畫面不會顯示不一致的內容；宗諺 8 週表的漸進負荷數字繼續假設四個 slot 同步推進，不會被打亂。腿/手兩個 slot 依然會被排到，只是自由日的「選擇權」優先讓給推/拉。

---

## 1. 資料模型異動（`src/db/schema.ts`）

```ts
export interface DayOverride {
  // ...既有欄位不動...
  forcedRest?: boolean;   // 強制休息日：不上班也不健身，連有氧都沒有；跟 shiftLetters/isDayOff/paused 四選一互斥
}
```
不用加 Dexie migration（跟 `paused` 當初一樣，`DayOverride` 是自由欄位的物件，新增 optional 欄位不影響既有索引）。

---

## 2. 演算法變更（`src/lib/shiftPlan.ts`）

### 2-1. 新增型別與常數
```ts
export type DayPlanSuggestion =
  | 'train' | 'restOrCardio' | 'cardio' | 'paused' | 'forcedRest' | 'noProgram' | 'past';
  //                            ^^^^^^^^          ^^^^^^^^^^^^ 新增兩個

type SlotCategory = 'legs' | 'chestBack' | 'other';

const MAX_CONSECUTIVE_TRAIN_DAYS = 3;
```

### 2-2. `classifySlotCategory`：靠 template 裡動作的 `muscleGroup` 判斷 slot 類別，不靠 `label` 字串
`ProgramSlot.label` 是自由文字（`'拉 (Pull)'`／`'胸日'`都合法，不綁 `MuscleGroup`），不能拿字串比對當作分類依據；但 slot 掛的 `WorkoutTemplate.entries[].exerciseId` 查得到 `Exercise.muscleGroup`，是結構化資料，兩種課表結構（宗諺 4 分化、使用者自訂 5 分化）都吃得動，不用為特定課表寫死判斷：

```ts
function classifySlotCategory(
  slot: ProgramSlot,
  templatesById: Map<string, WorkoutTemplate>,
  exerciseMap: Map<string, Exercise>,
): SlotCategory {
  if (!slot.templateId) return 'other';
  const template = templatesById.get(slot.templateId);
  if (!template) return 'other';
  const groups = new Set<MuscleGroup>();
  for (const entry of template.entries) {
    const ex = exerciseMap.get(entry.exerciseId);
    if (ex) groups.add(ex.muscleGroup);
  }
  if (groups.has('腿臀')) return 'legs';
  if (groups.has('胸') || groups.has('背')) return 'chestBack';
  return 'other';
}
```
還沒補模板內容的 slot（`templateId` 是 `undefined`）分類成 `'other'`，不套用 a/c 的偏好，也不會被誤判成腿日。

### 2-3. `generateMonthPlan` 新增輸入 `templatesById`
```ts
export interface GenerateMonthPlanInput {
  // ...既有欄位不動...
  templatesById: Map<string, WorkoutTemplate>;  // 新增：listTemplates() 建的 id→WorkoutTemplate 表
}
```

### 2-4. 主迴圈變更（在既有結構上疊加，§0-5 那張表的具體落地）
以下是判斷順序的 pseudocode，變數命名可依實作習慣調整，但順序與短路邏輯要對：

```ts
const slotCategories = slots.map(s => classifySlotCategory(s, templatesById, exerciseMap));

let consecutiveTrainDays = 0;
let yesterdayWasLegsTrain = false;
let effectiveWeeklyTarget = weeklyTargetSessions;
// ...currentWeekStart / trainedThisWeek 月初墊底不變...

for (const dateStr of dateStrings) {
  const weekStart = getWeekStart(dateStr);
  if (weekStart !== currentWeekStart) {
    currentWeekStart = weekStart;
    trainedThisWeek = 0;
    effectiveWeeklyTarget = weeklyTargetSessions;   // 新增：每週重置
  }
  // ...isPast / isToday / override / actualWorkout / trainedThisWeek+=1 不變...

  const upcomingCategory = slots.length > 0 ? slotCategories[simCursor % slots.length] : 'other';
  const nextCategory = slots.length > 0 ? slotCategories[(simCursor + 1) % slots.length] : 'other';

  let suggestion: DayPlanSuggestion;
  let suggestedSlot: ProgramSlot | null = null;

  if (isPast) {
    suggestion = 'past';
  } else if (override?.paused) {
    suggestion = 'paused';
    daysSinceWeights += 1;
    consecutiveTrainDays = 0;
    yesterdayWasLegsTrain = false;
    effectiveWeeklyTarget = Math.max(0, effectiveWeeklyTarget - 1);
  } else if (override?.forcedRest) {
    suggestion = 'forcedRest';
    daysSinceWeights += 1;
    consecutiveTrainDays = 0;
    yesterdayWasLegsTrain = false;
    effectiveWeeklyTarget = Math.max(0, effectiveWeeklyTarget - 1);
  } else {
    const hasExplicitShift = !!override && !override.isDayOff && !!override.shiftLetters && override.shiftLetters.length > 0;
    let wantsTrain: boolean;

    const dow = new Date(...dateStr 拆解...).getDay();
    const daysLeftInWeek = 7 - dow;                          // 含今天
    const remainingQuota = effectiveWeeklyTarget - trainedThisWeek;
    const urgent = remainingQuota >= daysLeftInWeek;          // 剩下的天數已經不夠湊到目標，沒有選擇餘地

    if (hasExplicitShift) {
      const key = [...override!.shiftLetters!].sort().join('');
      let policy = policyOverrides?.[key] || DEFAULT_SHIFT_POLICIES[key] || 'train';
      if (policy === 'restOrCardio' && daysSinceWeights >= restOverrideDays) policy = 'train';
      wantsTrain = policy === 'train';
      // 注意：a/c 不套用在明確排班的日子，尊重班別本身的判斷；只有 b 的連續上限例外（見下）。
    } else if (remainingQuota <= 0) {
      wantsTrain = false;
    } else if (urgent) {
      wantsTrain = true;                                     // 週目標急迫性：沒有選擇餘地，優先於 a/c
    } else {
      // 規則 c：有餘裕時只挑推/拉（胸背相關），腿/手先讓路、遞延到 urgent 時才消耗
      wantsTrain = upcomingCategory === 'chestBack';
      // 規則 a：不急迫時，腿日前後盡量避開
      if (wantsTrain && (nextCategory === 'legs' || yesterdayWasLegsTrain)) {
        wantsTrain = false;
      }
    }

    // 規則 b：連續訓練天數硬上限，優先度最高，連明確排班都能推翻
    if (wantsTrain && consecutiveTrainDays >= MAX_CONSECUTIVE_TRAIN_DAYS) {
      wantsTrain = false;
    }

    if (wantsTrain && slots.length > 0) {
      suggestion = 'train';
      suggestedSlot = slots[simCursor % slots.length];
      yesterdayWasLegsTrain = upcomingCategory === 'legs';
      simCursor += 1;
      daysSinceWeights = 0;
      consecutiveTrainDays += 1;
      if (!actualWorkout) trainedThisWeek += 1;
    } else {
      consecutiveTrainDays = 0;
      yesterdayWasLegsTrain = false;
      if (activeProgram) {
        suggestion = nextCategory === 'legs' ? 'cardio' : 'restOrCardio';
      } else {
        suggestion = 'noProgram';
      }
      daysSinceWeights += 1;
    }
  }

  plannedDays.push({ dateStr, isPast, isToday, override, actualWorkout, suggestion, suggestedSlot });
}
```

**已知的實作彈性**：`dow`/`daysLeftInWeek`/`remainingQuota`/`urgent` 這幾個值在上面寫了兩次概念（`hasExplicitShift` 判斷之外、`a` 規則判斷內），實作時直接在分支最上面算一次共用即可，不用真的複製兩份。Phase 23 當時的 `generateMonthPlan` 也不是逐字照抄規格 pseudocode（多加了一個 `if (!actualWorkout)` 防重複計算的守門），這份 pseudocode 一樣抓邏輯順序，不強制逐字實作。

### 2-5. 呼叫端跟著補 `templatesById`
`SchedulePage.tsx`、`WorkoutLogger.tsx` 兩處呼叫 `generateMonthPlan` 都要補上這個新輸入：
- `WorkoutLogger.tsx` 已經有 `templates` state（`listTemplates()` 讀出來的，`saveTemplate`/`createTemplateFromWorkout`/`listTemplates`/`deleteTemplate` 都從 `../db/templates` import），直接 `useMemo(() => new Map(templates.map(t => [t.id, t])), [templates])` 就有了，不用新增資料讀取。
- `SchedulePage.tsx` 目前的 `Promise.all([listDayOverridesInRange(...), listCompletedWorkouts(), listExercises()])` 要加一個 `listTemplates()`（從 `../db/templates` import），新增一個 `templates` state，比照 `exerciseMap` 的寫法建 `templatesById`。

---

## 3. UI 變更 A：編輯面板（`SchedulePage.tsx`）

1. `BUTTON_CONFIGS` 新增第 10 個項目：
   ```ts
   { label: '強制休息', value: { shiftLetters: undefined, isDayOff: undefined, paused: undefined, forcedRest: true, rawLabel: '強制休息' }, category: 'forcedRest' as const, display: '🛌 強制休息' },
   ```
   其餘 9 個既有項目補上 `forcedRest: undefined`（沿用「選哪個就把其他三個欄位明確清空」的既有寫入慣例）。`handleSingleSave`/`handleBatchSave` 呼叫 `saveDayOverride`/`bulkSaveDayOverride` 時多帶一個 `forcedRest: config.value.forcedRest`。
2. `ShiftCodeCategory` 新增 `'forcedRest'`；`SHIFT_CODE_EMOJI`/`SHIFT_CODE_HEX`/`SHIFT_CODE_BUTTON_CLASSES` 三張表各補一筆（建議用 `cyan-600`／`#0891b2`，跟現有六色都不撞色）：
   ```ts
   forcedRest: 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-900 text-cyan-600 dark:text-cyan-400',
   ```
3. **面板改成兩個分區**（10 顆按鈕擠在單一 3 欄網格會排成 3+3+3+1，最後一顆很突兀）：
   - 「班別」區：`A`／`B`／`C`／`AB`／`AC`／`BC`／`ABC`／`休假` 共 8 顆，3 欄網格（3+3+2）。
   - 「訓練覆寫」區：`今日無法`／`強制休息` 兩顆並排（2 欄），跟班別區之間留一條分隔線＋小標題文字，語意上跟「班別」區分開（這兩顆是不管班別如何都直接覆寫訓練建議）。
4. **z-index 修正**（見 §0-1）：單日、批次兩個 sheet 外層的 `fixed inset-0 ... z-50` 都改成 `z-[60]`。
5. 月曆格右上角徽章：`override?.forcedRest` 時 `badgeText = '休'`（跟休假的「休」文字重複沒關係，靠底色/位置區分不夠精確可以改成 `'鎖'` 或直接用 emoji `'🛌'` 取代文字，實作時擇一，不強制），`badgeCategory = 'forcedRest'`。
6. 月曆格中央的建議文字：`suggestion === 'cardio'` 時顯示「建議有氧」（樣式比照現有 `restOrCardio` 分支）；`suggestion === 'forcedRest'` 時顯示「強制休息」。

---

## 4. UI 變更 B：月曆格滿版配色（`SchedulePage.tsx`）

新增查表：
```ts
export const SHIFT_CODE_CELL_BG_CLASSES: Record<ShiftCodeCategory, string> = {
  A: 'bg-blue-50 dark:bg-blue-950/30',
  B: 'bg-amber-50 dark:bg-amber-950/30',
  C: 'bg-purple-50 dark:bg-purple-950/30',
  combo: 'bg-rose-50 dark:bg-rose-950/30',
  dayoff: 'bg-emerald-50 dark:bg-emerald-950/30',
  unable: 'bg-slate-100 dark:bg-slate-800/60',
  forcedRest: 'bg-cyan-50 dark:bg-cyan-950/30',
};
```
（放在 `shiftPlan.ts`，跟其他 `SHIFT_CODE_*` 表放一起。）

月曆格 `className` 的三元判斷鏈，在既有「拖曳選取中 > 今天 > 預設灰」的基礎上插入第三層——**優先序：拖曳選取中 > 今天 > 有登記類別（`badgeCategory` 非 null）> 預設灰**：
```ts
isRangeSelecting && ... ? '...(不變)...'
: isToday ? '...(不變)...'
: badgeCategory ? SHIFT_CODE_CELL_BG_CLASSES[badgeCategory]
: 'bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800'
```
右上角徽章維持不拿掉（見 §0-4，滿版底色講「哪一類」，徽章文字補「哪個組合」的細節，兩者互補）。

---

## 5. UI 變更 C：`WorkoutLogger.tsx` 呼應新的建議值

現況只有 `todayPlan.suggestion === 'paused'` 跟 `=== 'restOrCardio'` 各有專屬卡片，其餘（含新增的 `'cardio'`／`'forcedRest'`）會落進預設分支，顯示「今天該練 {currentSlot.label}」——這是錯的，必須補分支，否則強制休息日會被畫成訓練建議：
1. `todayPlan.suggestion === 'forcedRest'`：比照 `'paused'` 分支的卡片結構，文字改成「今天已標記強制休息」，不需要「取消暫停」等價的按鈕也可以（或加一個「取消強制休息」，行為對稱 `handleCancelPause`，把 `forcedRest` 寫回 `false`，可選）。
2. `todayPlan.suggestion === 'cardio'`：併進現有 `'restOrCardio'` 分支的條件（`todayPlan.suggestion === 'restOrCardio' || todayPlan.suggestion === 'cardio'`），文字可以依 `suggestion === 'cardio'` 微調成更肯定的「建議安排有氧」，UI 結構（大按鈕開有氧、次要連結還是想練 slot）不用变。

另外 `currentSlot`／`handleStartFromSlotTemplate`／`handleStartFromPastWorkout` 全部不用改——這次刻意不動 `cursor` 前進順序（§0-5），`activeProgram.slots[activeProgram.cursor]` 跟 `/schedule` 月曆算出的 `suggestedSlot` 對同一天永遠是同一個 slot。

---

## 6. 已知限制／邊界情況

- `consecutiveTrainDays`（規則 b 用）只在單次 `generateMonthPlan` 呼叫的視窗內累計，不像 `trainedThisWeek` 有跨月墊底邏輯——月初第一天最壞情況會誤判成「還在 3 天上限內」，允許多練一天。影響範圍很小（最多多算 1 天），不特別處理。
- `effectiveWeeklyTarget`／`trainedThisWeek` 一樣是每週（週日）重置，`paused`／`forcedRest` 只扣抵登記當週，不會往前一週回溯扣。
- 規則 a/c 只在「自由日」（沒有明確排班）生效；使用者實際登記了班別（單班或疊班）時，尊重原本的班別政策查表結果，不會因為腿日快到了就把明確排班的訓練建議改成休息（只有規則 b 的連續上限例外，可以推翻明確排班）。
- 若 `activeProgram.slots` 全部都是 `'other'` 類別（例如使用者自訂課表的 template 還沒填內容，或動作都沒標 `muscleGroup`），a/c 兩條規則等同沒有作用，退化成 Phase 23 的行為（純週目標次數判斷）——不會報錯或排出奇怪結果。

---

## 7. 驗收標準

1. 編輯面板（單日／批次）10 顆按鈕（含新增「強制休息」）在手機瀏覽器上全部看得到、點得到，不被 `BottomNav` 蓋住。
2. 點「強制休息」會存 `forcedRest: true` 且 `shiftLetters`/`isDayOff`/`paused` 皆為 `undefined`；點其餘 9 顆會把 `forcedRest` 清成 `undefined`。
3. 月曆格背景依登記類別（7 類）滿版上色；「今天」與「拖曳選取中」兩格的既有視覺不受影響（優先度蓋過分類色）。
4. 標記 `paused` 或 `forcedRest` 的那天起，同一週剩餘天數的訓練建議用 `effectiveWeeklyTarget`（少 1）計算，可用單元測試直接驗證（例如目標 4、週三標 `forcedRest`，週四~週六的 `train` 建議天數應對應目標 3 而非 4）。
5. 給定沒有任何排班登記、目標 4 次/週、`activeProgram` 是四個 slot（拉/推/腿/手，`templatesById` 可正確判斷出腿的 slot 是 `'legs'`、推拉是 `'chestBack'`）的整月情境：非急迫（週目標尚有餘裕）時，腿日前一天的建議應為 `'cardio'`，腿日後一天應為 `'restOrCardio'`（不是 `'train'`）。
6. 同上情境，連續 5 天皆無排班：不應出現連續 4 天以上 `suggestion === 'train'`。
7. 給定連續 5 天皆明確登記單一班別（政策查表＝`train`）：第 4、5 天的建議應被規則 b 推翻成非 `train`（驗證硬上限連明確排班都擋得住）。
8. 週目標餘裕用盡（`urgent`）時，即使下一個該練的 slot 是腿或手，當天仍應建議 `'train'`（驗證規則 c/a 只是遞延、不是永久跳過）。
9. `activeProgram.slots[activeProgram.cursor]`（`WorkoutLogger.tsx` 首頁「今天該練」卡片）與當天 `generateMonthPlan` 算出的 `suggestedSlot`（`/schedule` 月曆）在同一天應指向同一個 slot。
10. `WorkoutLogger.tsx` 首頁對 `todayPlan.suggestion === 'forcedRest'` 與 `'cardio'` 都有對應的專屬卡片，不會落入預設的「今天該練」分支。
11. `npm run lint` / `npm run build`（`tsc -b && vite build`）/ `npm run test`（vitest）全過。

---

## 8. 刻意不做

- **不開放使用者自訂「胸背優先」的權重或天數比例**——寫死在演算法邏輯裡（規則 c 的判斷順序本身），不加 Settings 欄位。先看這版效果，之後真的需要再開放，避免過度設計。
- **不重排 `TrainingProgram.slots` 的固定前進順序**，`cursor`/`cycleCount` 語意完全不動——原因見 §0-5，跟宗諺 8 週課表的漸進負荷數字綁在一起，硬改會需要另外重新設計進度追蹤機制，超出這次範圍。
- **不特別驗證 5 分化自訂課表（胸日/背日/腿臀日/肩日/手臂日）下的 `classifySlotCategory` 行為**——理論上同一套邏輯（靠 template 的 `muscleGroup` 判斷）也適用，但這次只用宗諺 8 週課表的實際資料驗證/寫測試，真的換成自訂課表再視情況補測試。
- **不讓 `forcedRest` 阻擋使用者手動開練**——跟現有 `paused` 行為一致，選了之後首頁依然可以手動開始一個訓練，不會被程式擋下來，只是不會出現在「今天該練」建議卡片裡。
- **不做「取消強制休息」的專屬確認流程**——比照 `handleCancelPause` 的簡單寫回即可，不用額外的二次確認彈窗。

---

## 9. 預期異動檔案

- `src/db/schema.ts`（`DayOverride.forcedRest`）
- `src/lib/shiftPlan.ts`（`DayPlanSuggestion` 新增值、`classifySlotCategory`、`generateMonthPlan` 新輸入與判斷邏輯、`SHIFT_CODE_*` 四張表新增 `forcedRest`／新增 `SHIFT_CODE_CELL_BG_CLASSES`）
- `src/lib/__tests__/shiftPlan.test.ts`（對應驗收標準 4~8 的新測試）
- `src/pages/SchedulePage.tsx`（`BUTTON_CONFIGS` 第 10 顆、面板分區、z-index 修正、月曆格滿版配色、`templatesById` 資料載入）
- `src/pages/WorkoutLogger.tsx`（`forcedRest`／`cardio` 專屬分支、`templatesById` 建構）
- `docs/ROADMAP.md`（Phase 25 列與進度摘要，實作完成後更新）

---

## 10. 實作順序建議

1. `schema.ts` 加欄位 → `shiftPlan.ts` 的 `classifySlotCategory` 與新查表（先寫這塊的單元測試，獨立於 `generateMonthPlan` 好驗證）。
2. `generateMonthPlan` 主迴圈改造（§2-4），跑通既有測試＋新增驗收標準 4~8 對應的測試。
3. `SchedulePage.tsx`：z-index 修正＋第 10 顆按鈕＋面板分區＋滿版配色＋載入 `templatesById`。
4. `WorkoutLogger.tsx`：補 `forcedRest`／`cardio` 分支＋ `templatesById`。
5. `npm run lint` + `npm run build` + `npm run test` 全過 → 交給 Claude review。
