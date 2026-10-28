import type { Counts, Status } from '../types'
import { STATUS_LABEL } from '../format'
import { LoadingSphere } from './brand/Brand'

/** מדבקת הנכס: החלק הצהוב והמספר הפנימי. */
export function Tag({ tag }: { tag: string }) {
  return (
    <span className="tag" title="מספר נכס">
      <b>נכס</b>
      <span>{tag}</span>
    </span>
  )
}

export function Pill({ status }: { status: Status }) {
  return <span className={`pill st-${status === 'in_use' ? 'use' : status === 'available' ? 'avail' : status}`}>{STATUS_LABEL[status]}</span>
}

export const statusClass = (s: Status) => (s === 'in_use' ? 'use' : s === 'available' ? 'avail' : s)

export function StatusBar({ c, thin }: { c: Counts; thin?: boolean }) {
  const parts: [Status, number][] = [['available', c.available], ['in_use', c.inUse], ['pending', c.pending], ['repair', c.repair]]
  return (
    <div className={`bar ${thin ? 'thin' : ''}`} role="img" aria-label={parts.map(([s, n]) => `${STATUS_LABEL[s]} ${n}`).join(', ')}>
      {parts.filter(([, n]) => n > 0).map(([s, n]) => <i key={s} className={`bg-${statusClass(s)}`} style={{ flex: n }} />)}
    </div>
  )
}

export function Sn({ children }: { children: string }) {
  return <span className="sn">{children}</span>
}

export function Loading() {
  return <div className="loading"><LoadingSphere /></div>
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      {error} {onRetry && <button className="btn btn-sm" style={{ marginInlineStart: 12 }} onClick={onRetry}>נסו שוב</button>}
    </div>
  )
}

export const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }
