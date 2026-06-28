# Phase 9（v1.3）規格 — 訓練頁修正 + 動作庫示意圖縮圖

> 工作協議：本規格由 Claude 擬，**你自己寫 code**，再讓 Claude **獨立 review**（重跑 `eslint .` / `tsc -b && vite build` / `vitest`、讀變更檔對照驗收）。過了才 commit/push。
>
> 本階段 **無 Dexie schema 變更**。共三項：①修 NumberStepper 行動端輸入 ②移除組間休息選單 ③動作庫卡片加示意圖縮圖。

---

## #1（Bug）NumberStepper 行動端「重量／組數」可正常編輯

### 症狀
訓練頁的重量、組數 **加減鈕與直接打字都無法調整**。

### 根因（已讀碼確認，`src/components/NumberStepper.tsx`）
目前是 **受控 `type="number"`**，且 `handleInputChange` 在**每一次按鍵**就 `parseFloat` + `toFixed(decimals)` 回寫，並用 `value={value || ''}` 反向覆蓋輸入框：

```ts
const val = parseFloat(e.target.value);
if (isNaN(val)) return;          // 一清空就 return → 無法刪到空、無法重打
...
onChange(Number(sanitizedVal.toFixed(decimals)));  // 每按一鍵就重新格式化
```

行動裝置上的後果：
- **打不了小數**：重量 `decimals=1`，打 `12.` 會被 `toFixed` 立刻吃成 `12`，小數點永遠輸不進去。
- **數字會跳掉／打不進**：受控值在每次 keystroke 被重寫，部分 Android 鍵盤會掉字、游標亂跳。
- 只剩 +/− 每次跳 2.5/1，要按到 80kg 不切實際 → 整體感覺「動不了」。

### 目標行為
1. 可以把框內清空、從頭重打一個完整數字（如 `80`）不掉字。
2. 重量可輸入小數（如 `12.5`）。
3. +/− 仍可逐步加減（重量步進 2.5、次數步進 1），且**畫面數字即時更新**。
4. 失焦（blur）時把內容正規化（`"80."`→`80`、空字串→`0` 或 `min`）。
5. Settings 頁的「預設休息秒數」也用同一個元件 → 一樣要正常（整數、step 可不同）。

### 建議實作（`NumberStepper.tsx`，你來寫）
- 元件內部維護一個 **`draft: string`** 狀態，作為輸入框 `value`（受控於 draft，不是直接受控於 prop）。
- **prop → draft 同步**：當輸入框**未聚焦**時，用 `useEffect` 把外部 `value` 寫進 `draft`（格式化成顯示字串）。聚焦中**不要**同步，避免覆蓋使用者正在打的字。可用 `isFocused` state 或 `onFocus/onBlur` 控制。
- **輸入框**：改 `type="text"` + `inputMode={decimals > 0 ? 'decimal' : 'numeric'}`（叫出數字鍵盤，又避開 `type=number` 的格式化／locale 雷）。
  - `onChange`：只允許「數字 + 最多一個小數點」（可用 regex 過濾，例如 `/^\d*\.?\d*$/`），`setDraft(filtered)`；若 `filtered` 能 parse 成有限數字，就 `onChange(clamp(parsed))`（**打字途中不要 `toFixed`**，否則又把小數點吃掉）。空字串或單獨 `.` 就只更新 draft、先不回寫數值。
  - `onBlur`：正規化 draft → 空/NaN 視為 `min`（預設 0），否則 `toFixed(decimals)`；同步 draft 與 `onChange`。
- **+/− 按鈕**：用目前數值（parse draft，falsy 時退回 prop `value`）做加減 → `clamp` → `toFixed(decimals)` → `onChange()`，並同步 `draft`。聚焦與否都要能用。
- `clamp`：套用 `min`/`max`（沿用現有 props）。
- **加大觸控目標**：+/− 至少 ~40×40px，方便單手按（目前 `px-2.5 + w-3 icon` 偏小）。
- **聚焦即全選**：輸入框 `onFocus` 時 `e.target.select()`，讓使用者一點進去就全選、打字直接取代（避免在預設 `0`/`0.0` 後面接字）。

### 驗收
- [ ] 重量框可清空、重打 `80` 不掉字；可輸入 `12.5`。
- [ ] 次數框只能整數，打字正常。
- [ ] +/− 仍正確步進且畫面即時更新。
- [ ] blur 後 `"80."`→`80`、空→`0`。
- [ ] 點進重量/次數框會自動全選，直接打字即取代既有值。
- [ ] **Settings 頁「預設休息秒數」** NumberStepper 仍正常（整數加減 + 打字）。
- [ ] 重量/次數的自動儲存仍是 debounce（store 的 `updateSet` 不用動）。

---

## #2 移除「組間休息時間」選單

