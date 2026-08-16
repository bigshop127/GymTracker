# Phase 22（v1.16）月曆長按拖曳批次編輯班表

> 觸發：2026-08-16 使用者需求——Phase 21 的月曆目前只能一天一天點選登記班別，太慢。需求釐清後確認是：
> 「我可以手動輸入，當我點選單日可以標記單日，當我滑動（例如週一滑到週五）可以批量修改，預設班別就是 AB 等等班別」
>
> 也就是說：**不是外部資料匯入**（不接第三方 App、不做 OCR、不做檔案匯入——原本以為的「匯入」問過後排除了），而是**月曆本身的互動升級**：單日點擊維持不變，另外加一個「長按+拖曳整段範圍→一次套用同一組班別」的批次編輯手勢。
>
> 本文＝規格。依工作協議，由你自己動手寫 code（[[gymtracker-working-agreement]]；除非你看完想直接說「幫我改好」）。建立在 Phase 21（`docs/prompts/phase21.md`，已上線 commit `954e06b`）的 `dayOverrides` 資料層之上，這次不動 schema。

---

## 0. 核心設計決策

1. **互動方式：長按（約 400ms）進入「範圍選取模式」，手指不放繼續拖曳延伸範圍，放開送出**——不是一碰到就判定成拖曳。
   - **為什麼**：月曆格子上下都是要垂直捲動的頁面內容。如果一開始按下就要判斷「這是要選取範圍還是要捲頁面」，手機上很容易誤觸。長按是明確的「進入選取模式」訊號，之後同一次觸控的移動才算範圍選取；沒觸發長按的一般滑動，頁面照常捲動，兩者不衝突。
   - 單一日期點擊（不觸發長按）的行為完全不變，還是跳現有的單日編輯 sheet（`ProgramGuide.tsx:270` 那個 `onClick`）。
   - **實作上要把現有的 `onClick` 整個換成 pointer 事件系列（`onPointerDown/Move/Up`）自己判斷「這次是點擊還是長按拖曳」，不要兩套並存**——並存的話一般點擊會同時觸發 `onClick` 和 `onPointerUp` 的邏輯，變成雙重觸發、有時候還會兩個 sheet 打架。
   - **iOS Safari 的坑**：`<button>` 上長按預設可能跳出系統的複製/分享 callout，要另外用 CSS（`-webkit-touch-callout: none`、`user-select: none`）擋掉，不然使用者長按時會先看到系統選單而不是你的範圍選取。
2. **批次編輯的 sheet 直接沿用單日編輯 sheet 的介面**（A/B/C 複選、休假互斥按鈕、暫停 checkbox），只是標題換成「編輯 8/17 ~ 8/21（5 天）」，存檔時對範圍內每一天套用**同一組設定，整段覆寫**（不是合併，不管那幾天原本個別登記了什麼，存檔後都變成同一個值）。
   - **為什麼**：使用者說的「批量修改，預設班別就是 AB」，語意上就是「這幾天都設成 AB」，跟單日編輯是同一件事只是作用範圍變大，重用整套 UI/儲存邏輯最省工，也不會出現「單日跟批次兩份平行邏輯以後改一邊忘記改另一邊」的分岔。
   - 批次 sheet 開啟時**不**回填任何一天的現有登記（單日 sheet 會回填該天現況，但批次橫跨多天、各天原本可能不一樣，沒有單一「現況」可回填）——一律從空白狀態開始勾選。
3. **範圍限制在目前顯示的這個月，不能跨月、不能選到已過去的日期。**
   - 從已過去的日期格開始長按，不會進入選取模式（比照既有 `disabled={isPast}` 規則，過去日期本來就唯讀）。
   - 拖曳途中如果經過月曆的留白格（上/下月份，`dateStr === null`）或過去日期，那些格子直接不計入範圍，範圍就停在最後一個有效格。
   - **為什麼不做跨月**：目前月曆一次只渲染一個月（`buildCalendarGrid(currentMonth)`），跨月要處理「拖到邊界自動翻頁再繼續選」，複雜度不低，這次先不做，真的需要再開下一階段。
