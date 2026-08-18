import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useSyncStore } from './store/sync.ts'

// 初始化 Firebase Auth 監聽（有設定才啟動）
useSyncStore.getState().initAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Manual PWA Service Worker registration (per ROADMAP.md §6)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .then(registration => {
        console.log('SW registered: ', registration);

        // 新版本裝好後會卡在 waiting 不會自己接管，手動推它上位，
        // 否則常駐背景的 PWA（很少被完全關閉）會一直被舊 SW 服務到天荒地老。
        const promoteWaiting = (worker: ServiceWorker | null) => {
          worker?.postMessage({ type: 'SKIP_WAITING' });
        };
        if (registration.waiting) promoteWaiting(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              promoteWaiting(newWorker);
            }
          });
        });

        // 瀏覽器只在 navigate 時自動檢查新版，PWA 常駐分頁不會觸發 → 回到前景時主動戳一次
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update();
          }
        });
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });

  // 新 SW 接管後畫面還是舊的 bundle，要整頁重新整理一次才會真的換版本
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
