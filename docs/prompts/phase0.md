# Phase 0 — 專案骨架

> 前置：先讀 `docs/ROADMAP.md`（尤其 §1 技術棧、§3 資料夾結構）。

## 目標
建立可運行的 Vite + React + TS + Tailwind 專案，含 5 頁底部導覽空殼與 PWA 套件，`build` 與 `dev` 都能過。

## 規格
1. 用 Vite 建立 React + TypeScript 專案，開啟 **TS strict**。
2. 安裝並設定：
   - `tailwindcss`（手機優先，base 寬度以 375px 設計）
   - `react-router-dom`
   - `zustand`
   - `dexie`
   - `recharts`
   - `vite-plugin-pwa`
3. 建立底部固定導覽列（BottomNav），5 個分頁與路由：
   - **訓練**（`/`，WorkoutLogger）
   - **歷史**（`/history`，History）
   - **動作庫**（`/exercises`，ExerciseLibrary）
   - **進度**（`/progress`，Progress）
   - **設定**（`/settings`，SettingsPage）
4. 每頁先放標題與「施工中」佔位，能正常切換、目前分頁高亮。
5. 版面：單欄、內容區可捲動、BottomNav 固定底部、`max-w` 限制讓桌面也不過寬（手機優先但桌面不破版）。
6. 依 §3 建好資料夾骨架（`db/ lib/ store/ components/ pages/ data/`），可先放空檔。
7. ESLint 設定好。

## 驗收標準
- `npm run dev`：5 頁可切換、導覽列高亮正確、手機寬度（375px）不水平溢出。
- `npm run build`：零 TS 錯誤、build 成功。
- PWA 套件已掛上（先能 build，正式可安裝/離線留到 Phase 6 收尾）。

## 注意
- 暫不接資料，純畫面與路由。
- 顏色/主題先用簡單預設，深淺色主題留 Phase 6。
