# Phase 23（v1.17）班表獨立分頁＋每週目標次數＋今日無法快速鍵

> 觸發：2026-08-16 使用者在 Phase 22 上線後實測，發現「課表」頁預設（完全沒輸入班表資料時）月曆幾乎全部顯示「休息/有氧」，只有每 8 天強制跳出一次訓練——不是要的「一週練 4 個不同部位（胸/背/腿/肩）」。深入追查後定位成因：`shiftPlan.ts` 的 `classifyShiftCode` 對「完全沒登記」的日子，目前是查一個全域「未登記」政策開關（Settings 裡「休假 / 未登記」那一列，目前被設成「有氧/休息」），此開關只有練/不練二選一，本來就沒有「一週要練幾次」這個概念——就算改回「建議訓練」，沒登記的日子也只會變成天天都練，一樣不是要的 4 天/週。
>
> 同一輪又提出三個進一步需求：①把班表登記/月曆從「課表」頁獨立成一個分頁；②登記介面改成像 App Store 的「班表小幫手」那樣，打開就是一排可以直接單點的 A/B/C/AB 等等班別按鈕；③加一個「今日無法」快速鍵，選了就直接跳過所有判斷、當天一律休息。
>
> 本文＝規格，建立在 Phase 21（`dayOverrides` 資料層、`shiftPlan.ts` 核心算法）與 Phase 22（長按拖曳批次編輯手勢）之上，這次**改算法＋搬 UI＋新增一個 Settings 欄位，不改 `dayOverrides` schema**。依工作協議（[[gymtracker-working-agreement]]）由你自己動手寫 code。

---

## 0. 核心設計決策

1. **新增「每週目標訓練次數」（`weeklyTargetSessions`，預設 4）取代原本「未登記日」的全域二選一開關。**
   - 三種日子分開處理，權責不同：
     - **完全沒登記，或明確標成「休假」**：交給每週目標次數決定——這週（週日起算）目前已經有幾天被排成訓練，還沒到目標就排訓練，到了目標就排休息/有氧。這是本次真正要修的預設節奏。
     - **明確登記班別（A/B/C/AB/AC/BC/ABC）**：維持 Phase 21 原邏輯不變，查 Settings 的班別對照表（單班預設練、疊班預設休，可調）；疊班休太久（`restOverrideDays`，預設 7 天）一樣會被強制排訓練，這條安全網不動。
     - **今日無法（沿用既有 `paused` 欄位）**：不管哪一種情況都直接跳過，一律休息，見 §0-3。
   - **為什麼**：原本「未登記＝查一個全域 train/restOrCardio 開關」的設計，是從「有排班的工作」角度出發（沒班就是休假，休假預設可以練），完全沒有「一週練幾次」這個維度；實際需求（一週 4 個部位）是頻率目標，不是班別判斷，兩件事本來就該分開算，不是調一個開關能解決的。
   - Settings 的「班別建議對照表」拿掉「休假 / 未登記」那一列（語意被取代），改成在同一區塊新增「每週目標訓練次數」NumberStepper（1–7，預設 4），跟既有「太久沒重量訓練門檻」放一起。
   - 週的起點抓「週日」，跟月曆本身「日一二三四五六」的欄位順序一致，畫面上數得出「這週已經幾天有排」。
   - 月份邊界的已知限制：一週有可能橫跨兩個月（例如 8/30~9/5），會用 `completedWorkouts`（本來就是抓全部歷史、不限當月）回頭算「這個月開始前，這週已經練過幾次」來墊底，讓月初幾天的目標次數起算正確；但「本週還沒登記的天數不夠湊到目標」時不會跨週補回來，就照實際天數算，不做額外的補償（見 §6）。

