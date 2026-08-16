# Phase 26 班別配色分色＋班別預設政策校正＋指定訓練部位

> 觸發：2026-08-16 使用者回報三件事（附三張截圖）——① 月曆上 `AB`／`AC`／`BC`／`ABC` 四種組合班看起來全部同一個顏色，分不出來；② `BC` 班代表「早上有空可以訓練」、`AC` 班代表「下午有空可以訓練」，但畫面上這幾天都被建議成休息，跟語意不符；③ 想在「編輯日期」面板除了班別登記之外，再加一個「指定這天要練推/拉/腿/手哪個部位」，指定之後，後續自動生成的訓練建議要跟著重新計算。
>
> 討論後查明：①③ 都是真 bug／真缺口，②在現有版本其實已經有 Settings 頁「班別建議對照表」可以個別覆寫（`AC`/`BC` 手動切成「建議訓練」就會立刻生效，不用等 code），但預設值語意本來就不對，一併修掉。③ 深挖後發現使用者目前啟用中的宗諺 8 週課表，`slots` 剛好就是「拉/推/腿/手」四個，跟這次要的「四大訓練」完全對應；但 `TrainingProgram.cursor` 是靠 `+1` 線性前進、`cycleCount`（決定漸進負荷第幾週）假設四個 slot 每輪都同步各消耗一次——這點 Phase 25 已經記錄過。若「指定某天練哪個部位」允許使用者跳著選，勢必要把 cursor 的「線性索引」概念換成「這一輪還沒消耗掉的 slot 池」，才能同時滿足「使用者可以跳著排」跟「每輪 4 個部位仍然各練一次、周數不會脫勾」兩個要求。討論後也發現 `WorkoutLogger.tsx` 現有的「循序列表」（可點選切換今天該練哪個 slot 的那排小藥丸按鈕，`onClick={() => updateProgram({ cursor: idx })}`）其實已經有同樣的「跳著選」入口，只是它跟 `advanceCursor()`（完成訓練無條件 `cursor+1`）搭配起來，本來就會把之後沒被跳選到的 slot permanently 跳過或重複——也就是這次要修的資料模型問題，不修的話，即使不做新功能，這顆既有按鈕本身就有等同的 bug。拍板：**採「本輪內重新排序」（`cursor` 數字→「這一輪已消耗的 slot id 清單」），指定訓練部位跟月曆的 `pinnedSlotId` 走同一套機制，`WorkoutLogger.tsx` 那排小藥丸按鈕也改用這套機制**，同時修正它原有的資料一致性問題。
>
> 本文＝規格，建立在 Phase 21/23/25（`shiftPlan.ts`／`dayOverrides`／`SchedulePage.tsx`／`program.ts`）之上。依工作協議（[[gymtracker-working-agreement]]）由你自己動手寫 code。

---

## 0. 核心設計決策

### 0-1. 組合班配色：`ShiftCodeCategory` 拆掉籠統的 `'combo'`
`classifyShiftCodeCategory()` 目前把 `AB`／`AC`／`BC`／`ABC` 全部歸類成同一個 `'combo'`，四張查表（`SHIFT_CODE_EMOJI`／`SHIFT_CODE_HEX`／`SHIFT_CODE_BUTTON_CLASSES`／`SHIFT_CODE_CELL_BG_CLASSES`）自然也只有一組顏色可用——這是月曆看起來四種組合班一個樣的真正原因，不是你看錯。修法：`ShiftCodeCategory` 拆成 `'AB' | 'AC' | 'BC' | 'ABC'` 四個獨立值，四張表各自補齊。

### 0-2. 組合班預設政策：跟「哪個時段有空」對齊
`單班 A/B/C` 目前分別是「早班／中班／晚班」（`SettingsPage.tsx` `SHIFT_LABELS`）。疊班的語意應該是「兩個時段都要上班，剩下第三個時段才有空」：
- `AB`（早+中）→ 剩晚上有空
- `AC`（早+晚）→ 剩下午有空（使用者截圖原話：AC＝下午可以訓練）
- `BC`（中+晚）→ 剩早上有空（使用者截圖原話：BC＝早上可以訓練）
- `ABC`（早+中+晚）→ 整天沒空，真正該休息

但目前 `DEFAULT_SHIFT_POLICIES` 把這四個全部設成 `'restOrCardio'`，只有 `ABC` 是對的，`AB`/`AC`/`BC` 都設反了。修法：預設值改成 `AB`/`AC`/`BC` → `'train'`，只有 `ABC` 維持 `'restOrCardio'`。

