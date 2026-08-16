# Phase 21（v1.15）班表感知的月訓練計畫自動生成

> 觸發：2026-08-16 使用者需求——把每月排班（截圖：A=8:00-12:00、B=13:30-17:30、C=17:30-21:00，可組合成 AB/AC/BC/ABC，或「休假」）登記進 GymTracker，讓 App 根據班表**自動生成當月剩餘天數的訓練建議**：
> 1. AB 這種累班傾向休息或有氧，真的太久沒重量訓練才照排訓練部位。
> 2. 訓練跟之前設計好的菜單一樣，一週內胸/背/腿/肩都練過一次即可，不用剛好卡週一到週日。
> 3. 班表改了，存檔後訓練日程要同步更新。
> 4. 今天有急事/下雨，訓練可以手動暫停。
>
> 本文＝規格。**依工作協議，由你自己動手寫 code**（[[gymtracker-working-agreement]]；除非你看完想直接說「幫我改好」）。

---

## 0. 核心設計決策（先講清楚「為什麼這樣設計」，你覺得不對請直接說）

1. **月計畫是「純函式即時算出來的推導結果」，不落地存檔。** 真正要存的只有「每天的班別代碼」和「手動暫停」這兩件事（見 §1 的 `DayOverride`）。「今天該練哪個部位／該休息」永遠是根據（班表 × 目前 `activeProgram.cursor` × 已完成訓練歷史）現場算出來，不會另外存一份「計畫」到 DB。
   - **為什麼**：這樣「按更新」（需求 3）幾乎不用額外寫程式——班表改完存檔，畫面本來就是 `useMemo` 現算，自動就是新結果，不會有「班表改了但計畫沒跟著動」這種舊資料不同步的 bug（這類 bug 這個專案的雲端同步歷史上已經出現過好幾次，見 `docs/ROADMAP.md` §6）。
   - 也代表：`TrainingProgram`/`cursor` 完全不用改 schema。月計畫只是「借用」目前 cursor 的值往前推算，從不回寫——cursor 依然只在真的完成一次訓練時才前進（`finishWorkout` 既有邏輯不用動）。你哪天沒照建議做（多練一天或漏一天），下次打開月曆會用「當下真實的 cursor」重新往前推，不會累積誤差，也不需要任何「重新規劃」按鈕。
2. **沿用現有 `TrainingProgram.slots`，不新增一套寫死的「胸背腿肩」分類。** 月計畫產生器只決定「哪幾天要練」，真的要練的時候永遠是「`activeProgram` 的下一個 slot」——不管那個 slot 叫拉/推/腿/手、胸/背/腿/肩，還是你自己取的名字。沒有 `activeProgram` 時，這個功能整個不出現，並提示先去課表頁建立/匯入計畫。
3. **班別 →「練 or 休息/有氧」的對照做成設定頁可調的表格，不是寫死規則。** 你原話只點名「AB」是累班，但實際組合還有 AC、BC、ABC，這幾種我沒把握用猜的（AC 中間空整個下午、BC/ABC 是連上到晚上），所以做成一張小表格，預設值見 §2，隨時可調、不用改 code。
4. **不做「自動匯入」班表 App 的資料。** 截圖是別人 App 的畫面，沒有可串接的公開資料，班表就手動輸入到 GymTracker 自己的月曆，照截圖的樣子登記代碼即可。

---

## 1. 資料模型：新增 `dayOverrides` 表

每個「日期」一筆，只記兩件事——當天班別代碼、是否手動暫停。

```typescript
// db/schema.ts 新增
export type ShiftLetter = 'A' | 'B' | 'C';

export interface DayOverride {
  id: string;                     // 'YYYY-MM-DD'（本地時區日期字串，直接當主鍵，比照 History.tsx 既有的 dateStr 慣例）
  shiftLetters?: ShiftLetter[];   // 當天有上的班，例如 ['A','B']；沒填/空陣列＝沒登記
  isDayOff?: boolean;             // 明確標記「休假」（截圖那個圖示），與 shiftLetters 二選一，UI 互斥
  rawLabel?: string;              // 選填，原始顯示文字例如 'AC早'——只用來顯示，不參與判斷邏輯
  paused?: boolean;               // 手動暫停訓練建議（急事/下雨），跟班別無關，任何一天都能單獨勾
  updatedAt: number;
  deletedAt?: number;             // 沿用既有軟刪除慣例
}
```

