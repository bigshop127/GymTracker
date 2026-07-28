# Phase 16（v1.10）規格 — 動作「擇一紀錄」替代動作 + 訓練菜單改頂部分頁

> 工作協議：本規格由 Claude 擬，**你自己寫 code**，再讓 Claude **獨立 review**（重跑 `eslint .` / `npm run build`（`tsc -b && vite build`）/ `npx vitest run`、讀變更檔對照驗收）。過了才 commit/push。
>
> 兩項需求：
> ① **替代動作、擇一紀錄**：同一個菜單格子掛兩個（以上）動作（例：槓鈴握推 ↔ 啞鈴握推），畫面兩個都顯示、但只記錄你當天實際做的那一個。
> ② **訓練菜單改頂部橫向分頁**：進行中的訓練不要再一整排卡片往下滑，改成頂部一排可橫向捲動的分頁（像瀏覽器分頁），一頁一個動作，點哪個才展開它的組數細節。
>
> 已拍板的決策（你在 AskUserQuestion 選的）：
> - 替代動作來源＝**範本事先綁 ＋ 訓練當場也能加**。
> - 呈現＝**頂部橫向分頁**（不是手風琴、不是側欄）。
>
> **本階段沒有 Dexie schema 變更、沒有 Firestore 規則變更**：新欄位是塞在 `WorkoutEntry` 裡的巢狀陣列，不是索引欄位，Dexie 存整個 `Workout`／`WorkoutTemplate` 物件即可，Firestore 存的也是整份 doc。**不要**加 `db.version(9)`，也不用碰 `firestore.rules`。

---

## 資料模型（唯一的 schema 檔改動：純型別，不動 Dexie 版本）

`src/db/schema.ts` 的 `WorkoutEntry`（現在是 `:37-44`）加一個選填欄位：

```ts
export interface WorkoutEntry {
  id: string;
  exerciseId: string;              // 「當前選定＝實際要記錄」的動作（語意不變）
  candidateExerciseIds?: string[]; // 替代動作候選清單（含當前選定）；缺省＝單一動作（向後相容）
  order: number;
  sets: SetLog[];
  defaultRestSeconds?: number;
}
```

**核心設計（務必照這個不變式走，downstream 才能零改動）：**

- `exerciseId` **永遠**指向「當前選定、要被記錄」的那個動作 —— 語意完全不變。所有既有讀取端（歷史、統計、e1rm、`workoutSummary` 自動標題）都只看 `exerciseId`，因此**不用改任何一處**。
- `candidateExerciseIds`：
  - **缺省（`undefined`）** ＝ 這格只有單一動作，就是現況，絕大多數 entry 都是這樣。
  - **有值時，不變式**：長度 ≥ 2、且 **一定包含當前的 `exerciseId`**。順序穩定（用來決定分頁內候選 chip 的排列，切換選定時 chip 不可跳位）。
- 「擇一切換」＝只改 `exerciseId` 指到候選清單裡的另一個 id，`candidateExerciseIds` 陣列本身與順序不動。
- **組數（`sets`）只有一份**，掛在 entry 上，記在誰名下由 `exerciseId` 決定 —— 這就是「擇一紀錄」：你只會留一組紀錄。切換候選**不清空** `sets`（槓鈴換啞鈴重量本來就要自己改，交給使用者手動調，不要自作聰明清掉）。

> 為什麼不是「每個候選各存一份 sets」：需求就是「擇一紀錄」，多存反而要處理「哪一份才算數」。單一 sets + 由 `exerciseId` 決定歸屬，最小、最不會出錯，且完全不污染歷史／統計。

---

## 邏輯層：把 entry 的純變換抽成可測函式（ROADMAP §5：邏輯進 lib，UI 不碰資料形狀）

