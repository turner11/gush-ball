import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import '@fontsource-variable/heebo'
import './style.css'

const app = createApp(App)
// Lazy: keeps the Sentry SDK out of the main chunk. ErrorBoundary chains on this same module promise,
// registered later, so init always runs before any capture.
if (import.meta.env.VITE_SENTRY_DSN) import('./lib/sentry').then(({ initSentry }) => initSentry(app))
app.use(router).mount('#app')