**注意（不需要改 code，你現在就能做）**：Settings 頁「班別建議對照表」本來就能個別覆寫這四個值，如果你之前手動點過、`shiftPolicyOverrides` 裡已經存了 `AC`/`BC` 的舊值，改 `DEFAULT_SHIFT_POLICIES` 不會覆蓋掉它——這種情況直接在 Settings 頁把 `AC`/`BC` 切回「建議訓練」即可，比等 code 更快。

### 0-3. 指定訓練部位：`cursor`（線性索引）→「這一輪未消耗 slot 池」
延續本文開頭「觸發」段落的討論結論：

- `TrainingProgram.cursor: number` 改成 `completedSlotIdsThisLap: string[]`——記錄「這一輪（尚未跑滿一圈）已經練過的 slot id」，用集合概念取代線性索引。
- 「今天／某天該練哪個 slot」＝ `slots` 陣列裡，原始順序中第一個 id 還沒出現在 `completedSlotIdsThisLap` 的那個（沒有指定時的預設行為，效果等同現在的 `cursor`）。
- `DayOverride` 新增 `pinnedSlotId?: string`——使用者指定「這天要練哪個 slot」，跟班別／休假／強制休息是**獨立的另一個維度**（可以共存：例如某天登記了 `BC` 班，同時指定當天練「腿」）。
- 完成訓練時，把「剛剛練的那個 slot id」加進 `completedSlotIdsThisLap`；集滿 `slots.length` 個（4 個全部各練過一次）就視為「跑滿一輪」，`cycleCount +1`、池子清空重來——**不管這一輪 4 個 slot 實際被消耗的順序是什麼，「跑滿一輪＝每個各練一次」這個不變量沒有被打破，所以 8 週漸進負荷表的週數判斷（靠 `cycleCount`）不會脫勾**，這正是 Phase 25 §0-5 那個顧慮的解法。
- 指定的部位如果「這一輪已經練過」（`pinnedSlotId` 對應的 slot 已經在 `completedSlotIdsThisLap` 裡），視為**衝突**：忽略這個指定，退回沒有指定時的一般判斷邏輯，並且在該天標記 `pinConflict: true` 讓 UI 提示使用者「這天你指定的部位這一輪已經練過了，沒有生效」。
- `WorkoutLogger.tsx` 現有的「循序列表」小藥丸按鈕，改成寫入**今天**的 `DayOverride.pinnedSlotId`（跟月曆的指定走同一套 `saveDayOverride`），不再直接 `updateProgram({ cursor: idx })`——這樣「今天要練哪個」跟「月曆上未來某天要練哪個」是同一套機制的兩個入口，不會有兩套邏輯各自為政。

**範圍限制（刻意不做更複雜的事）**：這套機制假設 `pinnedSlotId` 指到的 slot 在**目前啟用中的課表**裡確實存在且分類明確；如果找不到（例如換了課表、原本指定的 slot 已被刪除），視同沒有指定，不報錯、不崩潰。也不處理「同一個 slot 在課表裡出現兩次」這種邊界情況（目前課表結構不會發生）。

---

## 1. 資料模型異動（`src/db/schema.ts`）

```ts
export interface DayOverride {
  // ...既有欄位不動...
  pinnedSlotId?: string;   // 指定當天要練哪個 ProgramSlot；跟 shiftLetters/isDayOff/paused/forcedRest 是獨立維度，可共存
}

export interface TrainingProgram {
  id: string;
  name: string;
  slots: ProgramSlot[];
  completedSlotIdsThisLap: string[];   // 取代 cursor：這一輪（尚未跑滿一圈）已消耗的 slot id
  cycleCount: number;
  // ...其餘欄位不動...
  // cursor: number;   ← 移除
}
```

`dayOverrides` 新增 optional 欄位不用 migration（比照 Phase 25 `forcedRest` 的先例）。`programs` 表因為是**改掉既有必填欄位的語意**（`cursor` 數字 → `completedSlotIdsThisLap` 陣列），需要一個 migration 把舊資料轉過來，不能像 `forcedRest` 那樣純新增就算了：

```ts
// version(12): TrainingProgram.cursor（線性索引）→ completedSlotIdsThisLap（本輪未消耗 slot 池）
this.version(12).stores({}).upgrade(async (tx) => {
  await tx.table('programs').toCollection().modify((p: any) => {
    const cursor = typeof p.cursor === 'number' ? p.cursor : 0;
    const slots = Array.isArray(p.slots) ? p.slots : [];
    p.completedSlotIdsThisLap = slots.slice(0, cursor).map((s: any) => s.id);
    delete p.cursor;
  });
});
```
（邏輯：舊的 `cursor` 語意是「陣列前 `cursor` 個都已經練過」，直接照樣轉成 id 清單，使用者既有課表進度不會被重置。）

---

## 2. 演算法變更（`src/lib/shiftPlan.ts`）

### 2-1. 組合班分色（對應 §0-1）

```ts
export type ShiftCodeCategory =
  | 'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'ABC' | 'dayoff' | 'unable' | 'forcedRest';

export function classifyShiftCodeCategory(code: string): ShiftCodeCategory {
  if (code === 'A' || code === 'B' || code === 'C') return code;
  if (code === '休假') return 'dayoff';
  if (code === '今日無法') return 'unable';
  if (code === '強制休息' || code === 'forcedRest') return 'forcedRest';
  if (code === 'AB' || code === 'AC' || code === 'BC' || code === 'ABC') return code;
  return 'unable'; // 防禦性 fallback，理論上不會走到
}

export const SHIFT_CODE_EMOJI: Record<ShiftCodeCategory, string> = {
  A: '🌅', B: '☀️', C: '🌙',
  AB: '🌆', AC: '🔀', BC: '🌄', ABC: '🔥',
  dayoff: '🏖️', unable: '🚫', forcedRest: '🛌',
};

export const SHIFT_CODE_HEX: Record<ShiftCodeCategory, string> = {
  A: '#3b82f6', B: '#f59e0b', C: '#a855f7',
  AB: '#f43f5e',   // rose-500（剩晚上）
  AC: '#f97316',   // orange-500（剩下午）
  BC: '#ec4899',   // pink-500（剩早上）
  ABC: '#dc2626',  // red-600（整天沒空，用最強烈的顏色跟其他三個區分）
  dayoff: '#10b981', unable: '#334155', forcedRest: '#0891b2',
};

export const SHIFT_CODE_BUTTON_CLASSES: Record<ShiftCodeCategory, string> = {
  A: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400',
  B: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400',
  C: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400',
  AB: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400',
  AC: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400',
  BC: 'bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-900 text-pink-600 dark:text-pink-400',
  ABC: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400',
  dayoff: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400',
  unable: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
  forcedRest: 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-900 text-cyan-600 dark:text-cyan-400',
};

export const SHIFT_CODE_CELL_BG_CLASSES: Record<ShiftCodeCategory, string> = {
  A: 'bg-blue-50 dark:bg-blue-950/30', B: 'bg-amber-50 dark:bg-amber-950/30', C: 'bg-purple-50 dark:bg-purple-950/30',
  AB: 'bg-rose-50 dark:bg-rose-950/30', AC: 'bg-orange-50 dark:bg-orange-950/30',
  BC: 'bg-pink-50 dark:bg-pink-950/30', ABC: 'bg-red-50 dark:bg-red-950/30',
  dayoff: 'bg-emerald-50 dark:bg-emerald-950/30', unable: 'bg-slate-100 dark:bg-slate-800/60', forcedRest: 'bg-cyan-50 dark:bg-cyan-950/30',
};
```
色碼可以微調，但**不要用動態組字串**（`bg-${x}-50`）——Phase 23/25 已經踩過這個雷，Tailwind v4 JIT 掃描器看不到動態組出來的 class，一定要寫死完整字面值。

### 2-2. 組合班預設政策（對應 §0-2）

```ts
export const DEFAULT_SHIFT_POLICIES: Record<string, ShiftPolicy> = {
  'DAYOFF': 'train',
  'A': 'train', 'B': 'train', 'C': 'train',
  'AB': 'train',   // 改：剩晚上有空
  'AC': 'train',   // 改：剩下午有空
  'BC': 'train',   // 改：剩早上有空
  'ABC': 'restOrCardio',  // 不變：整天沒空
};
```

`SettingsPage.tsx` 的 `SHIFT_LABELS` 文案順手補上時段提示（非必要但建議一起做，幫助之後忘記語意時看得懂）：
```ts
const SHIFT_LABELS: Record<string, string> = {
  'A': '單班 A (早班)', 'B': '單班 B (中班)', 'C': '單班 C (晚班)',
  'AB': '組合班 AB（僅晚上有空）',
  'AC': '組合班 AC（僅下午有空）',
  'BC': '組合班 BC（僅早上有空）',
  'ABC': '組合班 ABC（整天沒空）',
};
```

### 2-3. `generateMonthPlan`：`simCursor`（數字）→ `pool`（Set），支援 `pinnedSlotId`

```ts
export type DayPlanSuggestion =
  | 'train' | 'restOrCardio' | 'cardio' | 'paused' | 'forcedRest' | 'noProgram' | 'past';

export interface PlannedDay {
  // ...既有欄位不動...
  pinConflict: boolean;   // 新增：這天有指定部位，但這一輪已經練過/找不到 slot，指定沒有生效
}
```