- `shiftLetters` 用陣列而非 `'AB'` 這種字串，比對時排序後 `.join('')` 當 key 去查 §2 對照表，不用擔心輸入順序（'AB' vs 'BA'）。
- Dexie migration：`version(11).stores({ dayOverrides: 'id, updatedAt' })`。`id` 已經是日期字串，天然唯一，不需要另外的日期索引。
- **加入雲端同步**（比照 `bodyMetrics`/`programs` 既有模式，這張表資料量很小）：
  - `src/sync/sync.ts`：`SyncTable` 加 `'dayOverrides'`；`AnyDexieTable` 加一行；`pushChangedSince`／`pushAllToCloud`／`fullSync`／`deltaSync` 四個函式各加一行（照抄 `bodyMetrics` 那幾行改表名即可，這張表不需要像 `workouts` 那樣的 `status==='completed'` 過濾）。
  - `src/lib/backup.ts`：`BackupData` 加 `dayOverrides?: DayOverride[]`；export/import 各加對應幾行。
  - **這四個地方漏改任何一處，就會是「A 裝置改了班表，B 裝置看到舊的」——這正是這個 repo 之前踩過好幾次的同一種 bug（ROADMAP §6-5、Phase 15 掉資料修復），review 時我會逐一核對。**

CRUD（新檔 `src/db/dayOverrides.ts`，比照 `src/db/bodyMetrics.ts` 的簡單寫法）：

```typescript
export async function getDayOverride(dateStr: string): Promise<DayOverride | undefined>;
export async function listDayOverridesInRange(startDateStr: string, endDateStr: string): Promise<DayOverride[]>;
export async function saveDayOverride(input: Omit<DayOverride, 'updatedAt'>): Promise<void>;
export async function clearDayOverride(dateStr: string): Promise<void>;  // 軟刪除，登記錯了要清掉重打
```

---

## 2. Settings 新增：班別對照表 + 太久沒練門檻

`Settings` 加兩個欄位（`src/db/schema.ts`）：

```typescript
export type ShiftPolicy = 'train' | 'restOrCardio';

export interface Settings {
  // ...既有欄位不變
  shiftPolicyOverrides?: Record<string, ShiftPolicy>;  // key 是正規化後的班別代碼，例如 'AB'、'ABC'、'DAYOFF'
  restOverrideDays?: number;    // 「太久沒重量訓練」的門檻天數，預設 7
}
```

預設對照表放在 `src/lib/shiftPlan.ts` 的常數（不要塞進 `DEFAULT_SETTINGS`——這樣「從沒存過設定」跟「使用者把某一格清空回預設」讀的是同一份預設值，不用兩處各維護一份）：

| 代碼 | 預設分類 | 理由 |
|---|---|---|
| `DAYOFF`（休假／完全沒登記） | `train` | 整天有空，正常排課表；沒登記也先當作可訓練，避免月底前一片空白建議 |
| `A` / `B` / `C`（單班） | `train` | 只上半天，下班後還有訓練時間 |
| `AB` | `restOrCardio` | 你原話點名的累班（8:00–17:30 連上，只留晚上） |
| `AC` | `restOrCardio` | 中間雖有空檔，但頭尾拉到 21:00，先當累班 |
| `BC` | `restOrCardio` | 13:30–21:00 連上，跟 AB 同等級 |
| `ABC` | `restOrCardio` | 全天班，最累 |

