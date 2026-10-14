import * as Sentry from '@sentry/vue'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import '@fontsource-variable/heebo'
import './style.css'

const app = createApp(App)
if (import.meta.env.VITE_SENTRY_DSN) {
  // No tracing/replay. Props can hold emails (admin member lists), so they are not attached.
  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    attachProps: false,
  })
}
app.use(router).mount('#app')