2. **登記介面改成一鍵預設按鈕（仿「班表小幫手」風格），不再是「多選班別→分開按休假→分開勾暫停→再按儲存」的四步表單。**
   - 點開任一天（或長按拖曳選一段範圍），彈出的面板直接列出 9 個按鈕：`A`／`B`／`C`／`AB`／`AC`／`BC`／`ABC`／`休假`／`今日無法`，**點哪個就立刻存檔＋關閉面板，不再需要額外按「儲存」**。
   - 「清除登記」保留，但改成面板角落一個次要的文字按鈕（不是九宮格裡的一個選項）——「清除」是刪掉這天的登記讓它變回「沒登記」，跟「選今日無法」（寫入 `paused: true`，一筆明確登記）語意不同，不能混在同一組按鈕裡以免誤會兩者等價。
   - 單日面板、批次面板（長按拖曳那個）共用同一組九宮格＋清除的介面，只有標題文字不同（單日＝日期；批次＝「編輯 X ~ Y（N 天）」），沿用 Phase 22 已經定好的「批次是整段覆寫、不回填」慣例。
   - **為什麼**：現在的表單要三個步驟（選班別按鈕、再看要不要按休假、再勾暫停、最後按儲存）才能登記一天，手動點完整個月的班表會很痛苦；「班表小幫手」這類 App 能讓人一天一秒存檔，是因為選項是攤平的、單點即存，這次照這個方向做。
   - 為了容納「今日無法」，`paused` 欄位的 UI 顯示文字從「暫停」統一改成「今日無法」（月曆格子裡的 label、面板按鈕都用同一個詞，避免以為是兩個不同東西）。

3. **「今日無法」直接沿用既有 `DayOverride.paused` 欄位，不新增 schema 欄位。**
   - 點下去等同 `saveDayOverride({ id: dateStr, paused: true, shiftLetters: undefined, isDayOff: undefined })`——現有 `generateMonthPlan` 本來就把 `paused` 判斷放在最前面，直接得出 `suggestion = 'paused'`，完全不會走班別分類或每週目標次數那條路，天生就符合「跳過不用計算，一律直接休息」；這次不用改這段判斷順序。
   - 跟「休假」的差異：「休假」是每週目標次數會納入計算的「自由日」（沒班可能想練也可能不想，交給次數決定）；「今日無法」是明確講「今天不管排到什麼都不練」，兩者故意分開，不合併。

4. **班表月曆搬到獨立分頁，不再掛在「課表」頁 `activeProgram &&` 底下。**
   - 新路由 `/schedule`，底部導覽新增第 9 個分頁「班表」（圖示另外找一個跟現有 8 個不重複的，例如行事曆格線圖示）。
   - 「課表」頁（`/plan`，`ProgramGuide.tsx`）**只保留**宗諺 8 週課表瀏覽／匯入那塊（目前檔案 450 行之後的部分），月曆、兩個編輯面板、班表相關 state／effect／pointer 事件處理**整段搬到新檔案**（`shiftPlan.ts` 裡的純函式全部不動，只是換一個 UI 呼叫端）。
   - 新分頁一樣需要「有啟用中的訓練計畫」才能顯示月曆（`suggestedSlot` 要吃 `activeProgram.slots`）；沒有的話顯示提示文字＋一個按鈕連去 `/plan` 匯入，不要空白一片。
   - **為什麼獨立分頁**：要天天/每週固定回來登記班表，混在「課表」頁（主要拿來瀏覽 8 週課表細節的頁面）裡面找起來不順；獨立出來之後也才能做成 §0-2 的「打開就是登記介面」那種單一用途頁面體感。
   - 底部導覽塞第 9 個圖示，目前 8 個已經排得很滿（`justify-between` 平分寬度），這次一併把 `BottomNav.tsx` 的容器改成可以橫向捲動（`overflow-x-auto` + 每個項目給固定最小寬度），不然 9 個圖示會被擠到看不清楚。這是連帶的小改動，寫在同一批裡。