> ⚠️ 這張表只有 `AB` 是你親口說的，`AC`/`BC`/`ABC` 是我依上班時數推測的分級。等你看到跑出來的月曆覺得不對，直接在設定頁那張表調（或跟我說要改預設值），不用動邏輯 code。「完全沒登記」目前跟「休假」共用同一個 `DAYOFF` 鍵，這是刻意簡化。

Settings 頁新增一區塊（比照現有「訓練地點管理」卡片樣式）：「班別 → 訓練建議」固定 7 列（休假/A/B/C/AB/AC/BC/ABC）的 train/restOrCardio 切換 ＋「太久沒重量訓練」的 `NumberStepper`（比照 `defaultRestSeconds` 寫法）。

---

## 3. 核心演算法：`src/lib/shiftPlan.ts`

全部純函式，方便寫測試，是整個功能的心臟。

```typescript
export type DayPlanSuggestion = 'train' | 'restOrCardio' | 'paused' | 'noProgram' | 'past';

export interface PlannedDay {
  dateStr: string;
  isPast: boolean;
  isToday: boolean;
  override: DayOverride | null;
  actualWorkout: Workout | null;      // 當天已有紀錄（completed 或 active）就帶進來；有值時 UI 顯示優先權高於 suggestion
  suggestion: DayPlanSuggestion;
  suggestedSlot: ProgramSlot | null;  // 只有 suggestion === 'train' 才有值
}

export function classifyShiftCode(
  override: DayOverride | null | undefined,
  policyOverrides: Record<string, ShiftPolicy> | undefined,
): ShiftPolicy;
// 沒有 override、或 isDayOff、或 shiftLetters 為空 → 查 'DAYOFF' 鍵；
// 否則把 shiftLetters 排序 join 成 key（'A'|'B'|'C'|'AB'|'AC'|'BC'|'ABC'）去查 policyOverrides，
// 查不到 fallback 預設表；預設表也沒有就回傳 'train'。

export interface GenerateMonthPlanInput {
  dateStrings: string[];              // 要顯示的整個月曆範圍（含當月已過去的日期），由小到大排序
  activeProgram: TrainingProgram | null;
  completedWorkouts: Workout[];       // listCompletedWorkouts() 的結果
  activeWorkoutToday: Workout | null; // 來自 useActiveWorkoutStore 的進行中訓練（還沒 complete，不在上面那個陣列裡）
  overridesByDate: Map<string, DayOverride>;
  policyOverrides: Record<string, ShiftPolicy> | undefined;
  restOverrideDays: number;
  exerciseMap: Map<string, Exercise>; // 判斷「是不是純有氧」用，buildExerciseMap() 建
  today: number;                      // Date.now()，測試時可以注入固定時間
}

export function generateMonthPlan(input: GenerateMonthPlanInput): PlannedDay[];
```

**演算法**：狀態只有兩個，迴圈開始前就近算好——`simCursor` 初始值＝`activeProgram.cursor`；`daysSinceWeights` 初始值＝從 `completedWorkouts` 找「最近一次**非純有氧**的已完成訓練」到 `today` 的日曆天數（判斷是不是純有氧：entries 裡只要有任一個動作查 `exerciseMap` 得到的 `muscleGroup !== '有氧'` 就算數，邏輯跟 `cardioTemplates.ts` 的 `isCardioTemplate` 相反），完全沒紀錄過就給一個必定 `>= restOverrideDays` 的大數。

對 `dateStrings` 由舊到新逐一處理：

1. **`isPast`（早於今天）**：只從 `completedWorkouts` 找當天是否有紀錄存進 `actualWorkout`；`suggestion = 'past'`，**完全不去動 `simCursor`／`daysSinceWeights`**。過去的日子沒辦法可靠回推「當時應該建議什麼」（cursor 早就前進過了），所以乾脆不算，UI 只顯示實際發生的事，不顯示任何建議文字。
2. **今天或未來**：
   - `override?.paused` → `suggestion = 'paused'`；`daysSinceWeights += 1`；不消耗 `simCursor`。
   - 否則 `policy = classifyShiftCode(...)`；若 `policy === 'restOrCardio'` 但 `daysSinceWeights >= restOverrideDays` → 覆蓋成 `'train'`。
     - `policy === 'train'` 且 `activeProgram` 有 slots → `suggestion='train'`、`suggestedSlot = slots[simCursor % slots.length]`、`simCursor += 1`、`daysSinceWeights` 歸零。
     - 否則 → `suggestion = activeProgram ? 'restOrCardio' : 'noProgram'`；`daysSinceWeights += 1`。
