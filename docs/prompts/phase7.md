# Phase 7 — 範本 / 日曆 / 訓練地點 / 動作示意圖（v1.1）

> 前置：MVP v1.0 已上線（GitHub Pages）。本階段加 4 個使用者要求的功能。
> 分工：規格由我寫、你實作、我 review；**7D 的圖片素材由我提供**，你只負責顯示與接線。
> 建議實作順序（由小到大，每塊各自獨立、做完就給我 review）：**7C → 7A → 7B → 7D**。

---

## 資料模型變更（先看，貫穿全 Phase）

### schema.ts 新增/修改
```ts
// Workout 新增（非索引欄位，免動 Dexie schema）
interface Workout {
  // ...原欄位
  location?: string;        // 訓練地點，例如 '中壢建工'
}

// Settings 新增
interface Settings {
  // ...原欄位
  locations: string[];      // 可選地點清單，預設 ['中壢建工', '楊梅WG']
}

// 新增介面：訓練範本
interface WorkoutTemplate {
  id: string;
  name: string;             // 範本名稱，例如 '胸 + 三頭'
  location?: string;
  entries: WorkoutEntry[];  // 保留 weight/reps/isWarmup；completed 一律 false
  createdAt: number;
  updatedAt: number;
}
```

### ⚠️ Dexie 版本升級（最關鍵、做錯會掉資料）
**保留 version(1) 不動**，往後追加 version(2)，只宣告「新增的 store」：
```ts
this.version(1).stores({ /* 原樣，一字不改 */ });
this.version(2).stores({
  templates: 'id, name, createdAt',
});
```
- `location` / `locations` 不是索引欄位 → **不需要**寫進 stores()。
- 不要改寫 version(1) 的內容，否則既有使用者資料會出問題。

### Settings.locations 回填（既有安裝沒有這欄）
`db/settings.ts` 的 `getSettings()`：讀回 global 紀錄後，若 `locations` 為 undefined，**補上預設 `['中壢建工','楊梅WG']`** 再回傳（並順手寫回 DB）。DEFAULT_SETTINGS 也要含此欄。

---

## 7A — 訓練範本（保留重量）

### 目標
把某次訓練存成「範本」，下次點一下就帶著**上次的動作 + 重量/次數**開新訓練。

### 規格
- **新 db 層 `src/db/templates.ts`**：`listTemplates()`、`getTemplate(id)`、`saveTemplate(t)`（put）、`deleteTemplate(id)`。
- **另存為範本**：在兩處提供入口 ——
  1. History 既有的訓練明細抽屜 → 加一顆「存成範本」；
  2. WorkoutLogger 進行中訓練 → 「完成訓練」時詢問「要不要存成範本？」（或一顆獨立按鈕）。
  - 建立時：複製 entries，**保留 weight/reps/isWarmup**，`completed` 全設 false，**所有 id 重新產生**（exerciseId 不變）。彈窗讓使用者輸入範本名稱（預設帶該訓練 title 或日期）。
- **從範本開始**：在 `store/activeWorkout.ts` 新增 `startWorkoutFromTemplateEntity(t: WorkoutTemplate)`。
  - 沿用既有 **single-active 防呆**：若已有 active 訓練 → `throw new Error('ACTIVE_WORKOUT_EXISTS')`。
  - 與現有 `startWorkoutFromTemplate` 的差別：**這個要保留 weight/reps**（不要歸零）；title = `t.name`、location = `t.location`；`completed` 全 false、id 全新。
- **範本清單 UI**：放在「訓練」頁的**開始畫面**（目前只有「開始訓練」大按鈕的那個狀態），下方列出「我的範本」：每列顯示名稱、地點、動作數，點擊 → 帶重量開新訓練；長按或側邊提供刪除/改名。
  - 沿用 History 既有的攔截：若已有 active，先 `alert` 提醒，並 catch `ACTIVE_WORKOUT_EXISTS`。

### 驗收標準
- 完成一次訓練（有填重量）→ 存成範本 → 訓練頁開始畫面看得到該範本。
- 點範本 → 新訓練帶著**相同動作與重量/次數**，但每組都是未完成（沒打勾）。
- 已有進行中訓練時點範本 → 被擋下並提示，不會產生第二筆 active。

---

## 7B — 日曆

### 目標
完成的訓練自動標在日曆上，點某天看當天內容。

