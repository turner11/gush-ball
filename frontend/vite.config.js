import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// tests run in the club's zone (CI runners are UTC), so date-window specs can catch DST bugs
process.env.TZ = 'Asia/Jerusalem'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // index.html carries Caddy template actions; dev has no Caddy, so show the defaults without the raw {{ }} text
    { name: 'strip-caddy-templates', apply: 'serve', transformIndexHtml: (html) => html.replace(/\{\{.*?\}\}/g, '') },
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    // cold reka-ui import under parallel jsdom load exceeds the 5s default
    testTimeout: 20000,
  },
})
