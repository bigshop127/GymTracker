import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // GitHub Pages 部署在 /GymTracker/ 子路徑；本機開發維持根路徑
  const base = command === 'build' ? '/GymTracker/' : '/'

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        injectRegister: false, // Per ROADMAP.md §6
        registerType: 'autoUpdate',
        workbox: {
          // 只 precache app shell；動作示意圖（6.7MB）排除在外，改 runtime 快取
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          globIgnores: ['**/exercises/**'],
          runtimeCaching: [
            {
              // 示意圖：看過才存，離線可重看，安裝包維持精簡
              urlPattern: ({ url }) => url.pathname.includes('/exercises/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'exercise-images',
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        manifest: {
          name: 'GymTracker',
          short_name: 'GymTracker',
          description: '健身動作紀錄器 (Gymie-style)',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          scope: base,
          start_url: base,
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
  }
})
