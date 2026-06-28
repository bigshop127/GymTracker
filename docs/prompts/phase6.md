# Phase 6 — 設定 + PWA 收尾

> 前置：前 5 階段功能完成。本階段把設定串起來並讓 App 真正可安裝/離線。

## 目標
完成設定頁（即時生效）、深淺色主題，以及可安裝、離線可用的 PWA。

## 規格
### A. 設定頁（`/settings`）
- 編輯 `Settings`（§2），**即時存、即時生效**：
  - 單位 kg/lb（切換後全 app 顯示換算，底層仍存 kg）
  - 預設休息秒數
  - E1RM 公式（epley/brzycki）
  - 主題（light/dark/system）
  - 休息結束音效開關、震動開關
- 可選：匯出/匯入資料（JSON 備份），為未來雲端鋪路。

### B. 主題
- 實作深/淺/跟隨系統，用 Tailwind dark mode；切換即時套用、重開保留。

### C. PWA
- `manifest`：app 名稱、圖示（192/512）、`display: standalone`、主題色。
- Service Worker：precache app shell，離線可開、可瀏覽已存資料。
- 新版 SW 自動接管（避免使用者卡舊版）。
- ⚠️ 依 ROADMAP §6 避開 vite-plugin-pwa 兩坑：
  - 別讓手動 `public/manifest.webmanifest` 與 VitePWA 產出並存。
  - 若 `registerSW.js` 沒被 emit → `injectRegister:false` + `main.tsx` 手動 `navigator.serviceWorker.register(...)`。

## 驗收標準
- 改單位/休息秒數/主題 → 立即生效、重開保留。
- 手機 Chrome 能「加到主畫面」，以獨立視窗（無網址列）開啟。
- 飛航模式下仍能開 App、瀏覽歷史、開始並紀錄訓練。
- 主 bundle 不過大（必要時 code split 圖表頁）。

## 注意
- PWA 在手機上實機驗收（桌面 DevTools 只能驗一部分）。
- 完成後即為 MVP v1.0；社群/AI 分析/成就為後續 Phase，不在本版。
