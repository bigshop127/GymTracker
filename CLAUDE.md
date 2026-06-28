# CLAUDE.md — GymTracker

> 這是 Claude Code 開啟本專案時自動載入的簡介。任何新對話只要在 `C:\GymTracker` 開、或使用者提到「GymTracker / 健身 App 優化」，先讀本檔再行動。

## 這是什麼
**GymTracker**：類 [Gymie](https://apps.apple.com/us/app/gymie-fitness-tracker/id6758956867) 的健身訓練紀錄器，手機優先、可安裝、離線可用的 **Web PWA**。
核心＝動作庫 + 逐組紀錄 + 組間休息計時 + 訓練歷史 + 進度圖；v1.1 已加：訓練地點 / 訓練範本(保留重量) / 日曆 / 動作示意圖。

- **線上**：https://bigshop127.github.io/GymTracker/ （GitHub Pages，push to `master` 自動部署）
- **GitHub**：https://github.com/bigshop127/GymTracker （Public）
- **進度**：MVP v1.0（Phase 0–6）+ Phase 7 v1.1 四項擴充，**皆完成並上線**（2026-06-28）。

## ⚠️ 工作協議（最重要，務必遵守）
**規格（Claude 擬）→ 使用者自己寫 code → Claude review → 過了 Claude 才 commit/push。**
- Claude **不主動寫功能碼**。唯二可直接動手：(a) 使用者明說「**幫我改好**」；(b) 使用者明確委派的基建/部署/素材任務。
- Review 一定**獨立重跑**：`eslint .`、`tsc -b && vite build`、`vitest`，並讀所有變更檔對照驗收。使用者偶爾誤報「lint 通過」，不可只信自報。

## 技術棧
Vite + React 19 + TS(strict) + **Tailwind v4** + React Router 7 + Zustand 5 + **Dexie 4(IndexedDB)** + Recharts + Vitest + vite-plugin-pwa。

## 文件位置（三邊同步）
- **SSOT 藍圖**：`docs/ROADMAP.md`（資料模型、階段索引、踩雷預告 §6）。階段提示詞在 `docs/prompts/phaseN.md`。
- **Obsidian 人類可讀開發紀錄**：`C:\obsidian\儲存庫\健身APP開發\`
  - `GymTracker 開發進度.md`、`Phase 7 完成紀錄 v1.1.md`、`GymTracker 部署與維運.md`
- **Claude 跨對話記憶**：`gymtracker-project`、`gymtracker-working-agreement`（從 `C:\CC AI Agent` 開對話時自動載入）。

## 最常見的坑
- **Tailwind v4 靜默吞非標準色階**：`slate-850`、`indigo-650`、`duration-250` 等**不報錯、不產 CSS、build 照過**，樣式默默失效。合法色階只有 `50/100/200…900/950`。改完搜 `-\d{2,3}` 自查。
- **休息計時器**用結束目標時間戳算剩餘，不可 `setInterval` 累加（手機鎖屏跳秒）。
- **weight 一律存 kg**，顯示層才換算。
- **Dexie 改 schema** 要 `version(n).stores({...})` 只宣告新/改的表，舊 version 不動（防掉資料）。
