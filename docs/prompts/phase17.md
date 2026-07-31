# Phase 17（v1.11）：動作庫整理 + 輔助重量 + 手臂細分

> 需求來源：2026-07-31 使用者實機回報 11 項。
> 前置：Phase 16 已上線；Dexie 目前最高 `version(9)`；內建動作 id ＝ `seed:動作名稱`（確定性 id）。

---

## 0. 一句話總結

動作庫的**內容**（拆分／分類／排序）與**檢索**（手臂細分）各修一輪，順手補「輔助重量」欄位與一個蓋住送出鈕的 z-index bug。

---

## 1. 需求對照表

| # | 需求 | 落點 |
|---|---|---|
| 1 | 滑輪下拉分寬握／窄握 | seed + version(10) 改名遷移 |
| 2 | 坐姿划船分寬握／窄握 | 同上 |
| 3 | 纜繩下壓分平把／繩索 | 同上 |
| 4 | 啞鈴飛鳥 改分類到「肩」 | seed + version(10) 回填 |
| 5 | 移除「斜板推」 | 宗諺課表資料 + version(10) 軟刪除 |
| 6 | 胸部動作順序：平板槓鈴/啞鈴 → 上斜槓鈴/啞鈴 | seed 順序 + 新的顯示排序函式 |
| 7 | 引體向上 加「輔助重量」欄位 | `SetLog.assistWeight` |
| 8 | 雙槓臂屈伸 加「輔助重量」欄位 | 同上 |
| 9 | 新增自訂動作沒有送出按鈕 | ExerciseList modal z-index |
| 10 | 手臂點進去可再細分二頭／三頭 | `Exercise.subGroup` + 第二排 chips |
| 11 | （併入 #6）動作庫排序整體失序 | `sortExercisesForDisplay()` |

---

## 2. ⚠️ 動手前必讀：改內建動作名稱＝換 id

`seedExerciseId(name)` 回傳 `seed:${name}`，所以**改一個內建動作的名字，等於把它的主鍵換掉**。若只改 `SEED_EXERCISES` 的字串而不做遷移，結果就是上週那個「讀取中...」bug 重演：舊的 workout／template 還指著 `seed:滑輪下拉`，而動作庫裡只剩 `seed:滑輪下拉（寬握）`。

本階段三組改名**一律走 version(10) 遷移**，並沿用 Phase 16.5 已建好的 `idAliases` 機制：

- `db.idAliases` 會參與雲端同步 → 另一台裝置拉到對照表後，`repairExerciseIds()` 會自動修好本機資料。
- `remapEntryExerciseIds()`（`src/lib/exerciseIdMap.ts`）已經寫好且有測試，直接重用，不要另寫一份。

反過來說：**只改 `muscleGroup` / 新增 `subGroup` 不會換 id**，那些欄位改動不需要 alias，但仍需要遷移去改既有 DB 的那一列（`seedExercisesIfEmpty()` 只補「缺少的名稱」，不會更新已存在的列）。

---

## 3. 資料層

### 3.1 `src/db/schema.ts` 型別

```ts
export type ArmSubGroup = '二頭' | '三頭';

export interface Exercise {
  // ...既有欄位
  subGroup?: ArmSubGroup;   // 目前只用於 muscleGroup === '手臂' 的細分；其他肌群留空
}

export interface SetLog {
  // ...既有欄位
  assistWeight?: number;    // 輔助重量（kg，正數＝被機器/彈力帶抵銷掉的重量）
                            // 純紀錄欄位：不進容量、不進 e1RM、不進 PR 判定
}
```

`assistWeight` 一律存 kg（與 `weight` 同規則，見 ROADMAP §6-3），顯示層才換算。

### 3.2 `src/data/seed-exercises.ts`

`ExerciseSeed` 加 `subGroup?: ArmSubGroup`。新的 `SEED_EXERCISES` 內容與**順序**如下（順序即顯示順序，見 3.4）：