主迴圈變更（在 Phase 25 既有結構上疊加）：

```ts
// 迴圈開始前，取代原本的 `let simCursor = activeProgram ? activeProgram.cursor : 0;`
const pool = new Set<string>(
  activeProgram
    ? activeProgram.slots
        .filter(s => !activeProgram.completedSlotIdsThisLap.includes(s.id))
        .map(s => s.id)
    : []
);

function pickDefaultFromPool(): ProgramSlot | null {
  if (!activeProgram) return null;
  for (const s of activeProgram.slots) {
    if (pool.has(s.id)) return s;
  }
  return null;
}

// ...迴圈內，原本算 upcomingCategory/nextCategory 那段也要跟著從「線性 index」改成「從 pool 找」：
const upcomingSlot = pickDefaultFromPool();
const upcomingCategory = upcomingSlot ? classifySlotCategory(upcomingSlot, templatesById, exerciseMap) : 'other';
// nextCategory（規則 a 用，「明天是不是腿日」）：模擬「今天消耗掉 upcomingSlot 後，剩下池子的下一個」，
// 用一個複製的 pool 做 dry-run 即可，不用真的動到主要 pool。
```

主要分支邏輯（`else` 分支，非 past／非 paused／非 forcedRest）：

```ts
const hasExplicitShift = !!override && !override.isDayOff && !!override.shiftLetters && override.shiftLetters.length > 0;
let wantsTrain: boolean;
let pinConflict = false;
let resolvedPinSlot: ProgramSlot | null = null;

if (override?.pinnedSlotId && activeProgram) {
  const candidate = activeProgram.slots.find(s => s.id === override.pinnedSlotId);
  if (candidate && pool.has(candidate.id)) {
    resolvedPinSlot = candidate;
  } else {
    pinConflict = true; // 指定的部位這一輪已經練過，或課表裡找不到這個 slot 了
  }
}

if (resolvedPinSlot) {
  wantsTrain = true;
} else if (hasExplicitShift) {
  // ...既有邏輯不變...
} else if (remainingQuota <= 0) {
  wantsTrain = false;
} else if (urgent) {
  wantsTrain = true;
} else if (allOther) {
  wantsTrain = true;
} else {
  wantsTrain = upcomingCategory === 'chestBack';
  if (wantsTrain && (nextCategory === 'legs' || yesterdayWasLegsTrain)) {
    wantsTrain = false;
  }
}

// 規則 b：連續訓練上限，優先度最高，連「指定部位」都推翻得了
if (wantsTrain && consecutiveTrainDays >= MAX_CONSECUTIVE_TRAIN_DAYS) {
  wantsTrain = false;
  if (resolvedPinSlot) pinConflict = true;
}

if (wantsTrain && slots.length > 0) {
  suggestion = 'train';
  suggestedSlot = resolvedPinSlot ?? pickDefaultFromPool();
  if (suggestedSlot) {
    pool.delete(suggestedSlot.id);
    if (pool.size === 0) {
      // 模擬「這一輪跑滿了」：補滿下一輪的池子。純模擬用，不影響真正的 activeProgram.cycleCount
      // （cycleCount 只在真的完成訓練時，由 store 層的 completeSlot 更新）
      for (const s of activeProgram!.slots) pool.add(s.id);
    }
  }
  yesterdayWasLegsTrain = upcomingCategory === 'legs';
  daysSinceWeights = 0;
  consecutiveTrainDays += 1;
  if (!actualWorkout) trainedThisWeek += 1;
} else {
  consecutiveTrainDays = 0;
  yesterdayWasLegsTrain = false;
  if (activeProgram) {
    suggestion = upcomingCategory === 'legs' ? 'cardio' : 'restOrCardio';
  } else {
    suggestion = 'noProgram';
  }
  daysSinceWeights += 1;
}
```

`plannedDays.push({ ..., pinConflict })`。

**已知的實作彈性**：跟 Phase 25 一樣，這份 pseudocode 抓的是邏輯順序跟短路關係，不強制逐字照抄；`nextCategory`／dry-run pool 複製這類細節可以依實作習慣調整寫法。

---

## 3. Store 層變更：`cursor` 相關全部改走 `completedSlotIdsThisLap`

### 3-1. `src/store/program.ts`

- `createProgram()`：`cursor: 0` → `completedSlotIdsThisLap: []`。
- `updateProgram()`：原本 `slots` 變更時 clamp `cursor` 的那段（79-85 行），改成把 `completedSlotIdsThisLap` 過濾成只保留新 `slots` 裡還存在的 id：
  ```ts
  let completedSlotIdsThisLap = activeProgram.completedSlotIdsThisLap;
  if (updates.slots) {
    const validIds = new Set(updates.slots.map(s => s.id));
    completedSlotIdsThisLap = completedSlotIdsThisLap.filter(id => validIds.has(id));
  }
  ```
