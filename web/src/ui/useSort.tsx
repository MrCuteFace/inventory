import { useMemo, useState } from 'react'
import { collator } from '../format'
import { Icon } from './Icon'

type Getter<T> = (row: T) => string | number | null | undefined

/**
 * מיון לפי עמודה: לחיצה ממיינת, לחיצה שנייה הופכת כיוון. ערכים ריקים תמיד בסוף.
 * cycle=true מוסיף לחיצה שלישית שמחזירה לסדר המקורי (לטבלה המקובצת בדף הבית).
 */
export function useSort<T>(rows: T[], getters: Record<string, Getter<T>>, opts: { initial?: { key: string; dir: 1 | -1 }; cycle?: boolean } = {}) {
  const [sort, setSort] = useState<{ key: string | null; dir: 1 | -1 }>(opts.initial ?? { key: null, dir: 1 })

  const sorted = useMemo(() => {
    const g = sort.key ? getters[sort.key] : null
    if (!g) return rows
    return [...rows].sort((a, b) => {
      const x = g(a), y = g(b)
      const ex = x === '' || x == null, ey = y === '' || y == null
      if (ex || ey) return Number(ex) - Number(ey)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))
      return c * sort.dir
    })
    // getters נבנים מחדש בכל רינדור; המפתח והכיוון הם מה שקובע
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])

  const toggle = (key: string) =>
    setSort(s => {
      if (s.key !== key) return { key, dir: 1 }
      if (opts.cycle && s.dir === -1) return { key: null, dir: 1 }
      return { key, dir: s.dir === 1 ? -1 : 1 }
    })

  // פונקציה ולא קומפוננטה: קומפוננטה שנוצרת בכל רינדור הייתה נטענת מחדש ומאבדת פוקוס
  const th = (k: string, label: string, className?: string) => {
    const on = sort.key === k
    return (
      <th key={k} className={className} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
        <button className="th-sort" onClick={() => toggle(k)}>
          {label}
          <Icon name={on ? (sort.dir > 0 ? 'up' : 'down') : 'sort'} />
        </button>
      </th>
    )
  }

  return { sorted, th, active: sort.key !== null }
}