新檔 `src/lib/workoutEntries.ts`，放三個**純函式**（吃 entries 回新 entries，不碰 store / DB），store action 只做「呼叫純函式 → 存 DB → setState」的薄殼。這樣邏輯可用 vitest 釘死，跟 `splitRotation.ts` 同套路。

```ts
import { type WorkoutEntry } from '../db/schema';

/** 把某個候選設為「當前選定＝要記錄」。id 不在候選清單內則原樣返回（防呆）。 */
export function selectEntryExercise(
  entries: WorkoutEntry[],
  entryId: string,
  exerciseId: string,
): WorkoutEntry[]

/**
 * 對某 entry 新增一個替代候選。
 * - 若該 entry 原本沒有 candidateExerciseIds，先初始化成 [entry.exerciseId]，再 append。
 * - 已存在（等於當前 exerciseId 或已在清單內）→ 去重、不重複加。
 * - 不改變當前選定（exerciseId 不動）：新增替代只是「多一個選項」，不是「換成它」。
 */
export function addAlternativeToEntry(
  entries: WorkoutEntry[],
  entryId: string,
  exerciseId: string,
): WorkoutEntry[]

/**
 * 移除一個替代候選。
 * - 不允許移除「當前選定」的那個（要換先 select 別的）。呼叫端應在 UI 就不給選定的 chip 出現 ✕。
 * - 移除後若清單長度 ≤ 1 → 直接把 candidateExerciseIds 設回 undefined，回到單一動作。
 */
export function removeAlternativeFromEntry(
  entries: WorkoutEntry[],
  entryId: string,
  exerciseId: string,
): WorkoutEntry[]
```

**`src/store/activeWorkout.ts` 新增三個 action**，每個都是薄殼（照現有 `updateSet` 的寫法：算出 `updatedEntries` → `saveWorkoutImmediate` → `set`）：

```ts
selectEntryExercise: (entryId: string, exerciseId: string) => Promise<void>;
addAlternativeToEntry: (entryId: string, exerciseId: string) => Promise<void>;
removeAlternativeFromEntry: (entryId: string, exerciseId: string) => Promise<void>;
```

三者都用 `saveWorkoutImmediate`（不是 debounce）——它們是離散點擊，要即時落地。記得在 interface 型別（`:22-41`）也補上宣告。

---

## 帶得過去：4 個複製 entry 的地方都要抄 `candidateExerciseIds`

替代動作要能「範本事先綁」，靠的就是**存範本時把候選清單一起抄進範本、下次從範本／課表開訓時再抄回來**。這四個函式都在 `.map(entry => ({ ... }))` 重建 entry，全部加一行把候選帶過去。`candidateExerciseIds` 裝的是**動作 id（全 app 穩定，不是 per-entry id）**，直接淺拷貝即可，不用重新產生：

| 檔案 | 函式 | 現在行號 |
|---|---|---|
| `src/db/templates.ts` | `createTemplateFromWorkout` | `:11` 的 `entries.map` |
| `src/store/activeWorkout.ts` | `startWorkoutFromTemplateEntity` | `:482` |
| `src/store/activeWorkout.ts` | `startWorkoutFromProgramSlot`（有 template 那條分支） | `:542` |
| `src/store/activeWorkout.ts` | `startWorkoutFromTemplate`（舊的 Workout 版，仍在用） | `:446` |

每處在重建的 entry 物件裡加：

```ts
...(entry.candidateExerciseIds && entry.candidateExerciseIds.length > 1
  ? { candidateExerciseIds: [...entry.candidateExerciseIds] }
  : {}),
```

（用條件展開避免把 `undefined` 寫進物件、也順手擋掉長度異常的髒資料。）

> 「範本綁」的實際流程因此變成：訓練當場對某動作按「＋替代」加上啞鈴握推 → 完成訓練時另存範本 → `createTemplateFromWorkout` 把候選抄進範本 → 下次從該範本／課表 slot 開訓，這格就同時帶槓鈴＋啞鈴兩個候選。**不需要另做一個範本編輯器**（目前也沒有），這條路就滿足你要的「事先在範本設定好」。

