import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/assistant/400.css'
import '@fontsource/assistant/600.css'
import '@fontsource/assistant/700.css'
import '@fontsource/secular-one/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './styles.css'
import App from './App'

// ערכת צבעים שנבחרה ידנית נשמרת בדפדפן; בלי בחירה - לפי הגדרת המערכת
try {
  const t = localStorage.getItem('inv-theme')
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
} catch { /* אין אחסון */ }

// The public demo has no back end: the API runs in the browser on invented data.
if (import.meta.env.VITE_DEMO) {
  const { installMockServer } = await import('./mock/server')
  installMockServer()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