```
// ---- 胸 ----（依需求 #6 改成 平板槓鈴 → 平板啞鈴 → 上斜槓鈴 → 上斜啞鈴）
槓鈴臥推(槓鈴) / 啞鈴臥推(啞鈴) / 上斜槓鈴臥推(槓鈴) / 上斜啞鈴臥推(啞鈴)
蝴蝶機夾胸(機械) / 纜繩夾胸(纜繩) / 雙槓臂屈伸（胸）(徒手) / 伏地挺身(徒手)
※ 啞鈴飛鳥 已移出（見「肩」）

// ---- 背 ----（維持原順序，變體緊接在本體後面）
引體向上(徒手)
滑輪下拉（寬握）(纜繩)      ← 原「滑輪下拉」改名
滑輪下拉（窄握）(纜繩)      ← 新增
槓鈴划船(槓鈴) / 啞鈴單手划船(啞鈴)
坐姿划船（寬握）(纜繩)      ← 原「坐姿划船」改名
坐姿划船（窄握）(纜繩)      ← 新增
T槓划船(槓鈴) / 硬舉(槓鈴) / 直臂下壓(纜繩)

// ---- 腿臀 ----（不動）

// ---- 肩 ----
槓鈴肩推 / 啞鈴肩推 / 啞鈴側平舉 / 啞鈴前平舉
啞鈴飛鳥(啞鈴)              ← 從「胸」移入（需求 #4）
反向飛鳥 / 臉拉 / 直立划船

// ---- 手臂 ----（全部帶 subGroup）
二頭：槓鈴彎舉 / 啞鈴彎舉 / 錘式彎舉 / 牧師彎舉 / 纜繩彎舉
三頭：纜繩下壓（平把）(纜繩)  ← 原「纜繩下壓」改名
      纜繩下壓（繩索）(纜繩)  ← 新增
      仰臥臂屈伸 / 啞鈴過頭臂屈伸 / 窄握臥推 / 雙槓撐體

// ---- 核心 / 有氧 ----（不動）
```

括號一律用**全形（）**，與既有的 `雙槓臂屈伸（胸）` 一致。

同檔另外匯出：

```ts
/** 可使用輔助重量（助力機／彈力帶）的動作，依名稱比對 */
export const ASSISTED_EXERCISE_NAMES = new Set<string>([
  '引體向上', '雙槓臂屈伸（胸）', '雙槓撐體',
]);
```

> 為什麼用名稱 Set 而不是 Exercise 欄位：這三個都是內建動作，名稱已是穩定主鍵的一部分；用 Set 可以零遷移、零同步成本。自訂動作要用輔助重量是之後的事，先不做。

### 3.3 `src/data/exercise-images.ts`

三個改名 + 三個新增，共六個名稱都要能拿到圖。**新舊變體共用同一張既有圖**（`public/exercises/` 沒有窄握下拉／繩索下壓的素材，不為此下載新資產）：

```ts
'滑輪下拉（寬握）': 'wide-grip-lat-pulldown',
'滑輪下拉（窄握）': 'wide-grip-lat-pulldown',
'坐姿划船（寬握）': 'seated-cable-rows',
'坐姿划船（窄握）': 'seated-cable-rows',
'纜繩下壓（平把）': 'triceps-pushdown',
'纜繩下壓（繩索）': 'triceps-pushdown',
```

同時把這六個名稱加進 `QCARD_NAMES`，並把舊的三個名稱從兩張表移除。
> 取捨：寬握與窄握會顯示同一張 Q 版圖卡。可接受（靠名稱分辨），總比灰底 fallback 好看。日後若要各自的圖，補 `public/exercises-q/<新 slug>.png` 再改對應即可，不影響資料。

### 3.4 新檔 `src/lib/exerciseOrder.ts`