3. 若當天（只可能是今天）已經有 `actualWorkout`：`suggestion`/`suggestedSlot` 照樣算，但 UI 顯示時 `actualWorkout` 優先（見 §5），不用在演算法裡另開分支。

> 這個函式完全不寫資料庫、不改真正的 `cursor`，純粹是「假設今天開始都照建議走，未來會長怎樣」的模擬，每次呼叫都從當下真實狀態重新推算。

### 具體例子（拿你 8 月截圖實際跑一遍，方便你對照演算法對不對）

假設 `activeProgram.slots = [胸,背,腿,肩]`、目前 `cursor = 0`（下一個練胸）、`restOverrideDays = 7`、最近一次重訓是 8/16（今天前一天）：

| 日期 | 班別 | daysSinceWeights（當天判斷前） | 建議 | 備註 |
|---|---|---|---|---|
| 8/17～8/21（連續 5 天 AB） | AB | 1→2→3→4→5 | 全部 `restOrCardio` | 5 天都沒到門檻 7，不會被強制覆蓋 |
| 8/22 | 休假 | 6 | `train`＝**胸**，cursor→1，歸零 | 休假一律照排，不看 daysSinceWeights |
| 8/23 | 休假 | 0 | `train`＝**背**，cursor→2，歸零 | |
| 8/24～8/28（連續 5 天 BC） | BC | 1→2→3→4→5 | 全部 `restOrCardio` | 同上，5 天沒到門檻 |
| 8/29 | A（單班） | 6 | `train`＝**腿**，cursor→3，歸零 | |
| 8/30 | 休假 | 0 | `train`＝**肩**，cursor→0（wrap），歸零 | |
| 8/31 | AC早 | 1 | `restOrCardio` | letters 取 `{A,C}`，忽略「早」字，查 `AC` 分類 |

這個月因為累班連續最長只有 5 天，沒有實際觸發「太久沒練」覆蓋；如果哪個月連續累班超過 7 天，中間會自動插入一天強制練。

### 測試 `src/lib/__tests__/shiftPlan.test.ts`，至少涵蓋

- 連續多天 `AB` 未超過門檻 → 全 `restOrCardio`；超過 `restOverrideDays` 後那天強制變 `train`，隔天若還是 `AB` 又變回 `restOrCardio`（歸零重算）。
- `paused` 的天不消耗 `simCursor`（後面第一個 `train` 天拿到的 slot index 跟 `paused` 那天之前一致，沒被跳過）。
- 沒有 `activeProgram` → 全部 `noProgram`，不噴錯；`activeProgram.slots.length === 0` 不當機。
- `simCursor` 到底要 `% length` 正確 wrap 回 0。
- `classifyShiftCode`：`['A','B']` 與 `['B','A']`（輸入順序不同）正規化成同一個 key；`isDayOff` 優先於 `shiftLetters`；查無代碼 fallback 到預設表。
- 純有氧的已完成訓練不會讓 `daysSinceWeights` 歸零；混合訓練（至少一個非有氧動作）會。
- `isPast` 的日期一律 `suggestion==='past'` 且不影響後面日期的模擬結果。

---

## 4. UI：「本月訓練日程」月曆（embed 進 `/plan` 課表頁）

放進 `src/pages/ProgramGuide.tsx`，位置在**現有內容最上方**（比匯入狀態卡片更早看到——這是你每天真正會盯著看的東西，ZongYuan 8 週課表細節留在後面當參考資料）。沒有 `activeProgram` 時這塊不顯示，頁面維持現況。