4. **新增 `bulkSaveDayOverride`，不要在 UI 端迴圈呼叫 `saveDayOverride` N 次。**
   - **為什麼**：N 次個別呼叫是 N 個獨立 Dexie transaction，每筆 `updatedAt` 時間點也會有微小差異；包成一個 `bulkPut` 在單一 transaction 做完，效能好、範圍內每一天共用同一個 `updatedAt`，同步時是乾淨的一批（這個專案的 `backup.ts` 本來就有用 `bulkPut` 的既有慣例，跟著用）。
   - **不用改 schema、不用改 `sync.ts`／`backup.ts`**——`dayOverrides` 表結構完全沒變，範圍內的每一天還是各自獨立一筆 `DayOverride`，只是這次一次寫入 N 筆，同步管線不用動。

---

## 1. 資料層新增（`src/db/dayOverrides.ts`）

```typescript
export async function bulkSaveDayOverride(
  dateStrs: string[],
  input: Omit<DayOverride, 'id' | 'updatedAt'>
): Promise<void> {
  const now = Date.now();
  const records: DayOverride[] = dateStrs.map((id) => {
    const record: DayOverride = { ...input, id, updatedAt: now };
    delete record.deletedAt;
    return record;
  });
  await db.dayOverrides.bulkPut(records);
}
```

清除範圍：沒有另外包 bulk 版本，直接在 UI 端對範圍內每個日期呼叫既有的 `clearDayOverride`（軟刪除、資料量小，N 次呼叫可接受）。

---

## 2. 互動與 UI（`src/pages/ProgramGuide.tsx`）

新增本地狀態：

```typescript
const [dragStartDateStr, setDragStartDateStr] = useState<string | null>(null);
const [dragEndDateStr, setDragEndDateStr] = useState<string | null>(null);
const [isRangeSelecting, setIsRangeSelecting] = useState(false);
const [rangeEditDates, setRangeEditDates] = useState<string[] | null>(null); // 開批次 sheet 用
```

每個日期格子（現有的 `<button>`，`ProgramGuide.tsx:264-296` 附近）：

- `onPointerDown`：記下按下的日期，啟動一個 ~400ms 計時器；若計時器還沒到、手指/游標就移動超過一點誤差值（例如 10px），視為正常捲動／誤觸，取消計時器，什麼都不做。
- 計時器觸發（真的長按住沒放且沒被取消）→ `isRangeSelecting = true`、`dragStartDateStr = dragEndDateStr = 該格日期`；此時才鎖住這次觸控（CSS `touch-action: none` 或對應處理），避免接下來的拖曳被頁面滾動吃掉。
- 長按觸發之後，手指/游標移動到別的格子（`onPointerMove` 配合逐格命中判斷，或改用 `onPointerEnter` 逐格觸發）→ 更新 `dragEndDateStr`；碰到過去日期或留白格則不更新（範圍停在最後一個有效格）。
- 拖曳經過的格子要有清楚的視覺反白（例如疊一層 `ring-2 ring-indigo-400`），跟現有 `isToday` 的高亮樣式區隔開，不要混在一起看不出差異。
- `onPointerUp`：
  - 若 `isRangeSelecting === true` → 把 `dragStartDateStr`／`dragEndDateStr` 依日期字串排序取出範圍內所有 `dateStr`，存進 `rangeEditDates`，開批次編輯 sheet；重置 `isRangeSelecting`／`dragStartDateStr`／`dragEndDateStr`。
  - 若 `isRangeSelecting === false`（代表沒觸發長按，是一般點擊放開）→ 走現在 `onClick`（`ProgramGuide.tsx:270`）原本的單日編輯邏輯。

批次編輯 sheet：複製現有單日 sheet（`ProgramGuide.tsx:448` 起）的結構，差異只有：

- 標題顯示「編輯 {起始日} ~ {結束日}（{N} 天）」，不是單一日期。
- 開啟時不回填任何內容，A/B/C、休假、暫停都從未選狀態開始（理由見 §0-2）。
- 存檔呼叫 `bulkSaveDayOverride(rangeEditDates, {...})` 取代單日的 `saveDayOverride`。
- 「清除登記」對 `rangeEditDates` 內每個日期各呼叫一次 `clearDayOverride`。
- 存檔／清除後一樣 `setReloadTrigger((t) => t + 1)` 讓月曆重新抓資料，不需要額外「更新」按鈕（沿用 Phase 21 已經有的機制）。

---

## 3. 驗收標準

1. 一般點一下（沒有長按）任何今天/未來日期格，行為與 Phase 21 完全一致，不會誤觸批次模式。
2. 長按今天/未來日期格 ≥ 400ms 後拖曳到另一天放開，跳出「編輯 X ~ Y（N 天）」sheet；選 A/B/C 或休假＋暫停後存檔，範圍內每一天都被整段覆寫成同一組設定，不用任何額外「更新」按鈕就反映在月曆與首頁建議上。
3. 長按/拖曳過程中，正在被選取的格子有清楚視覺反白，跟 `isToday` 既有高亮不會混淆。
4. 從已過去的日期格開始長按，不會進入選取模式；拖曳範圍中途碰到過去日期或月曆留白格會被自動排除，不會整段操作失敗或當掉。
5. 長按觸發後，這次觸控不會同時讓頁面往下捲動；沒有觸發長按的一般滑動，頁面仍可正常捲動。iOS 上長按不會跳出系統複製/分享選單。
6. 批次存檔後兩台裝置同步，範圍內每一天都正確互通（沿用 Phase 21 既有的 `dayOverrides` 同步管線，這步只是確認沒有意外繞過）。
7. `eslint .`／`npm run build`（`tsc -b`）／`vitest` 全過，不新增 Tailwind 無效色階（`dark:` 對應色齊全）。

---

## 4. 這版刻意不做

- 不做跨月拖曳自動翻頁（拖到月曆邊界不會自動翻下個月繼續選）。
- 不做「批次編輯只覆寫有勾選的欄位、其餘保留各天原本設定」這種合併語意——一律整段覆寫，理由見 §0-2。
- 不做桌面滑鼠版的框選特效優化——`onPointerDown/Move/Up` 系列事件滑鼠上一樣能動（長按=按住不放再移動），先共用同一套邏輯，之後體驗不好再回頭看。
- 不做外部班表 App 的資料匯入／OCR／檔案匯入——這份規格一開始的「匯入」問清楚後，確認使用者要的其實是這份手勢升級，不是外部資料匯入；真的要接外部資料是完全不同規模的另一個題目，需要另外討論。

---

## 5. 預期動到的檔案

```
src/db/dayOverrides.ts       + bulkSaveDayOverride
src/pages/ProgramGuide.tsx   月曆格子改用 pointer 事件（長按判斷＋拖曳範圍反白）＋新增批次編輯 sheet
docs/ROADMAP.md              完工後補一列 Phase 22（v1.16）
```

---

## 6. 實作順序建議

1. `dayOverrides.ts` 加 `bulkSaveDayOverride`（最底層，且可以獨立寫單元測試驗證 bulkPut 行為）。
2. 先做「長按判斷＋取消機制」本身（計時器＋移動誤差容忍），用 `console.log` 或暫時的邊框顏色確認長按有正確觸發、一般滑動不會誤觸，再接下一步。
3. 接拖曳範圍計算＋格子反白視覺。
4. 複製單日 sheet 做成批次版本，接上 `bulkSaveDayOverride`／清除邏輯。
5. iOS 實機測試長按有沒有跳出系統選單、有沒有跟頁面捲動打架（這兩個坑模擬器不一定測得出來，盡量找實機測）。
6. `npm run build` + `vitest` + `eslint .` 全過 → 交給 Claude review。
