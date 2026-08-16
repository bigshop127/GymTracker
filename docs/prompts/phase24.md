# Phase 24（v1.18）進度頁與歷史清單視覺強化

> 觸發：2026-08-16 討論 Phase 23 配色時，一併問了「整個 GymTracker 還有哪些地方可以優化」，得到的偏好是「顏色對比明顯、圖文並茂的可視化圖表/表格」。查過現況：整個 App 目前只有一種強調色（`indigo-600`），Progress 頁的趨勢圖只有單一靛藍線條、兩張 PR 卡片（最佳 1RM／歷史最大重量）用同一個顏色沒有區分；`getMuscleIcon`（部位圖示）／`getLocationColor`（地點色）這套圖示+配色系統其實已經在日曆檢視（`ProgramGuide.tsx`、`History.tsx` 的日曆檢視）用得很成熟，但 History 的**清單檢視**跟 Progress 頁完全沒用到。
>
> 本文＝規格，跟 Phase 23（班表頁演算法/UI）主題無關，刻意分開兩份規格，避免 diff 混在一起。這次**全部重用既有的 `getLocationColor`／`getMuscleIcon`／`getDaySummary`（`src/lib/locationStyle.ts`、`src/data/muscle-icons.ts`、`src/lib/workoutSummary.ts`），不新增顏色系統、不改 schema**。依工作協議（[[gymtracker-working-agreement]]）由你自己動手寫 code。

---

## 0. 核心設計決策

1. **Progress 頁的兩張 PR 卡片改成各自的識別色，不要兩張都是 `indigo-600`。**
   - 「最佳預估 1RM」卡片：維持 `indigo`（跟 App 既有主色一致，當作「主要指標」）。
   - 「歷史最大重量」卡片：改成 `amber`（跟 1RM 卡片並排時一眼能分辨是兩個不同數字，不是同一件事重複顯示兩次）。
   - 目前卡片右上角的 🏆／💪 emoji 只是裝飾用的背景大圖示（`opacity-25`），這次維持不動，只改文字/數字的顏色。
   - **為什麼**：現在兩張卡片除了標題文字不同、視覺上幾乎是同一張卡片複製貼上，掃過去容易看錯成同一個數字；分開配色不需要新邏輯，純粹換 class。

2. **趨勢圖每個資料點的圓點顏色改成「當次訓練地點」色，線本身維持中性色。**
   - 目前 `Line` 的 `dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}` 是純白圓點，看不出每次紀錄是在哪練的。
   - 改成自訂 `dot` render function：依該資料點對應 workout 的 `location` 呼叫 `getLocationColor(location)` 決定填色，線本身（`stroke`）維持現有 indigo 不變——只有「點」帶地點色，不是整條線變色，避免多色線條反而看不出趨勢方向。
   - `calculateTrendPoints`（`src/lib/trends.ts`）目前回傳的資料點結構需要確認是否已經帶 `location` 欄位；如果沒有，要延伸這個純函式的回傳型別把來源 workout 的 `location` 一併帶出來，不要在元件裡另外重查一次 workouts 陣列。
   - **為什麼**：這個 App 已經用「地點→色」這套語言在日曆檢視標記每天在哪練，Progress 頁的趨勢圖延用同一套語言，而不是發明新的顏色規則，使用者不用重新學一套新的色彩含義。

3. **圖表卡片標題旁邊加上 `getMuscleIcon(selectedExercise.muscleGroup)`。**
   - 位置：「{metricLabel} 趨勢圖 ({metricUnit})」這行文字前面，比照 `ProgramGuide.tsx`/`History.tsx` 已經在用的渲染方式（`<svg viewBox="0 0 24 24" fill="currentColor" ... dangerouslySetInnerHTML={{ __html: markup }} />`，`markup` 是本檔案內建的靜態字串，非使用者輸入，`dangerouslySetInnerHTML` 用法安全，沿用現有慣例）。
   - 圖示顏色：這裡沒有「地點」語意（是「這個動作練哪個部位」，不是「這次訓練在哪」），直接用目前的 `indigo-600`／`text-slate-700` 文字色即可，不用另外配色。
   - **為什麼**：這套圖示資產已經做好、在其他頁面驗證過好用，Progress 頁反而是「進度／表現」這個最該圖文並茂的頁面卻完全沒用到，屬於最低成本的補強。