- 月曆網格**直接照抄 `History.tsx` 既有的 `calendarGrid`／`currentMonth`／月份切換邏輯**（`History.tsx:30, 101-125`）——日期字串格式、前月留白格算法都已經寫好能動，不要重寫一份。
- 每個日期格顯示日期數字 + 一行小字：
  - `train` → `suggestedSlot.label` 縮寫，indigo 強調色。
  - `restOrCardio` → 「休息/有氧」，slate/amber 弱化色。
  - `paused` → 「暫停」，更弱化（例如降低透明度）。
  - `past` 且有 `actualWorkout` → 沿用 `History.tsx` 既有的 `getMuscleIcon`/`getLocationColor`（既有「日曆部位圖」配色），不要另外發明一套顏色系統。
  - `past` 且沒有 `actualWorkout` → 留白，不顯示任何建議或提示文字（過去的建議算不準，也不需要一個健身 App 來讓人有罪惡感）。
- 點一個「今天或未來」的日期格 → 開一個 sheet「編輯這天」（抓既有 `SheetHeader` 共用元件）：
  - 三顆 A/B/C toggle chip（可複選）＋一顆「休假」按鈕（互斥，選休假就清掉 ABC 選取，反之亦然）。
  - 一個「暫停訓練（今天有事/下雨）」checkbox，跟班別選取互不影響，可同時存在。
  - 存檔＝ `saveDayOverride(...)`，關 sheet 後畫面自動反映新結果（整個月計畫是 `useMemo` 現算，**不需要額外「更新」按鈕**——這就是需求 3 要的效果）。
  - 過去日期唯讀或乾脆不給點，沒有意義去改已經發生的日子的建議。

---

## 5. 串進首頁「今天該練」卡片（`WorkoutLogger.tsx`）

現有邏輯永遠假設「今天該練 = `activeProgram` 目前 cursor 那個 slot」。改成：用 `generateMonthPlan` 只看「今天」這一天的結果：

| `suggestion` | 卡片行為 |
|---|---|
| `'train'` | 現有行為完全不變。 |
| `'restOrCardio'` | 文案改「今天班表較累，建議休息或有氧」；主行動按鈕換成放大版「🏃 有氧」（沿用 Phase 19 既有 sheet，不重做）；下面加一顆不搶眼的次要連結「還是想練 {slot 名稱}」，點下去＝現有 `handleStartTodayWorkout` 原邏輯，完整保留，只是不再是預設強調選項。 |
| `'paused'` | 文案「今天已標記暫停訓練」＋「取消暫停」小連結（一鍵把今天 `paused` 存回 `false`）。 |
| `'noProgram'` | 維持現有「沒有進行中計畫」畫面，不特別處理。 |
| 有 `actualWorkout`（今天已經在練或練完了） | 維持現有「進行中/已完成」畫面，不套用上面任何建議文案。 |

> **這步是刻意的設計選擇**：如果班表建議不影響首頁真正「開始訓練」按鈕，需求 1/2 就只是月曆頁面上的參考資訊，沒有真的達到「自動幫我排」的效果。所以接進首頁，但**只影響顯示的建議跟按鈕強調誰**，不擋住任何既有手動開練路徑——你永遠可以照舊練，App 只是換了個預設推薦。

---

## 6. 驗收標準