- `advanceCursor()` 整個換成 `completeSlot(slotId: string)`：
  ```ts
  completeSlot: async (slotId: string) => {
    const { activeProgram } = get();
    if (!activeProgram) return;
    try {
      const already = activeProgram.completedSlotIdsThisLap.includes(slotId);
      let completed = already
        ? activeProgram.completedSlotIdsThisLap
        : [...activeProgram.completedSlotIdsThisLap, slotId];
      let cycleCount = activeProgram.cycleCount;
      if (completed.length >= activeProgram.slots.length) {
        cycleCount += 1;
        completed = [];
      }
      const updatedProgram: TrainingProgram = {
        ...activeProgram,
        completedSlotIdsThisLap: completed,
        cycleCount,
        updatedAt: Date.now(),
      };
      await saveProgram(updatedProgram);
      set({ activeProgram: updatedProgram });
    } catch (error) {
      console.error('Failed to complete program slot:', error);
    }
  },
  ```
  `already` 這個防呆是為了：使用者重複練同一個這輪已經練過的 slot（例如手動點了已經完成的部位又開了一次訓練）不會被錯誤地重複計數、提早觸發跳輪。

### 3-2. `src/store/activeWorkout.ts`

`finishWorkout()`（162-191 行）：
```ts
// 如果有計畫，標記這個 slot 完成
if (activeWorkout.programId && activeWorkout.programSlotId) {
  const { activeProgram, completeSlot } = useProgramStore.getState();
  if (activeProgram && activeProgram.id === activeWorkout.programId) {
    await completeSlot(activeWorkout.programSlotId);
  }
}
```

---

## 4. UI 變更 A：`WorkoutLogger.tsx`——`currentSlot` 改用 `todayPlan`、循序列表改走 `pinnedSlotId`

1. **`currentSlot`（215 行）**：
   ```ts
   const currentSlot = todayPlan?.suggestedSlot ?? undefined;
   ```
   移除 `activeProgram.slots[activeProgram.cursor]` 這個算法——`todayPlan` 本來就是拿 `generateMonthPlan` 對「今天」算出來的結果（163-182 行既有邏輯），Phase 2-3 改完之後它自然就會吃到 `pinnedSlotId`／pool 邏輯，兩處不會再有算出不同結果的風險（呼應 Phase 25 §5 驗收標準 9 的既有不變量）。

2. **「循序列表」小藥丸按鈕（682-699 行）**：
   - `isCurrent` 判斷改成 `s.id === currentSlot?.id`。
   - `onClick` 從 `updateProgram({ cursor: idx })` 改成寫入今天的 `DayOverride.pinnedSlotId`：
     ```ts
     const handlePinToday = async (slotId: string) => {
       const nextPin = todayOverride?.pinnedSlotId === slotId ? undefined : slotId; // 再點一次＝取消指定
       await saveDayOverride({
         id: todayStr,
         shiftLetters: todayOverride?.shiftLetters,
         isDayOff: todayOverride?.isDayOff,
         paused: todayOverride?.paused,
         forcedRest: todayOverride?.forcedRest,
         rawLabel: todayOverride?.rawLabel,
         pinnedSlotId: nextPin,
       });
       await loadTodayOverride();
     };
     ```
   - 已經在 `activeProgram.completedSlotIdsThisLap` 裡的 slot（這一輪練過了），按鈕改成 `disabled`、加一個小提示文字（例如「這輪已練過」），避免點了也沒作用卻不知道為什麼。

3. **「今天該練」文字（837 行）**：`activeProgram.slots[activeProgram.cursor]?.label` → `currentSlot?.label`。

4. `todayPlan.pinConflict` 為 `true` 時（今天有指定部位但沒生效），在「今天該練」卡片附近補一行小字提示，例如「你指定的部位這輪已經練過了，改建議練 {currentSlot.label}」——不強制做成獨立卡片，跟現有 `restOrCardio`/`cardio` 分支的簡單文字提示風格一致即可。

---

## 5. UI 變更 B：`SchedulePage.tsx`

### 5-1. 組合班 `BUTTON_CONFIGS`（31-42 行）：`category` 從 `'combo'` 改成各自的值

```ts
{ label: 'AB', ..., category: 'AB' as const, display: '🌆 AB 班' },
{ label: 'AC', ..., category: 'AC' as const, display: '🔀 AC 班' },
{ label: 'BC', ..., category: 'BC' as const, display: '🌄 BC 班' },
{ label: 'ABC', ..., category: 'ABC' as const, display: '🔥 ABC 班' },
```
（emoji 對應 §2-1 的 `SHIFT_CODE_EMOJI`，可依喜好微調，不強制。）