**現在動作庫的排序是壞的**：`listExercises()` 走 `db.exercises.toArray()`，Dexie 依主鍵字串排序，也就是照 `seed:名稱` 的 Unicode 碼位排 —— 所以手臂頁會出現「雙槓撐體→槓鈴彎舉→錘式彎舉→窄握臥推→牧師彎舉」這種順序。需求 #6 要能生效，得先有明確的顯示排序。

```ts
import { SEED_EXERCISES } from '../data/seed-exercises';
import type { Exercise, MuscleGroup } from '../db/schema';

const MUSCLE_ORDER: MuscleGroup[] = ['胸', '背', '腿臀', '肩', '手臂', '核心', '有氧'];
const SEED_ORDER = new Map(SEED_EXERCISES.map((s, i) => [s.name, i]));

/**
 * 動作庫顯示排序：先肌群、再 seed 定義順序；自訂動作排在同肌群的內建動作之後（依建立時間）。
 * 純函式，不碰 Dexie。
 */
export function sortExercisesForDisplay(list: Exercise[]): Exercise[] { ... }
```

排序規則（依序比較）：
1. `MUSCLE_ORDER` 的索引
2. 兩者都是內建 → `SEED_ORDER` 索引
3. 一內建一自訂 → 內建在前
4. 都是自訂 → `createdAt` 小的在前

套用點：`ExerciseList.tsx` 的 `filteredExercises` useMemo（**不要**塞進 `src/db/exercises.ts`，資料層維持不做展示邏輯）。

### 3.5 Dexie `version(10)` 遷移

寫在 `src/db/schema.ts`，`version(9)` 後面。四件事一次做完：

```ts
// version(10): 內建動作拆分/改名/重分類；移除宗諺課表的「斜板推」
this.version(10).stores({}).upgrade(async (tx) => {
  const now = Date.now();

  // ── (1) 內建動作改名 → 換 id，沿用 idAliases ──
  const RENAMES: [string, string][] = [
    ['滑輪下拉', '滑輪下拉（寬握）'],
    ['坐姿划船', '坐姿划船（寬握）'],
    ['纜繩下壓', '纜繩下壓（平把）'],
  ];
  const idMap = new Map<string, string>();
  for (const [oldName, newName] of RENAMES) {
    const oldId = seedExerciseId(oldName);
    const row: Exercise | undefined = await tx.table('exercises').get(oldId);
    if (!row) continue;                       // 新裝置沒有舊資料，正常
    const newId = seedExerciseId(newName);
    await tx.table('exercises').delete(oldId);
    await tx.table('exercises').put({ ...row, id: newId, name: newName, updatedAt: now });
    idMap.set(oldId, newId);
  }
  if (idMap.size > 0) {
    await tx.table('idAliases').bulkPut(
      [...idMap].map(([id, newId]) => ({ id, newId, updatedAt: now })),
    );
    await tx.table('workouts').toCollection().modify((w: Workout) => {
      if (remapEntryExerciseIds(w.entries, idMap)) w.updatedAt = now;
    });
    await tx.table('templates').toCollection().modify((t: WorkoutTemplate) => {
      if (remapEntryExerciseIds(t.entries, idMap)) t.updatedAt = now;
    });
  }

  // ── (2) 啞鈴飛鳥 胸 → 肩（id 不變，不需要 alias）──
  // ── (3) 回填手臂動作的 subGroup（依 SEED_EXERCISES 對照）──
  // ── (4) 移除「斜板推」──
});
```

**(2) 與 (3) 的寫法**：不要逐筆硬編。走一次 `SEED_EXERCISES`，對每個有定義的 seed，把 DB 中同 id 的列的 `muscleGroup` / `subGroup` 對齊 seed 定義；有變才 `put` 並更新 `updatedAt`。這樣以後再調分類就只要改 seed 陣列 + bump version。