1. 設定頁能看到並調整「班別 → 訓練建議」表格與「太久沒重量訓練」門檻天數。
2. 課表頁最上方出現本月月曆，日期格顯示建議（練哪個部位／休息有氧／暫停），可切換月份。
3. 點今天或未來的日期格能編輯班別（A/B/C 複選或休假）與暫停，存檔後**不用任何額外按鈕**，月曆與首頁建議立刻反映新結果。
4. 連續多天累班（AB/AC/BC/ABC）且未超過門檻天數 → 全部建議休息/有氧；超過門檻後即使當天是累班也會排回訓練部位，隔天恢復正常判斷。
5. 首頁「今天該練」卡片：累班日預設強調有氧/休息，但「還是想練」與所有既有開訓路徑（含 Phase 19「沿用最近三次」「有氧」按鈕）完全沒被拿掉。
6. 暫停某天不影響其他天的部位輪動順序（跳過的那天不算數，下一個訓練日照樣接著原本該練的部位）。
7. 改變某天班別後重新整理頁面（模擬換裝置/重開 App）建議依然正確——資料來源是 `dayOverrides` 表，不是記憶體暫存。
8. 兩台裝置登入同帳號同步後，`dayOverrides` 互通（照 §1 四個同步檔案逐一確認）。
9. 沒有 `activeProgram` 時，整個新功能不出現、不影響現有頁面行為。
10. `eslint .` 0 error／`npm run build`（`tsc -b`）通過／`vitest` 全綠，新增 `src/lib/__tests__/shiftPlan.test.ts` 覆蓋 §3 列的案例。
11. 搜 `-\d{2,3}` 確認沒有 Tailwind v4 無效色階；新增的月曆格、sheet 深色模式都要有 `dark:` 對應色。

---

## 7. 預期動到的檔案

```
src/db/schema.ts                 + ShiftLetter/DayOverride/ShiftPolicy 型別、Settings 加兩欄、version(11)
src/db/dayOverrides.ts           ★新增：CRUD
src/lib/shiftPlan.ts             ★新增：classifyShiftCode / generateMonthPlan / 預設對照表常數
src/lib/__tests__/shiftPlan.test.ts   ★新增
src/sync/sync.ts                 SyncTable + AnyDexieTable + 四個函式各加 dayOverrides 一行
src/lib/backup.ts                BackupData + export/import 加 dayOverrides
src/pages/SettingsPage.tsx       + 班別對照表區塊 + 太久沒練門檻 NumberStepper
src/pages/ProgramGuide.tsx       + 本月月曆區塊（沿用 History.tsx 的 calendarGrid 邏輯）+ 編輯日期 sheet
src/pages/WorkoutLogger.tsx      「今天該練」卡片改先看 generateMonthPlan 今天的結果
docs/ROADMAP.md                  完工後補一列 Phase 21（v1.15）
```

---

## 8. 實作順序建議

1. schema + migration + `dayOverrides` CRUD（最底層，其他都靠它）。
2. `shiftPlan.ts` 純函式 + 測試（先把演算法徹底寫對，UI 只是把結果畫出來）。
3. Settings 頁新增區塊（這樣測 `shiftPlan.ts` 時就有真實資料可調）。
4. 同步四檔 + `backup.ts`（資料層收尾，做完這步 `dayOverrides` 才算是「正式的一張表」）。
5. `ProgramGuide.tsx` 月曆 UI + 編輯 sheet。
6. `WorkoutLogger.tsx` 串接今天建議（最後一步，風險最低、改動最小）。
7. `npm run build` + `vitest` + `eslint .` 全過 → 交給 Claude review。

---

## 9. 這版刻意不做（想要再開下一階段）

- 不做班表 App 自動偵測/匯入——手動輸入，理由見 §0-4。
- 不做「有氧要練哪個範本」的自動選擇——沿用 Phase 19 既有的手動挑有氧範本 sheet。
- 不做「補練」機制（例如暫停某天自動往後順延一天）——`simCursor` 本來就是「跳過的不算」，不需要額外補課邏輯。
- 不做按肌群個別計算「太久沒練」（例如分別追蹤胸多久沒練、背多久沒練）——先用「整體多久沒做重訓」單一門檻，對齊你原話「太久沒重量訓練」；真要細分再開下一階段（可以接現有 `getSplitRotationStatus` 概念，但那是寫死的拉/推/腿/手四類，跟這裡「slots 可以是任何命名」不完全相容，需要另外設計）。
- 不做「一鍵套用下個月班表」之類的範本/複製功能——月與月之間目前互相獨立輸入。