5. **九宮格按鈕與月曆角落徽章改成分類配色＋emoji，不再是純文字。**
   - 六個類別，每類一個固定色＋一個 emoji（顏色只分類別，不分細項——AB/AC/BC/ABC 四種疊班共用同一個顏色，靠按鈕上的文字分辨是哪個組合，不用四種不同色，避免整組按鈕變成一排辨識不出邏輯的彩虹）：

     | 類別 | 顏色（Tailwind 標準色階，避免 `slate-850` 這種會被 v4 靜默吃掉的非標準色階） | emoji |
     |---|---|---|
     | 單班 A（早班） | `blue-500` | 🌅 |
     | 單班 B（中班） | `amber-500` | ☀️ |
     | 單班 C（晚班） | `purple-500` | 🌙 |
     | 疊班 AB／AC／BC／ABC | `rose-500` | 🔥 |
     | 休假 | `emerald-500` | 🏖️ |
     | 今日無法 | `slate-700`（deliberately 中性偏暗，不用彩色，跟其他「還能練/還能休」的分類明顯區隔開，一眼看出「這天直接跳過」） | 🚫 |

   - 九宮格按鈕：底色用該類別色的淺色版（例如 `bg-blue-50 dark:bg-blue-950/40`、文字用 `text-blue-600 dark:text-blue-400`，比照現有 A/B/C 按鈕已經在用的 `bg-indigo-50`/`text-indigo-600` 寫法，只是把 indigo 換成分類色），按鈕文字＝emoji＋原本的代碼文字（例如「🌅 A 班」）。
   - 月曆格子右上角的徽章（現有 `badgeText`，目前是純灰色小字）改成該分類色的實心圓角小標籤（白字＋分類色底），角落一眼就能看出這天是哪一類，不用點進去看。
   - **為什麼**：這是「顏色對比明顯、圖文並茂」這個偏好最直接的落地點——月曆本身是這個 App 使用頻率最高的畫面之一，六色分類徽章＋emoji 讓整個月的班表節奏（哪幾天疊班、哪幾天休假、哪幾天直接跳過）不用一格一格點開就能掃過去看懂。
   - 刻意不做的：不把整個格子背景染色（月曆格子背景已經保留給 Phase 22 的「今天」「拖曳選取中」互動狀態用，兩套視覺疊在一起會混淆哪個是「班別分類」哪個是「你正在操作的狀態」）；不幫 AB/AC/BC/ABC 四種疊班分別配色（見上，避免顏色過多失去分類意義）。

---

## 1. 演算法變更（`src/lib/shiftPlan.ts`）

`generateMonthPlan` 內部迴圈改動，其餘輸入/輸出介面不變（`GenerateMonthPlanInput` 新增一個欄位）：

```typescript
export interface GenerateMonthPlanInput {
  // ...既有欄位不變...
  weeklyTargetSessions: number;   // 新增：settings?.weeklyTargetSessions ?? 4
}
```

核心邏輯改寫（取代原本整段委派給 `classifyShiftCode` 的單一分支）：

```typescript
function getWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - date.getDay()); // 回推到當週週日
  return getLocalDateStr(date.getTime());
}

// 迴圈開始前：用 completedWorkouts 墊底「本月第一天所在那週、月初之前已經練過幾次」
let currentWeekStart = dateStrings.length > 0 ? getWeekStart(dateStrings[0]) : '';
let trainedThisWeek = 0;
if (currentWeekStart && dateStrings.length > 0) {
  for (const w of completedWorkouts) {
    const ds = getLocalDateStr(w.startedAt);
    if (ds >= currentWeekStart && ds < dateStrings[0]) {
      trainedThisWeek += 1;
    }
  }
}

// 迴圈內，每一天最前面先做週次切換：
for (const dateStr of dateStrings) {
  const weekStart = getWeekStart(dateStr);
  if (weekStart !== currentWeekStart) {
    currentWeekStart = weekStart;
    trainedThisWeek = 0;
  }
  // ...isPast/isToday/override 照舊算...

  if (actualWorkout) {
    trainedThisWeek += 1; // 不管過去或今天，有實際紀錄就算這週練過一次
  }

  if (isPast) {
    suggestion = 'past';
  } else if (override?.paused) {
    suggestion = 'paused';
    daysSinceWeights += 1;
  } else {
    const hasExplicitShift = !!override && !override.isDayOff && !!override.shiftLetters && override.shiftLetters.length > 0;
    let policy: ShiftPolicy;

    if (hasExplicitShift) {
      const key = [...override!.shiftLetters!].sort().join('');
      policy = policyOverrides?.[key] || DEFAULT_SHIFT_POLICIES[key] || 'train';
      if (policy === 'restOrCardio' && daysSinceWeights >= restOverrideDays) {
        policy = 'train';
      }
    } else {
      // 沒登記，或明確標「休假」：交給每週目標次數
      policy = trainedThisWeek < weeklyTargetSessions ? 'train' : 'restOrCardio';
    }

    if (policy === 'train' && slots.length > 0) {
      suggestion = 'train';
      suggestedSlot = slots[simCursor % slots.length];
      simCursor += 1;
      daysSinceWeights = 0;
      trainedThisWeek += 1;
    } else {
      suggestion = activeProgram ? 'restOrCardio' : 'noProgram';
      daysSinceWeights += 1;
    }
  }

  plannedDays.push({ /* 不變 */ });
}
```

