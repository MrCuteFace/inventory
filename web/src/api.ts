import { useEffect, useState, type MouseEvent } from 'react'

// לקוח API דק: עוגיית ההתחברות נשלחת אוטומטית (אותו מקור), וכל בקשה משנה נושאת את
// הכותרת שהשרת בודק נגד CSRF. שגיאות מהשרת מגיעות כ-{ error } בעברית ונזרקות כ-ApiError.

export class ApiError extends Error {
  status: number
  data: unknown
  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

const HEADER = { 'X-Requested-With': 'inventory' }

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { ...HEADER }, credentials: 'same-origin' }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'אין חיבור לשרת. בדקו את הרשת ונסו שוב.')
  }

  if (res.status === 401 && !url.endsWith('/auth/login')) {
    window.dispatchEvent(new Event('inv:unauthorized'))
  }
  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = undefined
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error
      ?? (res.status === 403 ? 'אין לך הרשאה לפעולה הזו.' : res.status === 404 ? 'לא נמצא.' : `שגיאת שרת (${res.status}). נסו שוב.`)
    throw new ApiError(res.status, msg, data)
  }
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
  form: <T>(url: string, form: FormData) => request<T>('POST', url, form),
}

/** הורדת קובץ (Excel) דרך fetch, כדי ששגיאה תוצג כהודעה ולא כדף שגיאה. */
export async function download(url: string, fallbackName: string) {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new ApiError(res.status, res.status === 401 ? 'פג תוקף ההתחברות.' : 'הייצוא נכשל. נסו שוב.')
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd)
  const name = m ? decodeURIComponent(m[1] ?? m[2]) : fallbackName
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/*
  Files the browser is pointed at directly (a signature image, an invoice, a damage photo). In the
  static demo no server stands behind /api, so the file comes from the demo's in-browser store.
*/
const DEMO = Boolean(import.meta.env.VITE_DEMO)

/** The address to show an API file from: the path itself, or a blob URL in the demo. */
export function useFileUrl(path: string) {
  const [url, setUrl] = useState(DEMO ? '' : path)
  useEffect(() => {
    if (!DEMO) return
    let alive = true
    let made: string | null = null
    import('./mock/server').then(m => m.demoFileUrl(path)).then(u => { made = u; if (alive && u) setUrl(u) })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [path])
  return url
}

/** onClick for a link that opens an API file in a new tab; a no-op outside the demo. */
export function openFile(e: MouseEvent, path: string) {
  if (!DEMO) return
  e.preventDefault()
  const tab = window.open('', '_blank')
  import('./mock/server').then(m => m.demoFileUrl(path)).then(u => { if (u && tab) tab.location.href = u; else tab?.close() })
}