---

## UI ①：替代動作切換 + 當場加替代（在每個 entry 卡片內）

放在 entry 卡片標頭（現在的動作名稱區塊 `WorkoutLogger.tsx:591-608`）正下方，在「組數明細」之前。

**候選切換列（只有 `candidateExerciseIds?.length > 1` 才出現）：**
- 一排 segmented / chip：每個候選一顆，顯示該動作名稱（用 `allExercises.find(id).name`）。
- 當前 `exerciseId` 那顆＝實心高亮（沿用現有 indigo 語彙 `bg-indigo-600 text-white`）；其餘＝淡色（`bg-slate-100 text-slate-500`）。
- 點非選定的那顆 → `selectEntryExercise(entry.id, id)`。切換後：
  - 卡片標頭的動作名稱、肌群/器材徽章（`:593-599`）要跟著換成新選定動作的資料。
  - 頂部分頁（UI ②）該分頁的標籤文字也要即時跟著變（因為分頁標籤就是讀 `exerciseId` 的名稱）。
- 每顆**非選定**候選 chip 右上帶一個小 `✕` → `removeAlternativeFromEntry(entry.id, id)`。選定中的那顆**不給** ✕（要移除得先切走）。

**「＋替代」按鈕**（永遠顯示，單一動作也能升級成有替代）：
- 一顆小按鈕（虛線邊、`＋替代` 字樣），點了打開**既有的全螢幕動作選擇器**（`isSelectorOpen` 那套 `ExerciseList mode="select"`，`:877-898`），但這次選中的動作是「加為此 entry 的替代」，不是「新增一個 entry」。
- 作法：新增一個狀態 `const [altTargetEntryId, setAltTargetEntryId] = useState<string | null>(null)`。按「＋替代」時 `setAltTargetEntryId(entry.id)` 並 `setIsSelectorOpen(true)`。
- 在 `handleSelectExercise`（`:284-287`）分流：

```ts
const handleSelectExercise = async (exercise: Exercise) => {
  if (altTargetEntryId) {
    await addAlternativeToEntry(altTargetEntryId, exercise.id);
    setAltTargetEntryId(null);
  } else {
    await addExerciseToWorkout(exercise.id, exercise.muscleGroup === '有氧');
  }
  setIsSelectorOpen(false);
};
```

- 關閉選擇器（右上 ✕，`:882`）時也要 `setAltTargetEntryId(null)`，否則下次開「新增動作」會誤入替代模式。選擇器標題可依 `altTargetEntryId` 是否有值切換文案（「選擇替代動作」/「選擇要加入的動作」）。

> 有氧動作要不要能當替代？可以，但同一格混「重訓↔有氧」的組數欄位型態不同（`isCardio` 走 grid、重訓走兩列卡片），體驗會亂。**本階段建議：「＋替代」選到有氧動作就擋下並提示**（`alert('替代動作暫不支援有氧')`），把混型別的複雜度留到以後。Review 會檢查這個防呆。

---

## UI ②：進行中訓練改「頂部橫向分頁」

改寫的是 `WorkoutLogger.tsx` 狀態 B 裡「動作清單」那段（現在的 `:585-799`，`activeWorkout.entries.map(...)` 整排卡片）。標頭卡（`:511-582`）、底部「取消／完成訓練」（`:813-873`）**維持不動**，只換中間動作清單的排版。

**狀態：**
```ts
const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
```
用一個 effect 維持其有效性（entries 變動時）：
- entries 非空且 `activeEntryId` 為 null 或不在現有 entries 內 → 設成第一個 entry 的 id。
- entries 為空 → 設 null。
- 依賴陣列用 entries 的 id 序列（例如 `activeWorkout?.entries.map(e => e.id).join(',')`），不要用整個 entries 物件（每次調重量都會變）。

