import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import type { CatalogCategory, Me } from './types'

/* ---------- התחברות ---------- */
type AuthState = { me: Me | null; loading: boolean; setMe: (m: Me | null) => void; logout: () => Promise<void> }
const AuthCtx = createContext<AuthState>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<Me>('/api/auth/me').then(setMe).catch(() => setMe(null)).finally(() => setLoading(false))
    const onUnauth = () => setMe(null)
    window.addEventListener('inv:unauthorized', onUnauth)
    return () => window.removeEventListener('inv:unauthorized', onUnauth)
  }, [])
  const logout = async () => { await api.post('/api/auth/logout').catch(() => {}); setMe(null) }
  return <AuthCtx.Provider value={{ me, loading, setMe, logout }}>{children}</AuthCtx.Provider>
}
export const useAuth = () => useContext(AuthCtx)

/* ---------- עץ קטגוריות + "גרסת נתונים" ---------- */
// כל פעולה שמשנה נתונים קוראת ל-changed(); דפים שתלויים ב-version טוענים את עצמם מחדש,
// כך שמדדים וטבלאות מתעדכנים בלי רענון דף (דרישת האפיון).
type ModalSpec =
  | { kind: 'intake'; subId?: number }
  | { kind: 'scrap'; assetId?: number; subId?: number }
  | { kind: 'edit'; assetId: number }
  | { kind: 'addsig'; assetId: number }
  | { kind: 'form'; assetId: number }
  | { kind: 'addcat' }
  | { kind: 'addsub'; categoryId?: number }

type DataState = {
  catalog: CatalogCategory[]
  version: number
  changed: (opts?: { fresh?: number[] }) => void
  fresh: Set<number>
  modal: ModalSpec | null
  open: (m: ModalSpec) => void
  close: () => void
  reloadCatalog: () => Promise<void>
}
const DataCtx = createContext<DataState>(null!)

export function DataProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [version, setVersion] = useState(0)
  const [fresh, setFresh] = useState<Set<number>>(new Set())
  const [modal, setModal] = useState<ModalSpec | null>(null)

  const reloadCatalog = useCallback(async () => {
    try { setCatalog(await api.get<CatalogCategory[]>('/api/catalog')) } catch { /* התפריט יישאר כמו שהוא */ }
  }, [])
  useEffect(() => { reloadCatalog() }, [reloadCatalog])

  const changed = useCallback((opts?: { fresh?: number[] }) => {
    setFresh(new Set(opts?.fresh ?? []))
    setVersion(v => v + 1)
    reloadCatalog()
  }, [reloadCatalog])

  return (
    <DataCtx.Provider value={{ catalog, version, changed, fresh, modal, open: setModal, close: () => setModal(null), reloadCatalog }}>
      {children}
    </DataCtx.Provider>
  )
}
export const useData = () => useContext(DataCtx)

/** טעינת נתונים לדף שמתרעננת כשהגרסה עולה. */
export function useLoad<T>(url: string | null) {
  const { version } = useData()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!url) return
    let alive = true
    setError(null)
    api.get<T>(url).then(d => { if (alive) setData(d) }).catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [url, version, tick])
  return { data, error, retry: () => setTick(t => t + 1), setData }
}
