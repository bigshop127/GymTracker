# Phase 14（v1.8）規格 — 1RM 計算機分頁

> 工作協議：本規格由 Claude 擬，**你自己寫 code**，再讓 Claude **獨立 review**（重跑 `eslint .` / `tsc -b && vite build` / `vitest`、讀變更檔對照驗收）。過了才 commit/push。
>
> 本階段 **無 Dexie schema 變更**（純計算工具頁，不存資料）。參考來源：https://audilu.com/rm/ （簡易 1RM 計算機，輸入重量+次數 → 估算單次最大肌力，公式標註參考 ACE Fitness）。

---

## 背景

App 目前的 E1RM 運算（`src/lib/e1rm.ts`）只用在「進度頁」，且**綁定實際訓練紀錄**（要先有 log 的組數才算得出趨勢）。使用者想要的是像參考網站那樣的**獨立速算工具**：不用選動作、不用先記錄，隨手輸入「這組扛了多重、做了幾下」就能立刻看到估算 1RM，方便訓練前抓熱身/工作重量。

## 目標

新增一個獨立分頁「1RM 計算機」，兩個輸入框（重量、次數）→ 即時顯示估算 1RM。**沿用既有 `calculateE1rm()`，不要另外造一份公式**（守 ROADMAP §0 核心原則 5「運算單一來源」）。

## 路由與導覽

- 新頁面：`src/pages/RmCalculator.tsx`。
- 路由：`App.tsx` 新增 `<Route path="/calculator" .../>`，比照 `Progress`/`ProgramGuide`/`ExerciseTracker` 用 `lazy()` + `Suspense`（fallback 文案照現有風格，例如「載入計算機中...」）。
- `BottomNav.tsx` 新增第 8 個 `NavItem`（放在「追蹤」之後、「設定」之前），`label="1RM"`，`to="/calculator"`，圖示可用 heroicons 風格的計算機圖示（`viewBox="0 0 24 24"`、`stroke="currentColor"`，路徑自選，只要視覺上看得出是計算機即可，非硬性規定）。

**⚠️ 請你自己實裝完後在手機瀏覽器（或縮小視窗）實測一次**：目前 BottomNav 已有 7 個圖示，塞進第 8 個之後，`max-w-md` 寬度下每個觸控目標會變窄，可能違反核心原則「手機單手操作：大按鈕」。如果實測覺得太擠／誤觸，回報給 Claude，我們再討論是否要縮小 label 字級、或改成把這頁的入口放在「設定頁」的一個連結而不占 BottomNav 名額——先按 8 個圖示做，有問題再調整，不要先猜測著手動 BottomNav 的整體排版。

## 頁面內容（`RmCalculator.tsx`）

- 標題「1RM 計算機」+ 一行說明文字（例如「輸入你剛完成的重量與次數，估算單次最大肌力」）。
- 兩個輸入，沿用既有 `NumberStepper`（`src/components/NumberStepper.tsx`，簽名 `{ value, onChange, step, min?, max?, decimals? }`）：
  - **重量**：`step=2.5`、`min=0`、`decimals=1`，單位標籤讀 `useSettingsStore((s) => s.settings?.unit)`（`'kg' | 'lb'`），顯示在輸入框旁（例如「重量 (kg)」）。**不需要做 kg/lb 換算**——`calculateE1rm` 是純比例公式（`w × (1 + reps/30)` 等），輸入單位就是輸出單位，直接把使用者打的數字丟進去即可，結果一樣標同一個單位。
  - **次數**：`step=1`、`min=1`、`max=20`（超過 20 下的估算誤差已經很大，比照一般業界慣例上限）、`decimals=0`。
- **公式**：讀 `useSettingsStore((s) => s.settings?.e1rmFormula)`（`'epley' | 'brzycki'`，預設 `'epley'`），呼叫 `calculateE1rm(weight, reps, formula)`。**不要在這頁加公式切換 UI**——沿用全域設定頁既有的 Epley/Brzycki 切換，維持單一設定來源；頁面上用一行小字註明目前用的公式（例如「使用 Epley 公式估算・可於設定頁調整」），文字可依 `formula` 值動態換。
- **結果顯示**：大字體顯示估算 1RM（保留 1 位小數，`toFixed(1)`），輸入為 0 或次數為 0 時顯示空/佔位符號（例如 `--`），不要顯示 `0.0` 造成誤解（`calculateE1rm` 在 `weight<=0 || reps<=0` 時回傳 0，這頁要另外判斷並顯示佔位，不要直接把 0 當結果秀出來）。
- 版面比照其他頁的卡片風格（`bg-white dark:bg-slate-900`、圓角、`border border-slate-200 dark:border-slate-800`），維持與 WorkoutLogger/Progress 一致的視覺語言，不用另創一套樣式。

## 不用做（避免超出範圍）

- 不用存資料庫、不用歷史紀錄。
- 不用做參考網站原本没有的 %1RM 對照表（例如 95%/90%/85%…速算表）——如果你自己做完覺得想要，可以之後再開一個小 phase 加，這次先照參考網站的最小範圍（重量+次數→單一估算值）做。
- 不用改 `e1rm.ts` 公式本身。

## 驗收

- [ ] BottomNav 新增「1RM」分頁，導向 `/calculator`，可正常進出。
- [ ] 輸入重量 100、次數 5，Epley 公式應顯示 `116.7`（100 × (1+5/30) = 116.666...）；切到 Brzycki 應顯示 `112.5`（100×36/32）。
- [ ] 切換設定頁單位 kg/lb，這頁輸入框旁單位標籤跟著變（不用換算數值，純換標籤文字）。
- [ ] 重量或次數為 0／空白時，結果顯示佔位符號而非 `0.0`。
- [ ] 次數上限 20、下限 1；重量下限 0、step 2.5。
- [ ] 深色模式視覺與其他頁一致。
- [ ] `eslint .` / `tsc -b && vite build` / `vitest` 全過。
- [ ] 過 review 後同步：`docs/ROADMAP.md` 加 Phase 14（v1.8）列、Obsidian `健身APP開發/`、Claude 記憶。