### 5-2. `handleSingleSave`／`handleBatchSave`（297-324 行）：保留既有的 `pinnedSlotId`，不要被班別按鈕覆蓋掉

`saveDayOverride`／`bulkSaveDayOverride` 底層是 Dexie `put`（整筆覆蓋，不是 merge）。現在的 `handleSingleSave` 建 payload 時完全沒帶 `pinnedSlotId`，如果不修，**點任何一顆班別/訓練覆寫按鈕都會把當天已經指定好的訓練部位悄悄清空**。修法：從 `overridesByDate`（已經在元件裡，132-138 行）撈出當天既有紀錄，把 `pinnedSlotId` 帶過去：

```ts
const handleSingleSave = async (config: typeof BUTTON_CONFIGS[number]) => {
  if (selectedDateStr) {
    const existing = overridesByDate.get(selectedDateStr);
    await saveDayOverride({
      id: selectedDateStr,
      shiftLetters: config.value.shiftLetters,
      isDayOff: config.value.isDayOff,
      paused: config.value.paused,
      forcedRest: config.value.forcedRest,
      rawLabel: config.value.rawLabel,
      pinnedSlotId: existing?.pinnedSlotId,
    });
    setReloadTrigger((t) => t + 1);
    setSelectedDateStr(null);
  }
};
```

`handleBatchSave` 同理，但因為 `bulkSaveDayOverride` 是「一份 payload 套用到整批日期」，沒辦法讓每一天各自保留自己原本的 `pinnedSlotId`。這裡有個小決策，建議做法是**逐日保留**（改成迴圈個別 `saveDayOverride`，不再用 `bulkSaveDayOverride`）：
```ts
const handleBatchSave = async (config: typeof BUTTON_CONFIGS[number]) => {
  if (rangeEditDates && rangeEditDates.length > 0) {
    await Promise.all(rangeEditDates.map((d) => {
      const existing = overridesByDate.get(d);
      return saveDayOverride({
        id: d,
        shiftLetters: config.value.shiftLetters,
        isDayOff: config.value.isDayOff,
        paused: config.value.paused,
        forcedRest: config.value.forcedRest,
        rawLabel: config.value.rawLabel,
        pinnedSlotId: existing?.pinnedSlotId,
      });
    }));
    setReloadTrigger((t) => t + 1);
    setRangeEditDates(null);
  }
};
```
如果你覺得「批次改班別時，順便清掉那幾天的指定部位」也可以接受（批次編輯本來就是設定上班日程，跟單日訓練指定語意上没那麼相關），可以維持原本 `bulkSaveDayOverride` 不變、跳過這段——這個取捨我覺得兩種都合理，你自己選一個實作就好，不用特別回來討論。

### 5-3. 編輯面板新增第三分區「指定訓練部位」（530-562 行單日 sheet；598 行起批次 sheet 同理）

```tsx
{activeProgram && activeProgram.slots.length > 0 && (
  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">
      指定訓練部位
    </span>
    <div className="grid grid-cols-2 gap-2">
      {activeProgram.slots.map((slot) => {
        const alreadyDoneThisLap = activeProgram.completedSlotIdsThisLap.includes(slot.id);
        const isPinned = overridesByDate.get(selectedDateStr!)?.pinnedSlotId === slot.id;
        return (
          <button
            key={slot.id}
            type="button"
            disabled={alreadyDoneThisLap}
            onClick={() => handlePinSave(isPinned ? undefined : slot.id)}
            className={`py-3 text-center font-bold text-xs rounded-xl transition border ${
              alreadyDoneThisLap
                ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'
                : isPinned
                ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                : 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900 text-violet-600 dark:text-violet-400 hover:opacity-80'
            }`}
          >
            {slot.label}{alreadyDoneThisLap ? '（這輪已練過）' : ''}
          </button>
        );
      })}
    </div>
  </div>
)}
```
`handlePinSave`（新函式，比照 `handleSingleSave` 但只動 `pinnedSlotId`、保留其餘欄位，且**不關閉 sheet**——讓使用者可以同一次操作裡先選班別、再選部位，不用重開兩次）：
```ts
const handlePinSave = async (slotId: string | undefined) => {
  if (!selectedDateStr) return;
  const existing = overridesByDate.get(selectedDateStr);
  await saveDayOverride({
    id: selectedDateStr,
    shiftLetters: existing?.shiftLetters,
    isDayOff: existing?.isDayOff,
    paused: existing?.paused,
    forcedRest: existing?.forcedRest,
    rawLabel: existing?.rawLabel,
    pinnedSlotId: slotId,
  });
  setReloadTrigger((t) => t + 1);
};
```
（批次 sheet 要不要開放「指定訓練部位」是另一個取捨——把同一批好幾天全部指定成同一個部位通常不合理，這次規格建議**批次 sheet 不加這個分區**，指定訓練部位僅限單日 sheet。）