**版面：**
1. **頂部分頁列**：一個 `overflow-x-auto`、`flex`、`whitespace-nowrap` 的橫向捲動容器（**捲動只發生在這一條內，不能讓整頁 body 產生水平捲動**）。每個 entry 一顆分頁鈕：
   - 文字＝該 entry 當前選定動作名稱（`allExercises.find(entry.exerciseId).name`）。名稱可能長（`上斜啞鈴臥推`），用 `whitespace-nowrap`，靠橫向捲動吸收，不要硬折行。
   - 完成度小指示：該 entry 全部 `sets` 都 `completed` → 綠點 `●`；否則顯示 `已完成數/總數`（例如 `1/3`）或未動時省略。
   - 若 `candidateExerciseIds?.length > 1`，標籤旁加個小記號（例如 `⇄`）暗示這格有替代。
   - 選中的分頁高亮（底線 indigo 或實心底），點擊 `setActiveEntryId(entry.id)`。
2. **分頁列尾端一顆 `＋` 分頁** → 開新增動作選擇器（等同現在 `:801-810` 那顆「加入訓練動作」的行為，`setAltTargetEntryId(null)` + `setIsSelectorOpen(true)`）。新增成功後把 `activeEntryId` 切到新 entry（`addExerciseToWorkout` 後拿新 entry 的 id；可在 store action 回傳 id 或在前端取 `entries[last]`）。
3. **面板區**：只渲染 `activeEntryId` 對應的那**一個** entry 的卡片內容（沿用現在 `:589-796` 那張卡的 body：組數明細、增加/刪除組、RPE、以及 UI ① 的候選切換）。其餘 entry 不渲染細節。
   - entries 為空時，面板顯示一個空狀態提示（例如「按 ＋ 加入第一個動作」），別留一片空白。

**移除動作**（現有「移除動作」鈕 `:602-607`）：移除當前面板的 entry 後，`activeEntryId` 會因上面的 effect 自動回退到第一個；確認 effect 有涵蓋這情況即可。

> 原本卡片底部那顆獨立的「加入訓練動作」大按鈕（`:801-810`）可以移除，功能收進分頁列尾端的 `＋`；或保留亦可，兩者呼叫同一路徑。二選一，別讓兩顆按鈕行為分岔。

**`activeEntryId` 不持久化**：純 UI 狀態，重整回到第一頁即可，不用進 DB／localStorage（要的話 sessionStorage 也行，非必要）。

---

## 測試（`src/lib/__tests__/` 新增 `workoutEntries.test.ts`）

純函式好測，至少涵蓋：

1. `addAlternativeToEntry`：單一動作 entry（無 `candidateExerciseIds`）加一個替代後 → `candidateExerciseIds` 變成 `[原 exerciseId, 新 id]`、`exerciseId` 不變。
2. `addAlternativeToEntry` 去重：加入等於當前 `exerciseId` 的 id、或已在清單內的 id → 陣列不變。
3. `selectEntryExercise`：把 `exerciseId` 換成候選清單內另一個 id → 成功；候選陣列與順序不動。
4. `selectEntryExercise` 防呆：傳入不在候選清單內的 id → entries 原樣返回。
5. `removeAlternativeFromEntry`：移除非選定候選 → 從清單移除；移到只剩 1 個 → `candidateExerciseIds` 變回 `undefined`。
6. `removeAlternativeFromEntry` 防呆：嘗試移除「當前選定」的 id → 拒絕（entries 不變）。
7. 三個函式對「找不到 entryId」都安全返回（不拋錯、不誤改別的 entry）。
8. `createTemplateFromWorkout`：帶 `candidateExerciseIds` 的 workout → 產出的 template entry 也帶著同樣候選（驗「範本綁」的抄寫）。

---

## 驗收清單