### 改動（`src/pages/WorkoutLogger.tsx`）
1. **刪除**每個動作卡內的「⏱️ 組間休息時間 `<select>`」整塊（約 `291–313` 行那個 `<div className="px-4 flex items-center justify-between gap-2 text-xs">…</select></div>`）。
2. 完成打勾仍要觸發休息倒數，但**改用全域預設**。把 checkbox handler 內：
   ```ts
   const restSecs = entry.defaultRestSeconds ?? settings?.defaultRestSeconds ?? 90;
   ```
   簡化為：
   ```ts
   const restSecs = settings?.defaultRestSeconds ?? 90;
   ```
3. **移除未使用**：刪掉頂部 `useActiveWorkoutStore()` 解構中的 `updateEntryDefaultRestSeconds`（移除 select 後它變成未使用，eslint 會擋）。

### 不要動
- `schema.ts` 的 `WorkoutEntry.defaultRestSeconds?` 欄位**留著**（向後相容，舊資料/範本仍可能帶值，只是 UI 不再設定它）。
- store 的 `updateEntryDefaultRestSeconds` action 與 `templates.ts` 的複製邏輯**留著**（不影響、無 lint 問題，因為它是 store 物件屬性）。

### 驗收
- [ ] 訓練頁任何動作卡都不再出現「組間休息時間」那一列。
- [ ] 勾選完成一組仍會啟動休息計時器，秒數 = 設定頁的「預設休息秒數」。
- [ ] eslint 乾淨（無未使用的 `updateEntryDefaultRestSeconds`）。

---

## #3 動作庫卡片：示意圖縮圖（沒圖退回部位圖示）

### 目標
`動作庫`（與「加入訓練動作」選擇器，兩者共用 `ExerciseList`）每張動作卡的**主行**左側，直接顯示一張小縮圖，比純文字更直觀。

### 改動（`src/components/ExerciseList.tsx`）
- 卡片主行 `p-3.5 flex justify-between items-center` 內，把左側「名稱＋標籤」那塊 `<div className="space-y-1.5">` 與**新縮圖**包進一個 `flex items-center gap-3`，縮圖在左。
- 縮圖來源：`getExerciseImages(ex.name)[0]`（起始圖；本地檔，路徑已含 BASE_URL）。
  - 已 import：目前檔案頂部已有 `import { getExerciseImages } from '../data/exercise-images';`。
  - 需新增 import：`import { getMuscleIcon } from '../data/muscle-icons';`。
- **Fallback 規則**（建議抽一個小子元件 `ExerciseThumb`，內含 `useState(imgError)`）：
  1. `getExerciseImages(ex.name).length === 0`（例如自訂動作、無對應圖）→ 直接顯示**部位圖示**：在 `w-12 h-12` 圓角盒內置中渲染 `getMuscleIcon(ex.muscleGroup)` 的 SVG（`dangerouslySetInnerHTML`，作者自控字串、安全），用固定中性色（建議 `style={{ color: '#6366f1' }}` indigo-500，或 slate-400；**動態色一律走 inline style，勿拼 Tailwind class**）。
  2. 有圖 → `<img src={url} loading="lazy" onError={() => setImgError(true)} className="w-12 h-12 object-cover rounded-lg ...">`；`onError` 觸發時改渲染上面的部位圖示 fallback（避免破圖 icon）。
- 尺寸/樣式：`w-12 h-12`（48px）、`rounded-lg`、`object-cover`、`border border-slate-100 dark:border-slate-800`、底色 `bg-slate-100 dark:bg-slate-800`。
- **兩種 mode 都顯示**（`manage` 與 `select` 共用此卡，皆受益）。manage 模式展開後的「示意圖 起始/結束」大圖區塊**維持原樣**，縮圖只是常駐的小預覽。

### 驗收
- [ ] 每張動作卡左側都有 48px 縮圖；有對應圖的顯示真人示意圖。
- [ ] 無對應圖的動作（如自訂動作）顯示該肌群的部位圖示，不是破圖。
- [ ] 動作庫頁與「加入訓練動作」選擇器都正常。
- [ ] 窄螢幕不溢出，名稱/標籤照常換行。

---

## 全域檢查清單（完成前自查）
- **Tailwind v4**：任何動態顏色（部位圖示色）用 inline `style`，不要拼 `text-${x}` class；改完搜 `-\d{2,3}` 確認沒打到非標準色階（合法只有 50/100/.../900/950）。
- **TS strict**：零 `any`；新子元件 props 標好型別。
- **無 Dexie schema 變更**。
- **不破壞既有**：自動儲存、休息計時器、範本、Settings 的 NumberStepper。
- **獨立驗證**（review 時 Claude 會重跑）：`eslint .`、`tsc -b && vite build`、`vitest`。
- 三項都過 review 後再同步：`docs/ROADMAP.md` 加 Phase 9（v1.3）列、Obsidian `健身APP開發/`、Claude 記憶。

## 建議實作順序
1. **#2 移除休息選單**（最小、先清掉雜訊）。
2. **#1 NumberStepper 修正**（核心 bug；改完先在 Settings 頁與訓練頁各測一次）。
3. **#3 動作庫縮圖**（純顯示，獨立）。