**(4) 移除斜板推**（自訂動作，來自宗諺課表匯入）：
- `exercises`：找 `name === '斜板推' && isCustom` → 軟刪除（`deletedAt = updatedAt = now`）。**不要 hard delete**，否則同步會把別台的那筆再拉回來。
- `templates`：從所有範本的 `entries` 移除指向該 id 的項目，並重排 `order`；有動到才 bump `updatedAt`。
- `workouts`：**只清 `status === 'active'` 的**。已完成的訓練歷史一律不動 —— 那是使用者真的做過的紀錄，動了就是竄改歷史。歷史頁看到「斜板推」屬正常。

> 已完成訓練仍指向軟刪除的動作時，`listExercises()` 會過濾掉它 → 名稱查不到。請確認 History 頁對查不到的 exerciseId 有 fallback（顯示 `未知動作` 之類），沒有的話這階段一起補上，別再出現「讀取中...」。

---

## 4. UI 變更

### 4.1 修「新增自訂動作沒有送出按鈕」（需求 #9）

送出鈕**存在**（`ExerciseList.tsx:551`），是被底部導覽列蓋住了：

- `BottomNav` 是 `fixed bottom-0 ... z-50`，在 `Layout.tsx` 中渲染於 `<main>` **之後**。
- 新增/編輯 modal 外層也是 `z-50`，但在 `<main>` 內部，DOM 在前。
- 同層級 z-index 比 DOM 順序 → BottomNav 贏，正好蓋掉貼底 bottom-sheet 的最後一塊（＝送出鈕）。

改法（三處一起）：
1. modal 最外層 `z-50` → `z-[60]`（詳情 modal `ExerciseList.tsx:417` 有同樣問題，一併改）。
2. 內容容器加 `max-h-[85vh] overflow-y-auto`，比照詳情 modal，避免小螢幕溢出。
3. 內容容器底部留白 `pb-[calc(1.25rem+env(safe-area-inset-bottom))]`，iOS 手勢條不要壓到按鈕。

> Tailwind v4 注意：`z-[60]` 是 arbitrary value，合法；但**不要**寫 `z-60`（非標準階，會被靜默吞掉、build 照過、樣式失效 —— ROADMAP §6 那個坑）。

### 4.2 手臂細分二頭／三頭（需求 #10）

`ExerciseList.tsx`：
- 新 state `const [selectedSub, setSelectedSub] = useState<ArmSubGroup | '全部'>('全部')`。
- 只有 `selectedMuscle === '手臂'` 時，在肌群 chips 下方多一排（樣式比照肌群 chips，但小一號、用 slate 而非肌群色，視覺上要看得出是次級篩選）：`全部 / 二頭 / 三頭`。
- 篩選：`selectedSub === '全部' || ex.subGroup === selectedSub`。
- **切換肌群時要 reset `selectedSub` 回「全部」**，否則從手臂切到胸再切回來會殘留。
- 自訂的手臂動作沒設 subGroup 時，只有「全部」看得到 —— 所以新增/編輯表單要能設定（下一項）。

`新增/編輯自訂動作` 表單：
- 當 `formMuscle === '手臂'` 時，在「主要訓練肌群 / 所需訓練器材」那個 `grid-cols-2` 下面多一列「細分部位」下拉：`不分 / 二頭 / 三頭`。
- 送出時 `subGroup: formMuscle === '手臂' ? (formSub || undefined) : undefined`。
- **`updateExercise` 走 Dexie `update()`，傳 `undefined` 是「不改這個欄位」而不是「清空」。** 若使用者把手臂動作改成胸、或把細分改回「不分」，得明確清掉舊值（`db.exercises.put()` 整筆覆寫，或用 Dexie 的 `delete` 語法）。這是這一項最容易漏的地方。

### 4.3 輔助重量（需求 #7、#8）

**判定**：`ASSISTED_EXERCISE_NAMES.has(exercise.name)`（非有氧分支才判斷）。

