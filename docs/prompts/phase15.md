# Phase 15（v1.9）規格 — 雲端同步修好 + 訓練感受選單 + 週輪動追蹤

> 工作協議：本規格由 Claude 擬，**你自己寫 code**，再讓 Claude **獨立 review**（重跑 `eslint .` / `tsc -b && vite build` / `vitest`、讀變更檔對照驗收）。過了才 commit/push。
>
> 本階段 **有 Dexie schema 變更**（version 8，軟刪除）。共三項：
> ① 雲端同步修正（6 個子項，其中 3 個是會掉資料的 bug）
> ② RPE 選單改成四句中文訓練感受
> ③ 拉/推/腿/手 週輪動追蹤（滾動 7 天）
>
> 已拍板的決策：週期窗口＝**滾動 7 天**；分類來源＝**沿用課表 slot**；RPE＝**畫面顯示你打的四句中文原文、底層仍存既有 `rpe` 數字欄位**（不動 migration，舊資料不壞）。

---

## #0 已由 Claude 完成的基建（你不用做，列此供查核）

Commit `56bcce0` — `.github/workflows/deploy.yml` 的 `npm run build` 步驟補上 `env:`，把 6 個 `VITE_FIREBASE_*` secrets 注入建置。

**這就是「手機不能同步」的真正原因**：Vite 只在 build 當下把 `VITE_*` 字面內嵌進 bundle，GitHub secrets 不會自動出現在 build 環境。所以線上版 `isConfigured()`（`src/lib/firebase.ts:18`）永遠是 `false`，`SettingsPage.tsx:313` 的 `{isFirebaseConfigured && (...)}` 讓整塊登入／同步 UI 在手機上根本沒渲染出來。程式碼從 v1.4 就是好的，只是設定沒進去。

已實測驗證（部署後）：

| 項目 | 結果 |
|---|---|
| 線上 bundle 是否含設定 | ✅ `assets/index-*.js` 內含 `gymtracker-sync-cb0d4` 與 `AIzaSy…` |
| Firebase 授權網域 | ✅ `authorizedDomains` 已含 `bigshop127.github.io` |
| Firestore 未登入讀取 | ✅ 回 `403 PERMISSION_DENIED`（不是 test-mode 全開） |

**你要在 Firebase Console 確認的唯一一件事**：Firestore 規則有沒有正確放行「登入者讀寫自己的資料」。上面的 403 只證明「沒有全開」，不能證明「登入後放得過」。若規則當初是 test mode，30 天到期後會變成全部拒絕，登入後同步會噴 `permission-denied`。正確規則長這樣：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

> 補充：Firebase Web API key 被打包進公開 bundle 是**正常且預期**的，它是專案識別碼不是密鑰；安全性完全靠上面那條 Firestore 規則守，不是靠藏 key。

---

## #1 雲端同步：3 個掉資料的 bug + 3 個體驗問題

### 1A（Bug‧最嚴重）手動按「立即同步」只拉不推，本機新紀錄上不了雲

**根因**：`src/store/sync.ts:67-83`

```ts
const { lastSyncAt } = get();
if (lastSyncAt) {
  await deltaSync(user.uid, lastSyncAt);   // ← deltaSync 只有 pull，沒有 push
} else {
  await fullSync(user.uid);                // ← 只有這條路才會 pushAllToCloud
}
```

`deltaSync`（`src/sync/sync.ts:113-129`）從頭到尾只做 `pullSince` + `mergeRecords`，**完全沒有推送**。`visibilitychange` 呼叫的也是 `deltaSync`。

**實際後果**：手機上開 App → 首次自動 `fullSync`（有推）→ 練完一整場 → 按「立即同步」→ 這次 `lastSyncAt` 已有值 → 走 `deltaSync` → **今天的訓練一筆都沒上傳**。要等下次「完全關掉 App 再重開」才會補推。這正是「按了同步但電腦看不到」的來源。

**目標行為**：任何一次同步都是**雙向**：先拉再推，只處理 `updatedAt > since` 的增量。

**建議實作**（`src/sync/sync.ts`）：

1. 新增推送增量的函式。五張表都有 `updatedAt` 索引（schema v3/v7），可直接查：