**① 替代動作 / 擇一紀錄**
- [ ] 訓練當場對「槓鈴握推」按「＋替代」加入「啞鈴握推」→ 該格出現兩顆候選 chip，槓鈴為選定（高亮）。
- [ ] 點「啞鈴握推」→ 變成選定，卡片標頭名稱／肌群徽章、頂部該分頁標籤同步變成啞鈴握推；組數只有一份、不因切換被清空。
- [ ] 完成訓練 → 歷史頁該筆記在「啞鈴握推」名下（＝當前 `exerciseId`），不是槓鈴。
- [ ] 完成時另存範本 → 下次從該範本／課表 slot 開訓，這格自動帶槓鈴＋啞鈴兩候選（範本綁生效）。
- [ ] 移除非選定候選 → 剩一個時退回單一動作、chip 列消失。選定中的候選沒有 ✕。
- [ ] 「＋替代」選到有氧動作被擋下並提示。
- [ ] 舊資料（沒有 `candidateExerciseIds` 的既有進行中訓練 / 歷史）完全正常，不顯示候選列、不報錯。

**② 頂部分頁**
- [ ] 進行中訓練不再是一整排往下滑；頂部一排可橫向捲動的分頁，一頁一個動作。
- [ ] 點分頁只展開該動作的組數細節，其餘收起。
- [ ] 尾端 `＋` 分頁可新增動作，新增後自動跳到新分頁。
- [ ] 移除當前分頁的動作後，自動回退到第一個分頁、不留空白、不報錯。
- [ ] 空訓練（尚無動作）時面板顯示引導文案而非空白。
- [ ] 分頁列橫向捲動時，**整頁 body 不會**跟著左右晃（水平捲動被 `overflow-x-auto` 關在分頁列內）。
- [ ] 深色模式下分頁列、候選 chip 兩種狀態都正常。

**全體**
- [ ] `eslint .` 零 error
- [ ] `npm run build`（`tsc -b && vite build`）零 error —— VM/CI 的 `tsc -b` 比 `tsc --noEmit` 嚴格，一定要跑 `npm run build` 本身。
- [ ] `npx vitest run` 全綠（含新 `workoutEntries.test.ts`）。
- [ ] 搜一次 `-\d{2,3}` 確認沒有 `slate-850` 這類 Tailwind v4 靜默吞掉的無效色階。
- [ ] 沒有 Dexie `version(9)`、沒有動 `firestore.rules`（本階段刻意零 schema 變更）。

---

## Review 時 Claude 會特別盯的點

1. **不變式有沒有守住**：`candidateExerciseIds` 有值時必含當前 `exerciseId` 且長度 ≥ 2；退化時要設回 `undefined` 而不是留個長度 1 的陣列（否則 UI 判斷 `> 1` 會忽好忽壞、且污染同步 doc）。
2. **`exerciseId` 語意有沒有被動到**：它必須永遠＝「要記錄的那個」。downstream（History / workoutSummary / e1rm / 統計）**一行都不該改**；若你動了它們，代表資料模型走偏了。
3. **4 個複製點有沒有全抄到 `candidateExerciseIds`**——漏一個，「範本綁」或「從課表開訓」就會掉替代。
4. **UI 不碰 Dexie**：三個 entry 變換全走 `src/lib/workoutEntries.ts` 純函式 + store 薄殼，元件裡不得直接 `db.*`。
5. **選擇器模式分流有沒有漏 reset**：`altTargetEntryId` 在「加替代」「新增動作」「關閉選擇器」三條路徑都要正確設定/清掉，否則會串味（本來要新增動作卻加成替代）。
6. **`activeEntryId` 的 effect 依賴**：要用 id 序列字串，不能用整個 `entries` 物件——否則每次調重量都重跑、或反過來漏掉「當前分頁被刪」的回退。
7. **水平捲動封在分頁列內**：確認 body 不產生水平捲軸（手機上很容易破版）。
8. **TS strict 零 `any`**、選填 `candidateExerciseIds?: string[]` 的 nullable 有沒有守好。
