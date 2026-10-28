import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * חלון צף: רקע מטושטש, ESC וקליק על הרקע סוגרים, הפוקוס עובר לשדה הראשון ונכלא בחלון.
 * הסגירה מונפשת (200ms) ורק אז onClose נקרא.
 */
export function Modal({ title, context, narrow, onClose, children, footer }: {
  title: string
  context?: ReactNode
  narrow?: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const [closing, setClosing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const prevFocus = useRef<Element | null>(null)
  const close = () => {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 200)
  }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    prevFocus.current = document.activeElement
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('.modal-body input:not([readonly]):not([type=file]):not([type=radio]), .modal-body select, .modal-body textarea')
      ?? el?.querySelector<HTMLElement>('button')
    setTimeout(() => first?.focus(), 30)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current() }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), label[for]')]
          .filter(x => x.offsetParent !== null)
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      ;(prevFocus.current as HTMLElement | null)?.focus?.()
    }
  }, [])

  return (
    <div className="overlay" data-state={closing ? 'closed' : 'open'} onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className={`modal ${narrow ? 'narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {context && <div className="context">{context}</div>}
          </div>
          <button className="icon-btn" onClick={close} aria-label="סגירה"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