**WorkoutLogger.tsx**（重訓卡片，`:895` 那列）：目前第二列只有「暖身組/正式組」按鈕，右邊是空的。把輔助重量放這一列右側：

```
[ 暖身組 ]              輔助 (kg) [ − 20.0 + ]
```

- `NumberStepper`：`value={setLog.assistWeight ?? 0}`、`step={2.5}`、`min={0}`、`decimals={1}`
- `onChange={(val) => updateSet(entry.id, setLog.id, { assistWeight: val > 0 ? val : undefined })}`
  （與 rpe 的 `|| undefined` 同慣例；`undefined` 進 Dexie 沒問題，`pushDoc` 的 `stripUndefined()` 會處理 Firestore）
- 寬度別讓第二列被擠爆：按鈕 `shrink-0`，stepper 包一層 `max-w-[9rem] ml-auto`。
- 顯示單位跟著 `currentUnit` 走（與「重量 (kg)」同一個變數），存進去一律 kg。

**`activeWorkout.ts` 的 `addSetToEntry`**（`:255` 附近）：「增加一組（自動複製）」要一併複製輔助重量，照既有有氧欄位的寫法加一行：

```ts
...(lastSet?.assistWeight !== undefined && { assistWeight: lastSet.assistWeight }),
```

**唯讀顯示**（三處，格式統一成 `輔助 -20kg`，用 slate 小字，別搶重量的視覺）：
- `History.tsx:699` 附近的組明細
- `ExerciseTracker.tsx:119` 附近的組明細
- 範本套用時 `assistWeight` 要跟著帶（`templates.ts` 是整包 entries 複製，理論上自動生效，實作時確認一次）

**明確不做**：`volume.ts`、`e1rm.ts`、`Progress.tsx` 的 PR 判定全部不動。輔助重量是純紀錄欄位。
> 代價：引體向上做 3 組 × 8 下、輔助 20kg，容量仍算 0，進度圖仍是平的。這是這次刻意的取捨（改計算要先在設定裡有體重，牽動 PR/歷史換算）。日後想做「實際負重＝體重−輔助＋外加」再開一階。

### 4.4 排序（需求 #6、#11）

`ExerciseList.tsx` 的 `filteredExercises` 最後套 `sortExercisesForDisplay()`。manage / select 兩種模式共用同一份，不必分開處理。

---

## 5. 宗諺課表資料（`src/data/zongyuan-8week-program.ts`）

- 移除 `:70` 的「斜板推」整個 exercise 物件。
- `:62` 推日的 `weeklyTotalSets`（`['15組', ...]`）拿掉 3 組後會對不上 —— 這是**純顯示文字**，請自行決定改數字或維持原樣；若維持，在該行加註解說明它是「原始課表數字」。
- `:148` 的 `{ part: '胸大肌 (槓鈴臥推 + 斜板推)', ... }` 標籤要改（例如改成 `胸大肌 (槓鈴臥推 + 水平夾胸)`），`values` 是原始課表的週容量數字，不要重算。
- `:39`、`:49` 的 `exerciseName: '滑輪下拉'`、`:117` 的 `exerciseName: '纜繩下壓'` 要跟著改成新名稱，否則重新匯入課表時 `importZongYuanProgram()` 的 `nameToId` 查不到，會把它們當成新的**自訂**動作建起來（`importZongYuanProgram.ts:22-31`）—— 動作庫會多出重複的鬼影動作。

---

## 6. 雲端同步影響

| 變更 | 會不會上雲 | 說明 |
|---|---|---|
| 內建動作改名／改分類／subGroup | ❌ | `sync.ts` 只推 `isCustom === true` 的動作；每台裝置各自靠 version(10) 遷移改，天然一致 |
| `idAliases` 三筆新對照 | ✅ | 已在同步表內；讓另一台能修好本機的舊參照 |
| 被改寫的 workouts / templates | ✅ | 遷移有 bump `updatedAt`，下次同步會推上去 |
| 斜板推軟刪除 | ✅ | 自訂動作，`deletedAt` 墓碑會同步 |
| `SetLog.assistWeight` | ✅ | 包在 workout 內一起走 |