### 5-4. 月曆格：新增指定部位／衝突的視覺提示

- 有 `override?.pinnedSlotId` 時，格子左下角加一個小徽章（跟右上角既有的班別徽章對稱），例如顯示 `pinnedSlot.label` 的第一個字，顏色用跟 §5-3 按鈕一致的 violet。
- `plannedDay.pinConflict === true` 時，這個小徽章換一個警示樣式（例如加外框、改灰底、或疊一個 ⚠ 小圖示）——不強制指定具體做法，能讓使用者一眼看出「這天指定的部位沒生效」即可。

---

## 6. 已知限制／邊界情況

- `pool`（`generateMonthPlan` 模擬用）跟真正的 `activeProgram.completedSlotIdsThisLap` 一樣，只在單次月曆呼叫的視窗內往前推進；如果同一個月裡有好幾個「指定部位」疊在一起，模擬會照日期順序依序消耗池子，行為是確定性的（跟使用者實際點進度一致），不會有 race condition，但**如果使用者在月曆上先幫未來好幾天都指定好部位，之後又提早/延後實際完成訓練**，未來日期的模擬结果會在下次重新整理時自動用最新的 `completedSlotIdsThisLap` 重算，不需要手動處理。
- `pinnedSlotId` 一旦「這一輪已經練過」就自動判定衝突退回一般建議（§0-3），**不會**自動幫使用者往下一輪順延指定——如果衝突了，使用者要自己重新點一次指定（下一輪池子清空後，原本衝突的按鈕會恢復可點）。
- 只支援「指定到目前啟用中課表裡實際存在的 slot」；換課表、刪除 slot 後舊的 `pinnedSlotId` 會自然失效（找不到 slot，視同沒指定），不特別清資料庫裡的殘留值。
- `WorkoutLogger.tsx` 循序列表按鈕本次順便修掉的既有 bug（無條件 `advanceCursor` 導致跳選 slot 後其他 slot 被永久跳過/重複）不需要額外驗收，Phase 2-3 的資料模型改完後這個問題本來就不存在了。

---

## 7. 驗收標準

1. 月曆與編輯面板上，`A`/`B`/`C`/`AB`/`AC`/`BC`/`ABC`/`休假`/`今日無法`/`強制休息` 十種狀態視覺上兩兩都能分辨（不會有任兩種顏色相同）。
2. 全新環境（`shiftPolicyOverrides` 為空）下，登記 `AC` 或 `BC` 班、且沒有觸發「太久沒練」門檻時，`generateMonthPlan` 得出的建議應為 `'train'`；登記 `ABC` 應為 `'restOrCardio'`。
3. 給定 4-slot（拉/推/腿/手）課表、`completedSlotIdsThisLap` 為空、某天登記 `pinnedSlotId` 指向「腿」的 slot 且不衝突：該天 `suggestion === 'train'` 且 `suggestedSlot` 就是「腿」；`consumedSlot` 從池子移除後，同一輪接下來的日子不會再排到「腿」，直到跑完一輪重置。
4. 同上情境，若「腿」在指定日期之前，已經被前面某天（不管是預設順序排到、還是被另一個指定）消耗掉：該指定日應該 `pinConflict === true`，且 `suggestion`/`suggestedSlot` 退回沒有指定時的一般判斷結果。
5. 連續訓練天數已達 `MAX_CONSECUTIVE_TRAIN_DAYS`（3）上限的那天，即使有 `pinnedSlotId`，`suggestion` 仍應被規則 b 推翻成非 `'train'`，且 `pinConflict === true`。
6. 完整跑一輪（4 個 slot 依任意順序、透過 `completeSlot` 各完成一次，允許跳著完成）後，`cycleCount` 應該 `+1` 且 `completedSlotIdsThisLap` 清空；跑到一半（只完成 2-3 個）`cycleCount` 不應該變動。
7. `activeWorkout.programId`/`programSlotId` 對應到某個 slot 完成訓練後，`WorkoutLogger.tsx` 首頁「今天該練」卡片與同一天 `/schedule` 月曆算出的 `suggestedSlot` 應指向同一個 slot（延續 Phase 25 §7-9 的既有不變量，這次改用 `todayPlan.suggestedSlot` 取代 `activeProgram.slots[activeProgram.cursor]` 之後應該繼續成立）。
8. `SchedulePage.tsx` 點選班別/訓練覆寫按鈕存檔後，若當天原本已經有 `pinnedSlotId`，存檔後應該仍然保留（不會被悄悄清空）；反之，點選指定訓練部位存檔後，當天原本的班別登記也應該仍然保留。
9. Dexie migration（`programs` 表 `cursor` → `completedSlotIdsThisLap`）跑完後，既有使用者的課表進度（原本 `cursor` 之前的 slot）正確轉換成 `completedSlotIdsThisLap`，不會被重置成從頭開始。
10. `npm run lint` / `npm run build`（`tsc -b && vite build`）/ `npm run test`（vitest）全過。