`classifyShiftCode` 這個既有匯出函式保留（Settings 頁的班別對照表繼續用來顯示目前政策），但 `generateMonthPlan` 內部改成上面這段直接判斷，不再整段委派給它——因為 `classifyShiftCode` 原本設計是「沒登記也查 DAYOFF 政策」，這次「沒登記」已經改用完全不同的每週次數邏輯，兩條路徑不能再共用同一個函式。

`getWeekStart` 一起匯出＋補單元測試（純函式，容易獨立驗證）：至少要測「跨月第一週墊底」情境，例如「8/30（週六）練過一次、9 月從週日 8/31 開始算是新的一週，9/1~9/3 都沒登記、目標 4 次」時 `trainedThisWeek` 的起算是否正確（8/30 屬於哪一週要先算清楚——8/30 是週日還是週六會影響它算進哪個 `weekStart`，寫測試時用實際月曆核對，不要用猜的）。

另外新增一個小的分類配色查表函式，給 §0-5 的九宮格按鈕跟月曆徽章共用，避免同一份顏色表在兩個 JSX 檔案（`SchedulePage.tsx` 的按鈕、同檔案的月曆格子）各寫一份、以後改色要改兩處：

```typescript
export type ShiftCodeCategory = 'A' | 'B' | 'C' | 'combo' | 'dayoff' | 'unable';

export function classifyShiftCodeCategory(code: string): ShiftCodeCategory {
  if (code === 'A' || code === 'B' || code === 'C') return code;
  if (code === '休假') return 'dayoff';
  if (code === '今日無法') return 'unable';
  return 'combo'; // AB/AC/BC/ABC 一律歸這類
}

export const SHIFT_CODE_EMOJI: Record<ShiftCodeCategory, string> = {
  A: '🌅', B: '☀️', C: '🌙', combo: '🔥', dayoff: '🏖️', unable: '🚫',
};

// 月曆角落徽章用：比照 locationStyle.ts 的 getLocationColor 寫法，回傳 hex 直接進 inline style。
export const SHIFT_CODE_HEX: Record<ShiftCodeCategory, string> = {
  A: '#3b82f6',      // blue-500
  B: '#f59e0b',      // amber-500
  C: '#a855f7',       // purple-500
  combo: '#f43f5e',   // rose-500
  dayoff: '#10b981',  // emerald-500
  unable: '#334155',  // slate-700
};

// 九宮格按鈕用：完整 Tailwind class 字面值查表，不要用樣板字串拼 `bg-${color}-50` 這種動態 class——
// Tailwind v4 的 JIT 掃描器只認得原始碼裡「完整寫出來」的 class 名稱，拼出來的字串掃描不到，
// 等於顏色在 build 之後完全不會生效（同一類雷已經在 ROADMAP §6 記過一次，這次先講在前面）。
export const SHIFT_CODE_BUTTON_CLASSES: Record<ShiftCodeCategory, string> = {
  A: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400',
  B: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400',
  C: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400',
  combo: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400',
  dayoff: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400',
  unable: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300',
};
```

三張查表都用 `classifyShiftCodeCategory` 的回傳值當 key，`SchedulePage.tsx` 的按鈕跟月曆徽章共用同一份，不要各自寫一份色碼。

---

## 2. Settings 變更（`src/pages/SettingsPage.tsx`, `src/db/schema.ts`）