**部署後一樣需要兩台裝置各開一次 App**（原因同上次：一台只能修自己產生的舊 id）。這次影響較小 —— 只有三個動作，且新裝置永遠正確。

`firestore.rules` 不需要改（規則是 `match /users/{uid}/{document=**}`）。

---

## 7. 測試

新增 `src/db/__tests__/migration-v10.test.ts`，比照 `migration.test.ts` 的做法（`import 'fake-indexeddb/auto'` → 先用舊 schema 建庫塞資料 → 再動態 import App 的 `db` 觸發升級）。必須涵蓋：

1. `seed:滑輪下拉` 不存在了，`seed:滑輪下拉（寬握）` 存在且 `name` 已更新
2. 舊 workout / template 的 `exerciseId` 被改寫，且 `updatedAt` 有 bump
3. `idAliases` 多了三筆（且 v9 的兩筆還在，沒被蓋掉）
4. 啞鈴飛鳥的 `muscleGroup === '肩'`
5. 手臂動作的 `subGroup` 有回填（二頭一筆、三頭一筆）
6. 斜板推：exercises 軟刪除、template entries 已移除、**已完成的 workout 沒被動到**（這條最重要，是防竄改歷史的護欄）
7. 沒有舊資料的全新 DB 跑遷移不會爆（`RENAMES` 全部 miss 的路徑）

新增 `src/lib/__tests__/exerciseOrder.test.ts`：肌群優先、seed 順序、自訂排最後、胸部順序符合需求 #6。

`volume.test.ts` / `e1rm.test.ts` **不應該有任何改動** —— 若你發現需要改，代表 `assistWeight` 不小心滲進計算了。

---

## 8. 驗收清單

跑滿三項，全綠才算完成（Claude review 時會獨立重跑）：

```
npx eslint .
npm run build          # ＝ tsc -b && vite build，比 tsc --noEmit 嚴格
npx vitest run
```

實機（或 `npm run dev`）確認：

- [ ] 動作庫「胸」：槓鈴臥推 → 啞鈴臥推 → 上斜槓鈴臥推 → 上斜啞鈴臥推
- [ ] 動作庫「背」：滑輪下拉（寬握）／（窄握）、坐姿划船（寬握）／（窄握）都在，且有圖
- [ ] 動作庫「肩」：啞鈴飛鳥在這裡；「胸」裡沒有了
- [ ] 動作庫「手臂」：出現二頭／三頭第二排 chips，各自篩選正確；切到別的肌群再切回來會 reset
- [ ] 「斜板推」在動作庫與推日範本中都消失，但**歷史頁的舊紀錄還在**
- [ ] 點「新增自訂動作」→ 送出鈕看得到、按得到；肌群選手臂時出現細分下拉
- [ ] 訓練頁選「引體向上」→ 有輔助重量欄位；「槓鈴臥推」→ 沒有
- [ ] 輸入輔助 20kg → 按「增加一組」會複製過去 → 關 App 重開還在 → 歷史頁看得到
- [ ] 訓練總容量沒有因為輔助重量改變

## 9. 收尾

- `docs/ROADMAP.md`
  - §2 資料模型：`Exercise.subGroup`、`SetLog.assistWeight`
  - §4 階段索引：補 Phase 17（v1.11）一列 + 更新進度句
  - §6 踩雷預告：新增一條「**改內建動作的名稱＝改它的 id**，一定要配 version bump + idAliases 遷移」（就是本檔 §2）
- Obsidian `C:\obsidian\儲存庫\健身APP開發\` 補一份完成紀錄
- commit 訊息用 `feat(exercises): ...`，並在 body 說明需要兩台裝置各開一次 App
