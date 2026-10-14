import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import '@fontsource-variable/heebo'
import './style.css'

const app = createApp(App)
if (import.meta.env.VITE_SENTRY_DSN) {
  // Lazy: keeps the Sentry SDK out of the main chunk. No tracing/replay. Props can hold emails
  // (admin member lists), so they are not attached.
  Promise.all([import('@sentry/vue'), import('./lib/sentry')]).then(([Sentry, { stripQueryStrings }]) =>
    Sentry.init({
      app,
      dsn: import.meta.env.VITE_SENTRY_DSN,
      release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
      sendDefaultPii: false,
      attachProps: false,
      beforeSend: stripQueryStrings,
    }),
  )
}
app.use(router).mount('#app')