- `Settings.weeklyTargetSessions?: number` 新增到 `schema.ts`（不需要 Dexie migration，`Settings` 是單例設定物件，新增選填欄位不用升版本）。
- 「班表與訓練建議設定」區塊：`SHIFT_LABELS` 拿掉 `'DAYOFF'` 那一列（不再是可調開關）；「太久沒重量訓練門檻」NumberStepper 旁邊加一個「每週目標訓練次數」NumberStepper（`value={settings.weeklyTargetSessions ?? 4}`，範圍 1–7）。

---

## 3. 新分頁（`src/pages/SchedulePage.tsx`，新檔案）

把 `ProgramGuide.tsx` 目前的以下部分整段搬進這個新檔案：

- state：`currentMonth`／`now`／`selectedDateStr`／`dayOverrides`／`completedWorkouts`／`allExercises`／`reloadTrigger`／`editShiftLetters`／`editIsDayOff`／`editPaused`／`dragStartDateStr`／`dragEndDateStr`／`isRangeSelecting`／`rangeEditDates`
- effect：載入 overrides/workouts/exercises 那個、`now` 的 focus/visibilitychange 監聽
- 所有 `useMemo`：`todayDateStr`／`calendarGrid`／`dateStrings`／`overridesByDate`／`exerciseMap`／`plannedDays`／`plannedDayMap`
- pointer 事件系列：`handlePointerDown/Move/Up/Cancel`
- JSX：月曆本體＋單日編輯面板＋批次編輯面板

介面改成 §0-2 的九宮格單點即存：

- 面板不再有「儲存」按鈕；9 個按鈕（`A`／`B`／`C`／`AB`／`AC`／`BC`／`ABC`／`休假`／`今日無法`）任一顆 `onClick` 直接呼叫 `saveDayOverride`（單日）或 `bulkSaveDayOverride`（批次），然後關閉面板。
- `今日無法` 按鈕寫入 `{ paused: true, shiftLetters: undefined, isDayOff: undefined }`。
- 月曆格子與面板裡，`paused` 對應顯示文字統一改成「今日無法」（原本寫死的 `'暫停'` 字串一起改）。
- 沒有 `activeProgram` 時，顯示「還沒有啟用中的訓練計畫」提示卡＋「前往課表匯入」按鈕（連去 `/plan`），不渲染月曆本體。
- 九宮格按鈕、月曆角落徽章都改用 §1 新增的 `classifyShiftCodeCategory` + `SHIFT_CODE_EMOJI` / `SHIFT_CODE_HEX` / `SHIFT_CODE_BUTTON_CLASSES` 三張查表（細節見 §0-5），不要另外重寫一份顏色判斷。

---

## 4. 路由與導覽

- `App.tsx` 新增 `<Route path="/schedule" element={<SchedulePage />} />`（比照 `/plan` 用 `lazy` + `Suspense`）。
- `BottomNav.tsx`：
  - 新增第 9 個 `NavItem`（`to="/schedule"`、`label="班表"`、行事曆格線圖示），放在「課表」和「歷史」之間（順序：訓練→課表→**班表**→歷史→動作庫→進度→追蹤→1RM→設定）。
  - 外層容器 `flex justify-between` 改成 `flex overflow-x-auto` + 每個 `NavItem` 給 `shrink-0 min-w-[XX]`，讓 9 個項目在窄螢幕上可以橫向捲動而不是被硬擠爆。

---

## 5. 驗收標準

