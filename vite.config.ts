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