4. **History 清單檢視每張卡片加一個部位圖示＋地點色徽章。**
   - 位置：卡片標題列（`workout.title` 那一行）左側，跟現有「訓練歷史」日曆格子同一套視覺語言。
   - 資料來源：`getDaySummary([workout], exerciseMap)` 算出 `{ location, primaryMuscle }`（這個函式本來就是給單一 workout 陣列用的純函式，`ProgramGuide.tsx` 已經是用 `getDaySummary([actualWorkout], exerciseMap)` 這種單一 workout 包陣列的方式呼叫，直接照搬），`primaryMuscle` 決定圖示形狀，`location` 經 `getLocationColor` 決定顏色。
   - 找不到 `primaryMuscle`（例如舊資料/動作已被刪除）時優雅降級：不顯示圖示，維持現有純文字版面，不要顯示破圖或空白方塊。
   - **為什麼**：清單檢視是最常被拿來快速掃過去回顧「這陣子練了什麼」的畫面，目前全是文字，加圖示徽章跟日曆檢視的視覺語言一致，掃描起來更快也更好看。

---

## 1. 檔案異動

### `src/lib/trends.ts`

`calculateTrendPoints` 回傳的資料點型別新增 `location?: string`（從對應 workout 帶出來，不新增查詢，函式內本來就拿得到來源 workout）。檢查既有呼叫端（目前只有 `Progress.tsx`）不會因為多一個選填欄位而型別出錯。

### `src/pages/Progress.tsx`

- PR 卡片區塊：「歷史最大重量」卡片的 `text-indigo-600 dark:text-indigo-400` 改成 `text-amber-600 dark:text-amber-400`（僅文字顏色，卡片底色/邊框不變，維持現有 `bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800` 讓兩張卡片還是同一套外框語言，只有內容色不同）。
- `Line` 的 `dot` prop 改成自訂 render function，依資料點 `location` 呼叫 `getLocationColor`。
- 趨勢圖卡片標題那行前面加 `getMuscleIcon(selectedExercise.muscleGroup)` 渲染的小圖示。

### `src/pages/History.tsx`

- 清單檢視每張卡片的標題列，`workout.title` 文字前面加部位圖示（`getMuscleIcon` + `getLocationColor`），沿用 `getDaySummary([workout], exerciseMap)` 取資料。
- 日曆檢視本身已經有這套視覺（不用動），這次只補清單檢視這一半。

---

## 2. 驗收標準

1. Progress 頁「最佳預估 1RM」與「歷史最大重量」兩張卡片顏色不同（indigo vs amber），淺色/深色模式下都要能分辨。
2. 趨勢圖上每個資料點的顏色對應該次訓練地點（比照日曆檢視的地點色），把滑鼠/手指停在點上看到的 tooltip 內容不變（只改點的填色，不改互動邏輯）；沒有 `location` 的舊資料點優雅降級成現有的中性色，不報錯。
3. 趨勢圖卡片標題旁邊看得到對應動作部位的圖示。
4. History 清單檢視每張卡片能看到部位圖示＋地點色，找不到部位資料時不顯示圖示但版面不跑版、不報錯。
5. `eslint .`／`npm run build`／`vitest` 全過，不新增 Tailwind 無效色階（`dark:` 對應色齊全）。

---

## 3. 這版刻意不做

- 不重新設計卡片版面配置（間距、圓角、字級不動），只換顏色/加圖示，維持現有版面骨架。
- 不做「依部位篩選歷史清單」這種新功能——圖示只是視覺標記，不接篩選邏輯。
- 不動日曆檢視（`History.tsx`／`ProgramGuide.tsx`／Phase 23 的 `SchedulePage.tsx`）的既有配色，這幾處已經在用這套語言，不重複改。
- 不新增第三方圖表庫或圖示庫，維持現有 Recharts + 自製 SVG markup 兩套既有資產。

---

## 4. 實作順序建議

1. `trends.ts` 加 `location` 欄位（純函式改動，先確認型別不破壞既有呼叫端）。
2. `Progress.tsx`：PR 卡片配色、`dot` 自訂 render、標題圖示，三個獨立小改動，改一項测一次比較好抓問題。
3. `History.tsx`：清單卡片加圖示徽章。
4. `npm run build` + `vitest` + `eslint .` 全過 → 交給 Claude review。