```ts
async function pushChangedSince(uid: string, since: number): Promise<void> {
  const [exercises, workouts, templates, metrics, programs] = await Promise.all([
    db.exercises.where('updatedAt').above(since).toArray(),
    db.workouts.where('updatedAt').above(since).toArray(),
    db.templates.where('updatedAt').above(since).toArray(),
    db.bodyMetrics.where('updatedAt').above(since).toArray(),
    db.programs.where('updatedAt').above(since).toArray(),
  ]);
  // 過濾規則要和 pushAllToCloud 一致：exercises 只推 isCustom，
  // workouts 只推 status === 'completed' 或帶 deletedAt 的墓碑
  ...
}
```

2. 把 `deltaSync` 改成 pull + push 都做（或改名 `syncSince` 更誠實）：

```ts
export async function deltaSync(uid: string, since: number): Promise<void> {
  await pullAndMergeSince(uid, since);
  await pushChangedSince(uid, since);
}
```

3. 順序固定「先拉後推」：拉進來的雲端較新資料先蓋掉本機舊的，接著推的就是合併後的正確狀態，不會把剛拉下來的東西又用舊值推回去。

**注意**：進行中的訓練（`status === 'active'`）**維持不同步**，這是刻意的——兩台裝置同時有 active workout 會互相蓋掉。`pushAllToCloud` 現在的 `.where('status').equals('completed')` 過濾要保留，`pushChangedSince` 也要比照。

---

### 1B（Bug）`pushDoc` 覆寫 `updatedAt`，會讓舊資料反殺新資料

**根因**：`src/sync/sync.ts:24`

```ts
await setDoc(ref, { ...record, updatedAt: Date.now() }, { merge: true });
```

推上去時把紀錄自己的 `updatedAt` **改寫成「推送當下」**。

**實際後果**（真的會掉資料）：
- 電腦端 7/20 改了某筆訓練 → 雲端該筆 `updatedAt = 7/20`。
- 手機端有同一筆的**舊版本**（`updatedAt = 7/15`），開 App 跑 `fullSync`：`mergeRecords` 先把雲端 7/20 版本拉下來蓋掉本機（正確），但 `pushAllToCloud` 是**全表推送**，把每一筆都以 `Date.now()` 重新蓋回雲端 → 若合併過程有任何一筆沒被正確覆蓋（例如推送與拉取競態、或該表被過濾掉沒拉到），舊內容就會以「最新時間戳」寫回雲端，**LWW 從此永遠站在錯的那邊**。
- 附帶災情：每次 fullSync 後全表 `updatedAt` 都變成 now，另一台的 `pullSince` 會判定「全部都是新的」，每次都全量下載。

**目標行為**：`updatedAt` 是**資料真正被修改的時間**，只有 `src/db/` 寫入時才設定，同步層**永遠不得改寫**。

**建議實作**：

```ts
export async function pushDoc(uid: string, table: SyncTable, record: SyncRecord): Promise<void> {
  const fs = getFirebaseFirestore();
  const ref = doc(fs, 'users', uid, table, record.id);
  await setDoc(ref, { ...record, updatedAt: record.updatedAt ?? Date.now() }, { merge: true });
}
```

好消息：`src/db/` 五個模組的所有寫入路徑（`addExercise` / `updateExercise` / `saveActiveWorkout` / `completeWorkout` / `saveTemplate` / `saveProgram` / `addBodyMetric` / `updateBodyMetric`）**都已經正確設 `updatedAt`**，我逐一讀過了，這裡不用改。

---

### 1C（Bug）刪除是硬刪，刪掉的東西下次同步會復活

**根因**：`src/db/` 五個 `deleteX()` 全是 `db.xxx.delete(id)` 硬刪（`workouts.ts:34`、`exercises.ts:33`、`templates.ts:45`、`programs.ts:48`、`bodyMetrics.ts:20`）。

**實際後果**：手機刪掉一筆訓練 → 本機沒了，但雲端那筆還在 → 下次 `fullSync` 的 `pullAll` 又把它拉回來 → **殭屍紀錄，永遠刪不掉**。schema 裡 `deletedAt` 欄位五張表都定義好了（`schema.ts:19/57/71/94/117`），`mergeRecords` 也已經會處理雲端墓碑（`sync.ts:55-58`），**只差本機刪除沒有寫墓碑**。

**目標行為**：刪除＝寫墓碑（`deletedAt` + `updatedAt`），資料列留著讓它能被同步出去；所有讀取路徑濾掉墓碑。

**建議實作**（三步，順序別跳）：