---

## 8. 刻意不做

- **不做「跨輪預先指定」**——`pinnedSlotId` 只對「這一輪」有效，衝突了不會自動遞延到下一輪，使用者要自己重新指定。避免引入一個「這個指定到底屬於第幾輪」的額外狀態機，超出這次範圍。
- **不驗證非 4-slot（例如 5 分化自訂）課表下的指定訓練部位行為**——機制本身是通用的（純靠 slot id，不靠 label 字串比對），理論上任何 slot 數量都能用，但這次只用宗諺 8 週課表（剛好 4 個 slot）的實際情境驗收/寫測試。
- **不處理「指定的 slot 在課表裡消失」的資料清理**——舊 `pinnedSlotId` 失效後自然變成沒有指定的效果，不主動清空資料庫裡的殘留值（見 §6）。
- **批次編輯 sheet 不開放指定訓練部位**——語意上不合理（見 §5-3 末段），只有單日 sheet 有這個分區。
- **不改 `splitRotation.ts`／`getSplitRotationStatus`**——那是既有的「距離上次練 拉/推/腿/手 幾天」唯讀小工具，跟這次的寫入型指定機制是兩回事，不互相依賴，不用動。

---

## 9. 預期異動檔案

- `src/db/schema.ts`（`DayOverride.pinnedSlotId`、`TrainingProgram.completedSlotIdsThisLap` 取代 `cursor`、version 12 migration）
- `src/lib/shiftPlan.ts`（`ShiftCodeCategory` 拆分＋四張色表、`DEFAULT_SHIFT_POLICIES`、`PlannedDay.pinConflict`、`generateMonthPlan` pool 邏輯）
- `src/lib/__tests__/shiftPlan.test.ts`（對應驗收標準 2-6 的新測試）
- `src/store/program.ts`（`createProgram`/`updateProgram` 的 `completedSlotIdsThisLap`、`advanceCursor` → `completeSlot`）
- `src/store/activeWorkout.ts`（`finishWorkout` 呼叫 `completeSlot`）
- `src/pages/WorkoutLogger.tsx`（`currentSlot` 改用 `todayPlan`、循序列表改走 `pinnedSlotId`、`pinConflict` 提示文字）
- `src/pages/SchedulePage.tsx`（`BUTTON_CONFIGS` category 拆分、`handleSingleSave`/`handleBatchSave` 保留 `pinnedSlotId`、新增「指定訓練部位」分區與 `handlePinSave`、月曆格新徽章）
- `src/pages/SettingsPage.tsx`（`SHIFT_LABELS` 文案微調，選做）
- `docs/ROADMAP.md`（Phase 26 列與進度摘要，實作完成後更新）

---

## 10. 實作順序建議

1. `schema.ts`：新增 `pinnedSlotId`、`completedSlotIdsThisLap` 取代 `cursor`、寫 migration，先手動確認舊資料轉換正確（可以在瀏覽器 devtools 掛個現有測試資料跑一次 migration 檢查）。
2. `shiftPlan.ts`：先做 §2-1/§2-2 兩個純資料表變更（配色＋預設政策），這塊改完應該立刻能在畫面上看到 #1 #2 兩個問題被修掉，可以先跑一輪手動驗證。
3. `shiftPlan.ts` §2-3：`generateMonthPlan` 的 pool／`pinnedSlotId` 邏輯，配合新增的單元測試（驗收標準 2-6）。
4. `program.ts` + `activeWorkout.ts`：`completeSlot` 取代 `advanceCursor`。
5. `WorkoutLogger.tsx`：`currentSlot` 改用 `todayPlan`、循序列表改走 `handlePinToday`。
6. `SchedulePage.tsx`：`BUTTON_CONFIGS` 分色、`handleSingleSave`/`handleBatchSave` 保留 pin、新增「指定訓練部位」分區、月曆格新徽章。
7. `SettingsPage.tsx` 文案微調（選做）。
8. `npm run lint` + `npm run build` + `npm run test` 全過 → 交給 Claude review。
