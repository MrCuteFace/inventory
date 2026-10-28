import type { Status } from './types'

export const STATUS_LABEL: Record<Status, string> = {
  available: 'במלאי',
  in_use: 'בשימוש',
  pending: 'ממתין לחתימה',
  repair: 'בתיקון',
  scrapped: 'נגרע',
}
export const STATUS_ORDER: Status[] = ['available', 'in_use', 'pending', 'repair', 'scrapped']

/** "yyyy-MM-dd" (או ISO מלא) → dd/MM/yyyy, בלי הזזת אזור זמן. */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return '₪' + Math.round(n).toLocaleString('he-IL')
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1 + months, d)
  // 31 בינואר + חודש = סוף פברואר, לא 3 במרץ
  if (dt.getDate() !== d) dt.setDate(0)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(...(fromIso.slice(0, 10).split('-').map(Number) as [number, number, number]))
  const b = Date.UTC(...(toIso.slice(0, 10).split('-').map(Number) as [number, number, number]))
  return Math.round((b - a) / 864e5)
}

export function relTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4)
  if (m < 1) return 'עכשיו'
  if (m < 60) return `לפני ${m} דק׳`
  const h = Math.round(m / 60)
  if (h < 24) return `לפני ${h} שע׳`
  const d = Math.round(h / 24)
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`
}

export const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' })