1. **Dexie version 8**（`schema.ts`，加在 v7 之後）：純資料遷移，不用改 `stores`。舊資料沒有 `deletedAt`，天生就不是墓碑，其實**可以不寫 upgrade**；若想保險起見留一個空的 `this.version(8).stores({})` 也行，但別留無意義的 `modify()` 掃全表。

2. **`src/db/` 五個 `deleteX()` 改寫墓碑**，例如：

```ts
export async function deleteWorkout(workoutId: string): Promise<void> {
  const now = Date.now();
  const workout = await db.workouts.get(workoutId);
  if (!workout) return;
  await db.workouts.put({ ...workout, deletedAt: now, updatedAt: now });
}
```

`deleteExercise` 的 `isCustom` 檢查要保留。`deleteProgram` 同理。

3. **所有讀取路徑濾掉墓碑**——這是最容易漏的一步，漏一個就會出現「刪了還在畫面上」。要改的清單（我已逐檔確認）：

| 檔案 | 函式 | 改法 |
|---|---|---|
| `db/workouts.ts` | `listCompletedWorkouts` | 結果 `.filter(w => !w.deletedAt)` |
| `db/workouts.ts` | `getActiveWorkout` | `.and(w => !w.deletedAt)` |
| `db/exercises.ts` | `listExercises` | `.filter(e => !e.deletedAt)` |
| `db/exercises.ts` | `seedExercisesIfEmpty` | 判空／比對名稱時要**排除**墓碑，否則刪過的動作永遠補不回來 |
| `db/templates.ts` | `listTemplates`、`getTemplate` | 濾墓碑（`getTemplate` 命中墓碑回 `undefined`） |
| `db/programs.ts` | `listPrograms`、`getActiveProgram`、`getProgram` | 同上 |
| `db/bodyMetrics.ts` | `listBodyMetrics` | 濾墓碑 |

**同步層要維持讀原始表**（`pushAllToCloud` 用的 `db.xxx.toArray()` 不要改成濾過的版本），否則墓碑推不上雲，刪除一樣傳不出去。

4. **`mergeRecords` 收到墓碑時**（`sync.ts:55-58`）目前是本機硬刪。建議改成 `put` 存下墓碑，理由：這樣墓碑能再傳給第三台裝置；且與本機刪除行為一致。改了之後上面第 3 步的濾除就成為顯示正確性的唯一防線，務必做滿。
   *（未來優化，本階段不做：清掉 90 天前的墓碑做 GC。）*

---

### 1D 同步時間點沒持久化，每次重開都全量同步

`lastSyncAt` 只活在 zustand 記憶體（`store/sync.ts:24`），重整或關 App 就歸零 → 每次開 App 都走 `fullSync`（全表下載＋全表上傳）。資料量小還好，一兩年後每次開 App 都要拉幾千筆。

**建議實作**：`lastSyncAt` 存 `localStorage`（key 用 `gymtracker.lastSyncAt.<uid>`，**要綁 uid**，換帳號不能沿用別人的水位）。初始化時讀回來，同步成功後寫入。用 zustand `persist` middleware 或手寫都可以，手寫更好控制 uid 綁定。

---

### 1E 時鐘偏移會讓增量同步漏資料

所有 `updatedAt` 都是各裝置自己的 `Date.now()`，手機和電腦的時鐘可能差好幾秒到幾分鐘（你在財經專案就被玉山 API 的時鐘飄移咬過一次）。`pullSince` 用 `updatedAt > lastSyncAt` 嚴格比較，只要對方裝置時鐘慢，那筆資料就永遠落在水位線下、**永遠拉不到**。

**建議實作**：查詢時扣一段安全邊際，寧可重抓也不要漏抓（LWW 合併本來就冪等，重抓無害）：

```ts
const SYNC_CLOCK_SKEW_MS = 5 * 60 * 1000;  // 5 分鐘
await deltaSync(user.uid, Math.max(0, lastSyncAt - SYNC_CLOCK_SKEW_MS));
```

---

### 1F（你原本要的功能）「雲端同步」按鈕要看得到

現在按鈕埋在 **設定頁最底下、而且只有登入後才出現**，在手機上等於不存在。

**目標行為**：每一頁都看得到同步狀態，一鍵可觸發。

**建議實作**（`src/components/Layout.tsx:46-55`）：Header 右側現在是空的（logo 靠左，右邊整片留白），把同步鈕放這裡最順：