1. 完全沒有任何一天登記過的情況下，設定「每週目標訓練次數 = 4」，打開任一個月份，一週（週日到週六）內剛好有 4 天被排成訓練、其餘排休息/有氧，且哪幾天是訓練日是從週日開始依序往下排（不是隨機跳）。
2. 把某天明確登記成「AB」，即使當週訓練次數還沒到 4，那天還是顯示休息/有氧（明確班別優先於每週次數）；疊班休太久一樣會被 `restOverrideDays` 安全網強制排訓練。
3. 點「今日無法」，那天不管每週次數還是安全網都蓋不過它，一律休息；月曆格子跟編輯面板都顯示「今日無法」文字（不再顯示「暫停」）。
4. 點開單日或長按拖曳範圍後跳出的面板，點任一個班別/休假/今日無法按鈕，立刻存檔關閉面板，不需要再按別的「儲存」鍵；「清除」是獨立的次要按鈕，行為維持刪除登記。
5. 「班表」在底部導覽是獨立的第 9 個分頁；9 個圖示在手機窄螢幕上可以橫向滑動看到全部，不會擠壓變形或被裁切。
6. 「課表」頁（`/plan`）不再顯示月曆，只剩宗諺 8 週課表瀏覽/匯入；原本月曆相關的 state/effect/handler 從 `ProgramGuide.tsx` 完全移除，不是隱藏。
7. 用一個實際跨月的例子驗證墊底邏輯不是空講：假設某週從週日開始橫跨月底/月初，月底那天登記過一次訓練、新月份頭幾天都沒登記，目標次數 4 的情況下，新月份第一天看到的「這週已練次數」要包含月底那一次，不是從 0 起算。
8. 九宮格按鈕六個類別（A/B/C/疊班/休假/今日無法）在淺色與深色模式下都要有清楚可辨的底色＋emoji，不是純文字；月曆格子右上角的徽章也要顯示同一套分類色（不再是純灰色小字）。實際在瀏覽器切一次深色模式確認顏色沒有消失（用查表拼出來的 class 名稱在 build 後可能整組不生效，肉眼確認比看 build log 準）。
9. `eslint .`／`npm run build`／`vitest` 全過，`getWeekStart` 與新的每週次數分支要有對應單元測試（含驗收標準 7 那個跨月墊底情境）。

---

## 6. 這版刻意不做

- 不做「這週沒練滿，下週自動多排幾天補回來」的跨週補償——沒登記的自由日不夠湊到目標，這週就是練得比目標少，不額外調整下週的目標次數。
- 不做「每週目標次數」依 8 週課表的減量週/測試週自動調整（例如 W4/W8 少排一點）——目標次數是全域單一設定，這次不做每週不同值。
- 不做「今日無法」的歷史統計彙總畫面（例如「這個月請了幾次今日無法」）——只做記錄與跳過計算本身。
- 底部導覽超過 9 個之後要不要改成「更多」收合選單，這次先用橫向捲動撐過去，不做選單重構。

---

## 7. 預期動到的檔案

```
src/db/schema.ts             Settings 新增 weeklyTargetSessions?: number（免 migration）
src/lib/shiftPlan.ts         generateMonthPlan 改寫每週次數分支＋新增 getWeekStart／classifyShiftCodeCategory／SHIFT_CODE_EMOJI／SHIFT_CODE_HEX／SHIFT_CODE_BUTTON_CLASSES（含單元測試）
src/pages/SchedulePage.tsx   新檔案：月曆＋單日/批次編輯面板（九宮格單點即存＋分類配色版），從 ProgramGuide.tsx 整段搬過來
src/pages/ProgramGuide.tsx   移除月曆與班表相關的全部 state/effect/handler/JSX，只剩 8 週課表瀏覽
src/pages/SettingsPage.tsx   拿掉「休假/未登記」那一列，新增「每週目標訓練次數」NumberStepper
src/App.tsx                  新增 /schedule 路由
src/components/BottomNav.tsx 新增第 9 個分頁＋改橫向捲動
docs/ROADMAP.md              完工後補一列 Phase 23（v1.17）
```

---

## 8. 實作順序建議

1. `shiftPlan.ts`：先加 `getWeekStart` + 改 `generateMonthPlan` 的每週次數分支，補單元測試（含跨月墊底情境），這塊是純函式最容易獨立驗證正確性。
2. `schema.ts` + `SettingsPage.tsx`：加 `weeklyTargetSessions` 欄位與 UI，拿掉舊的「休假/未登記」列。
3. 建 `SchedulePage.tsx`，把 `ProgramGuide.tsx` 的月曆／面板整段搬過去，面板改九宮格單點即存（含「今日無法」按鈕、`paused` 顯示文字改掉）。
4. `ProgramGuide.tsx` 清掉搬走的部分，確認剩下的 8 週課表瀏覽/匯入功能不受影響。
5. `App.tsx` 加路由、`BottomNav.tsx` 加分頁＋改橫向捲動。
6. `npm run build` + `vitest` + `eslint .` 全過 → 交給 Claude review。