### 規格
- **併進「歷史」頁**，頂部加「清單 / 日曆」分段切換（**不開新分頁**，底部已有 5 顆）。
- 日曆：當月月曆格子（週日或週一起頭擇一，固定即可），可上/下月切換。
- 把已完成訓練依**本地日期**（由 `startedAt` 取 `YYYY-MM-DD`）分組；有訓練的日子顯示圓點/底色。
- 點某一天 → 顯示當天的訓練（可重用既有明細抽屜，或在日曆下方列出當天卡片）。顯示 title + 地點。
- 不引入大型日曆套件，用原生 `Date` 自己排格子即可。

### 驗收標準
- 完成今天的訓練 → 日曆今天出現標記。
- 點有標記的日子 → 看到當天訓練內容與地點。
- 跨月切換正常，當天有視覺強調（today highlight）。

---

## 7C — 訓練地點

### 目標
每次訓練可選地點（中壢建工 / 楊梅WG），清單可在設定頁自己增刪。

### 規格
- `Settings.locations: string[]`，預設 `['中壢建工','楊梅WG']`（含上面的回填邏輯）。
- **設定頁**：新增「訓練地點」區塊，可新增 / 刪除 / 重新命名地點（至少新增 + 刪除）。
- **WorkoutLogger**：進行中訓練頂部加一個地點下拉選單（選項 = `settings.locations`）；改選即存進 `activeWorkout.location`（結構性變更 → 立即存，走 `saveWorkoutImmediate` 那條，不要 debounce）。
  - 開新訓練時，預設帶上**上一次完成訓練的地點**（找不到就留空或第一個）。
- **顯示**：History 列表/明細、日曆當天卡片，都顯示地點（沒選就不顯示）。

### 驗收標準
- 設定頁新增一個地點 → 訓練頁下拉立刻出現。
- 選好地點完成訓練 → 歷史與日曆都看得到該地點。
- 刪除某地點不影響已存的歷史紀錄（歷史存的是字串快照）。

---

## 7D — 動作示意圖（素材我給，你接線）

### 目標
動作庫每個動作顯示「起始 / 結束」兩張示意圖。

### 我提供
- 靜態圖檔放 `public/exercises/<slug>/0.jpg`、`1.jpg`（公眾領域/開放授權來源，英文動作真人示範照，已對應到你的中文動作）。
- 對應表 `src/data/exercise-images.ts`：以**動作中文名稱**為 key（內建動作用隨機 UUID，名稱才跨裝置穩定）：
  ```ts
  export const EXERCISE_IMAGE_SLUGS: Record<string, string> = {
    '槓鈴臥推': 'barbell-bench-press',
    // ...
  };
  export function getExerciseImages(name: string): string[] {
    const slug = EXERCISE_IMAGE_SLUGS[name];
    if (!slug) return [];
    return [0, 1].map((i) => `${import.meta.env.BASE_URL}exercises/${slug}/${i}.jpg`);
  }
  ```
  - 注意路徑用 `import.meta.env.BASE_URL`（部署在 `/GymTracker/` 子路徑）。

### 你做
- **ExerciseList 管理模式展開區**：若 `getExerciseImages(ex.name).length > 0`，並排顯示兩張圖（標「起始 / 結束」），點圖可放大；沒對應到就**不顯示圖片區**（優雅降級）。
- 自訂動作目前沒有圖（之後 v1.2 再做「自己上傳」）。

### ⚠️ PWA 快取（避免把離線包撐爆）
- 圖片**不要進 precache**：在 `vite.config.ts` 的 VitePWA `workbox` 設 `globIgnores` 排除 `exercises/**`，並加一條 runtime caching（CacheFirst）規則快取 `/exercises/` → 看過的圖才存、離線可重看，但安裝包維持精簡。

### 驗收標準
- 動作庫展開「槓鈴臥推」等有對應的動作 → 看到起始/結束兩張圖。
- 沒對應的動作（如跑步機）→ 不顯示圖片區、不破版。
- build 後 precache entries 數量**沒有**爆增（圖片走 runtime cache）。

---

## 注意
- 每塊做完先各自 build/lint/test + 給我 review，再進下一塊。
- 動到 schema 時，記得同步更新 `docs/ROADMAP.md` §2 資料模型。
- 完成後即 v1.1；「自己上傳動作圖」「依地點篩進度」「雲端同步」留 v1.2+。