- 未設定 Firebase（`!isFirebaseConfigured`）→ 不顯示，維持現況。
- 已設定但未登入 → 顯示一顆灰色雲朵圖示，點了導去 `/settings`（登入流程仍留在設定頁，不要在 header 塞 Google 登入彈窗）。
- 已登入 → 顯示雲朵圖示 + 狀態點：
  - `idle` 且有 `lastSyncAt`：綠點，點擊觸發 `sync()`
  - `syncing`：圖示轉圈 / 琥珀色脈動（沿用 `SettingsPage.tsx:356` 現有的 `animate-ping` 樣式語彙）
  - `error`：紅點，點擊觸發重試，並可 `title={errorMessage}`
- 點擊後給一個明確回饋（同步完短暫顯示「已同步」文字約 2 秒再淡回圖示），否則使用者不知道按了有沒有用——這是原本體驗最差的地方。

設定頁那塊 UI **保留不動**（帳號資訊、登出、詳細狀態仍在那裡），header 只是快捷入口。

---

## #2 RPE 選單改成四句中文訓練感受

### 現況
`src/pages/WorkoutLogger.tsx:654-671` 是 `無 / 10 / 9.5 / 9 / 8.5 / 8 / 7.5 / 7 / 6.5 / 6` 共 10 個純數字選項。純數字對訓練當下沒有指導性。

### 目標行為
選單只剩 5 個選項（含「無」），文字**一字不改**用你打的四句：

| 顯示文字（原文照用） | 存進 `rpe` 的值 |
|---|---|
| 無 | `undefined` |
| 重量太輕下組嘗試加重 | `6` |
| 重量剛好 | `8` |
| 這組太重下組要降 | `10` |
| 到這組接近力竭了 | `9.5` |

排序建議照「由輕到重」：太輕 → 剛好 → 接近力竭 → 太重。（上表是語意對照，不是選單順序。）

### 建議實作

1. **新增 `src/lib/rpe.ts` 作為單一來源**，UI 不准散落硬編字串：

```ts
export interface RpeOption {
  value: number;
  label: string;
}

export const RPE_OPTIONS: RpeOption[] = [
  { value: 6,   label: '重量太輕下組嘗試加重' },
  { value: 8,   label: '重量剛好' },
  { value: 9.5, label: '到這組接近力竭了' },
  { value: 10,  label: '這組太重下組要降' },
];

/** 把任意 rpe 數字（含舊資料的 7、8.5、9…）對應到最接近的標籤 */
export function rpeToLabel(rpe: number | undefined): string | null { ... }

/** 歷史卡片用的短標籤，避免長句撐爆版面 */
export function rpeToShortLabel(rpe: number | undefined): string | null { ... }
```

`rpeToLabel` 用「最接近值」而非精確比對，舊資料的 `7` / `8.5` / `9` 才不會顯示成空白。

2. **`WorkoutLogger.tsx:654-671`**：`<select>` 的 options 改成 `RPE_OPTIONS.map(...)`。

   ⚠️ **版面風險**：四句中文最長 11 個字，塞進目前那個 `h-8` 的窄 `<select>`（第二列還要和「正式/暖身」鈕並排）一定會被擠爆或截斷。兩個處理方向，你挑一個：
   - **(a) 選單獨佔一列**：把 RPE 從「第二列」拆出來自成一列 `w-full`，「正式/暖身」鈕留在原本那列。改動最小、最穩。
   - **(b) 換成四顆圖示切換鈕**：不用 `<select>`，四個小色塊（例如 藍=太輕 / 綠=剛好 / 橘=接近力竭 / 紅=太重），點一下選、再點一下取消。手機上最好按，但要自己設計 `aria-label` 讓四句原文仍可讀。

   我推薦 **(a)**，理由是你的四句話本身就是重點資訊，縮成圖示反而失去「下組要加重／要降」的行動提示。

3. **`src/pages/History.tsx:708-712`**：目前顯示 `RPE {setLog.rpe}`（例如 `RPE 9.5`），改用 `rpeToShortLabel()`。這裡是密集的歷史卡片，**不要放整句**，建議短標籤：`太輕` / `剛好` / `接近力竭` / `太重`。

4. **不需要 DB migration**：`SetLog.rpe?: number`（`schema.ts:27`）型別不動，舊資料原樣可讀。順手把該行註解從 `// 主觀強度 6-10，選填` 更新成新語意。

---

## #3 拉／推／腿／手 週輪動追蹤（滾動 7 天）

### 需求
四種訓練（拉 / 推 / 腿 / 手）暫定**一週內要輪過一次**，需要一眼看出「最近 7 天還缺哪個」。

### 分類來源（已拍板：沿用課表 slot）
你現在用的宗諺 8 週課表（`src/data/zongyuan-8week-program.ts:30/61/87/113`）的四個 slot label 剛好就是 `拉 (Pull)` / `推 (Push)` / `腿 (Leg)` / `手 (Arms)`，而 `Workout` 已經存了 `programSlotId`（`schema.ts:59`）。所以**零額外輸入**，判定鏈是：

```
workout.programSlotId → activeProgram.slots 找到 slot → slot.label → 正規化成 拉/推/腿/手
```

三層 fallback：
1. 有 `programSlotId` 且在現行課表找得到 → 用 slot label。
2. 找不到（舊訓練、換過課表、自由訓練）→ 用 `workout.title` 關鍵字比對。
3. 都判不出來 → 歸「未分類」，**不計入任何類別**，也不要猜。

### 建議實作

**新檔 `src/lib/splitRotation.ts`**（純函式，好測試，UI 不碰資料層）：

```ts
export type SplitCategory = '拉' | '推' | '腿' | '手';
export const SPLIT_CATEGORIES: SplitCategory[] = ['拉', '推', '腿', '手'];

/** 把 slot label 或訓練標題正規化成四類之一；判不出來回 null */
export function normalizeSplit(text: string | undefined): SplitCategory | null

export interface SplitStatus {
  category: SplitCategory;
  lastTrainedAt: number | null;   // 最近一次該類訓練的 startedAt
  daysAgo: number | null;         // 距今幾天（無紀錄為 null）
  doneInWindow: boolean;          // 滾動 7 天內是否練過
}

export function getSplitRotationStatus(
  workouts: Workout[],          // 已完成的訓練
  program: TrainingProgram | null,
  now: number,
  windowDays = 7,
): SplitStatus[]
```

`normalizeSplit` 的關鍵字比對建議（**要能吃掉 `拉 (Pull)` 這種帶英文括號的格式**）：

| 類別 | 比對關鍵字 |
|---|---|
| 拉 | `拉`、`Pull`、`背` |
| 推 | `推`、`Push`、`胸`、`肩` |
| 腿 | `腿`、`Leg`、`臀`、`深蹲` |
| 手 | `手`、`Arm`、`二頭`、`三頭` |

⚠️ **順序陷阱**：「手」的比對一定要排在最後，否則 `手臂日` 沒問題但**「推」的判定若先用單字 `手` 掃就會誤中**；更實際的是 `拉` 要先於 `手`，因為某些標題可能同時出現。實作建議用「依序 return 第一個命中」並用測試把 `拉 (Pull)` / `推 (Push)` / `腿 (Leg)` / `手 (Arms)` / `手臂日` / `背日` / `胸日` 全部釘住。

**滾動 7 天的定義**：`now - 7 * 86400000 < workout.startedAt <= now`。用 `startedAt`（訓練發生當下）而非 `endedAt` 或 `updatedAt`，才不會因為事後編輯而跳動。

⚠️ **時區陷阱**：`daysAgo` 要用**日曆天**算（把兩邊都 normalize 到當地時間的 00:00 再相減），不要用 `(now - t) / 86400000` 取整——不然昨天晚上 11 點練的，今天早上 8 點會顯示「0 天前」，很怪。

### UI 放哪
放在**訓練頁（`WorkoutLogger.tsx`）課表卡片之內**，接在既有的「循序列表」（`:305-324`）和「今日該練」（`:326-...`）之間。理由：這裡已經是「我今天該練什麼」的決策現場，輪動狀態就該長在這裡，不用另開分頁（BottomNav 已經 8 顆，塞不下了）。

視覺建議（沿用現有 Tailwind 語彙，**只用標準色階**——`slate-850` 這種 Tailwind v4 會靜默吞掉，見 ROADMAP §6）：

```
最近 7 天輪動                         3 / 4
[✓ 拉 2天前] [✓ 推 4天前] [✓ 手 6天前] [○ 腿 11天前]
```

- 已達成：綠色實心 chip（`bg-emerald-100 text-emerald-700 border-emerald-200`）
- 未達成：灰色空心 chip（`bg-slate-100 text-slate-500`），若超過 10 天用琥珀/紅色提示
- 從未練過：顯示「未練過」而非「null 天前」
- 右上角 `n / 4` 進度數字
- 沒有 active program 時：整塊不顯示（沒有課表就沒有輪動的概念）

