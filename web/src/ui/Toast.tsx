import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type Toast = { id: number; text: string; kind: 'ok' | 'bad'; out?: boolean }
const Ctx = createContext<(text: string, kind?: 'ok' | 'bad') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems(xs => [...xs, { id, text, kind }])
    setTimeout(() => setItems(xs => xs.map(x => (x.id === id ? { ...x, out: true } : x))), kind === 'bad' ? 5600 : 3600)
    setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), kind === 'bad' ? 6000 : 4000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`toast ${t.kind} ${t.out ? 'out' : ''}`}>
            <Icon name={t.kind === 'ok' ? 'check' : 'alert'} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