### 測試（`src/lib/__tests__/` 下新增 `splitRotation.test.ts`）
專案已有 vitest 與三個測試檔的慣例，這支純函式很好測，請至少涵蓋：

1. `normalizeSplit` 對 `拉 (Pull)` / `推 (Push)` / `腿 (Leg)` / `手 (Arms)` 四個實際 label 正確回傳。
2. `normalizeSplit` 對 `背日` / `胸日` / `腿臀日` / `肩日` / `手臂日`（`WorkoutLogger.tsx:67-71` 的預設 slots）的行為符合預期。
3. 無法判定時回 `null`（例如 `有氧` / 空字串 / `undefined`）。
4. 7 天窗口邊界：第 6.9 天算達成、第 7.1 天不算。
5. 跨午夜的 `daysAgo`：昨晚 23:00 的訓練今早 08:00 要顯示 `1 天前` 不是 `0 天前`。
6. 完全沒有訓練紀錄時，四類都是 `doneInWindow: false` / `lastTrainedAt: null`，不會拋錯。

---

## 驗收清單

**#1 雲端同步**
- [ ] 手機打開 https://bigshop127.github.io/GymTracker/ ，設定頁**看得到**「帳號與雲端同步」區塊（基建已修好，這條現在應該就過）
- [ ] 手機登入 → 電腦登入同一 Google 帳號 → 電腦上的舊訓練出現在手機
- [ ] 手機新增一筆訓練 → **不關 App**，直接按同步 → 電腦重整後看得到（驗 1A）
- [ ] 電腦改一筆訓練備註 → 手機同步 → 手機看到新備註；**手機不會把舊備註推回去**（驗 1B）
- [ ] 手機刪一筆訓練 → 同步 → 電腦上也消失；再同步兩次**不會復活**（驗 1C）
- [ ] 關掉 App 重開，狀態列顯示「上次同步：…」而非「尚未同步」（驗 1D）
- [ ] 任何一頁的 header 都看得到同步鈕，按下去有明確回饋（驗 1F）
- [ ] 登出後再登入另一個帳號，**不會看到前一個帳號的資料**（驗 1D 的 uid 綁定）

**#2 RPE**
- [ ] 訓練頁 RPE 選單只有「無」+ 四句中文原文，文字沒被截斷、沒撐破版面
- [ ] 選了之後切到歷史頁，該組顯示對應短標籤
- [ ] 舊資料（RPE 7 / 8.5 / 9）在歷史頁仍顯示得出東西，不是空白

**#3 週輪動**
- [ ] 訓練頁課表卡片內出現「最近 7 天輪動」，四個 chip 狀態正確
- [ ] 練完一場「腿」後，腿的 chip 立刻變綠、`n / 4` 加一
- [ ] 8 天前練的那類會退回未達成
- [ ] 沒有 active program 時整塊不顯示、不報錯
- [ ] `npm run test` 新測試全綠

**全體**
- [ ] `eslint .` 零 error
- [ ] `npm run build`（`tsc -b && vite build`）零 error ——注意 VM/CI 的 `tsc -b` 比 `tsc --noEmit` 嚴格，一定要跑 `npm run build` 本身
- [ ] `npx vitest run` 全綠
- [ ] 搜一次 `-\d{2,3}` 確認沒有 `slate-850` 這類 Tailwind v4 無效色階

---

## Review 時 Claude 會特別盯的點

1. **UI 有沒有直接碰 Dexie**——新的軟刪除與輪動邏輯必須全部走 `src/db/` 與 `src/lib/`（ROADMAP §5 第一條）。
2. **墓碑濾除有沒有漏**——上面那張表 7 個讀取路徑，漏一個就是「刪了還在」。
3. **`updatedAt` 有沒有又被同步層改寫**——這是 1B 的根，改完要確認 `sync.ts` 裡沒有任何一處自己填 `Date.now()` 到 `updatedAt`。
4. **`lastSyncAt` 有沒有綁 uid**——沒綁就是跨帳號資料汙染。
5. **`normalizeSplit` 的比對順序**——用測試釘死，不要靠讀碼判斷。
6. **TS strict 零 `any`**，`SplitStatus.lastTrainedAt` 這種 nullable 有沒有守好。
