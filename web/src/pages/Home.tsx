import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, download } from '../api'
import { daysBetween, fmtDate, fmtMoney, relTime, STATUS_LABEL } from '../format'
import { useAuth, useData, useLoad } from '../state'
import type { AssetRow, Counts, Dashboard, EmployeeLookup } from '../types'
import { ErrorBox, Loading, Pill, StatusBar, Tag, srOnly } from '../ui/Bits'
import { CameraScan } from '../ui/CameraScan'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { useSort } from '../ui/useSort'

const VIEWS = ['תמונת מצב', 'מדפים', 'תור עבודה'] as const

export function Home() {
  const { me } = useAuth()
  const { open } = useData()
  const { data, error, retry } = useLoad<Dashboard>('/api/dashboard')
  const [view, setView] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('inv-home')); return v >= 0 && v < 3 ? v : 0 } catch { return 0 }
  })
  const [empQ, setEmpQ] = useState('')
  const pick = (i: number) => { setView(i); try { localStorage.setItem('inv-home', String(i)) } catch { /* */ } }

  const h = new Date().getHours()
  const hello = h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : 'ערב טוב'
  const firstName = me?.fullName.split(' ')[0] ?? ''

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="greet">{hello}, {firstName}</h1>
          <div className="muted">{new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => open({ kind: 'scrap' })}><Icon name="out" />גריעת ציוד</button>
          <button className="btn btn-primary" onClick={() => open({ kind: 'intake' })}><Icon name="in" />קליטת ציוד חדש</button>
        </div>
      </div>
      <div className="view-tabs" role="tablist" aria-label="תצוגת דף הבית">
        {VIEWS.map((v, i) => <button key={v} role="tab" aria-selected={view === i} onClick={() => pick(i)}>{v}</button>)}
      </div>
      {error && <ErrorBox error={error} onRetry={retry} />}
      {!data && !error && <Loading />}
      {data && view === 0 && <Overview d={data} empQ={empQ} setEmpQ={setEmpQ} />}
      {data && view === 1 && <Shelves d={data} empQ={empQ} setEmpQ={setEmpQ} />}
      {data && view === 2 && <Queue d={data} empQ={empQ} setEmpQ={setEmpQ} />}
    </>
  )
}

type ViewProps = { d: Dashboard; empQ: string; setEmpQ: (s: string) => void }

/* ---------------- תמונת מצב ---------------- */
function Overview({ d, empQ, setEmpQ }: ViewProps) {
  const nav = useNavigate()
  const toast = useToast()
  const exportFile = async (url: string, name: string) => {
    try { await download(url, name) }
    catch (e) { toast((e as Error).message, 'bad') }
  }
  const c = d.totals
  const rows = useMemo(() => d.categories.flatMap(cat => cat.subCategories.map(s => ({ ...s, cat }))), [d])
  const { sorted, th, active } = useSort(rows, {
    name: r => r.name, active: r => r.counts.active, available: r => r.counts.available, inUse: r => r.counts.inUse,
    pending: r => r.counts.pending, repair: r => r.counts.repair, value: r => r.counts.value,
  }, { cycle: true })

  const row = (r: (typeof rows)[number], showCat: boolean) => {
    const k = r.counts
    const flag = k.active > 0 && k.available === 0 ? <span className="flag out">אזל מהמלאי</span> : k.available === 1 ? <span className="flag low">מלאי נמוך</span> : null
    const go = () => nav(`/c/${r.id}`)
    return (
      <tr key={r.id} className="go" tabIndex={0} onClick={go} onKeyDown={e => { if (e.key === 'Enter') go() }}>
        <td><span className="cell-main">{r.name}</span>{flag}{showCat && <div className="cell-sub">{r.cat.name}</div>}</td>
        <td className="n"><b>{k.active}</b></td>
        <td className={`n ${k.available ? '' : 'zero'}`}>{k.available}</td>
        <td className="n">{k.inUse}</td>
        <td className={`n ${k.pending ? '' : 'zero'}`}>{k.pending}</td>
        <td className={`n ${k.repair ? '' : 'zero'}`}>{k.repair}</td>
        <td className="n">{fmtMoney(k.value)}</td>
      </tr>
    )
  }

  return (
    <>
      <EmployeeSearch q={empQ} setQ={setEmpQ} />
      <section className="panel fleet" aria-label="סיכום כללי">
        <div className="fleet-top">
          <div className="fleet-total">{c.active}</div><div className="muted">פריטים פעילים בכל הקבוצה</div>
          <div style={{ marginInlineStart: 'auto', textAlign: 'end' }}>
            <div className="muted" style={{ fontSize: 13 }}>שווי מלאי כולל</div>
            <div style={{ fontSize: 22, fontWeight: 700 }} className="num">{fmtMoney(c.value)}</div>
          </div>
        </div>
        <StatusBar c={c} />
        <Legend c={c} />
      </section>
      <div className="home-grid">
        <section className="panel" aria-label="ציוד לפי קטגוריה">
          <div className="panel-head"><h2 className="section-title">ציוד לפי קטגוריה</h2>
            <div className="actions"><span className="hint">לחיצה על שורה פותחת את דף הקטגוריה</span>
              <button className="btn btn-sm" onClick={() => exportFile('/api/reports/by-category/export', 'inventory-by-category.xlsx')}><Icon name="download" />Excel</button>
              <button className="btn btn-sm" onClick={() => exportFile('/api/reports/by-category/pdf', 'inventory-by-category.pdf')}><Icon name="download" />PDF</button></div></div>
          <div className="table-wrap"><table className="matrix">
            <thead><tr>{th('name', 'תת קטגוריה')}{th('active', 'כמות', 'n')}{th('available', 'במלאי', 'n')}{th('inUse', 'בשימוש', 'n')}{th('pending', 'ממתין', 'n')}{th('repair', 'בתיקון', 'n')}{th('value', 'שווי', 'n')}</tr></thead>
            <tbody>
              {active
                ? sorted.map(r => row(r, true))
                : d.categories.map(cat => [
                    <tr key={`c${cat.id}`} className="cat-row"><td colSpan={7}>{cat.name}</td></tr>,
                    ...rows.filter(r => r.cat.id === cat.id).map(r => row(r, false)),
                  ])}
            </tbody>
          </table></div>
        </section>
        <section className="panel" aria-label="פעילות אחרונה">
          <div className="panel-head"><h2 className="section-title">פעילות אחרונה</h2></div>
          <ActivityLog items={d.recent} />
        </section>
      </div>
    </>
  )
}

function Legend({ c }: { c: Counts }) {
  return (
    <div className="legend">
      <span><i className="dot bg-avail" />{STATUS_LABEL.available} <b>{c.available}</b></span>
      <span><i className="dot bg-use" />{STATUS_LABEL.in_use} <b>{c.inUse}</b></span>
      <span><i className="dot bg-pending" />{STATUS_LABEL.pending} <b>{c.pending}</b></span>
      <span><i className="dot bg-repair" />{STATUS_LABEL.repair} <b>{c.repair}</b></span>
      <span className="muted"><i className="dot bg-scrapped" />נגרעו (סה״כ) <b>{c.scrapped}</b></span>
    </div>
  )
}

const LOG_ICON: Record<string, string> = { intake: 'in', dispose: 'out', sign: 'sign', edit: 'edit', repair: 'wrench', assign: 'user', return: 'box', category: 'plus', user: 'key', employee: 'users' }
export function ActivityLog({ items }: { items: Dashboard['recent'] }) {
  if (!items.length) return <div className="empty">עוד אין פעילות. קליטת הציוד הראשונה תופיע כאן.</div>
  return (
    <ul className="log">
      {items.map(l => (
        <li key={l.id}>
          <Icon name={LOG_ICON[l.action] ?? 'clock'} />
          <div><div className="log-text">{l.text}</div><div className="log-meta">{relTime(l.at)}{l.user ? ` · ${l.user}` : ''}</div></div>
        </li>
      ))}
    </ul>
  )
}

/* ---------------- מדפים ---------------- */
function Shelves({ d, empQ, setEmpQ }: ViewProps) {
  const nav = useNavigate()
  const { open } = useData()
  const [q, setQ] = useState(empQ)
  const [assets, setAssets] = useState<AssetRow[] | null>(null)
  const [people, setPeople] = useState<EmployeeLookup[] | null>(null)

  // חיפוש אחד: שם עובד מציג את הציוד שלו; מספר נכס או סנטרלי מציג פריטים
  useEffect(() => {
    const t = q.trim()
    setEmpQ(q)
    if (t.length < 2) { setAssets(null); setPeople(null); return }
    const h = setTimeout(async () => {
      const [p, a] = await Promise.all([
        api.get<EmployeeLookup[]>(`/api/employees/lookup?q=${encodeURIComponent(t)}`).catch(() => []),
        api.get<AssetRow[]>(`/api/assets/search?q=${encodeURIComponent(t)}`).catch(() => []),
      ])
      setPeople(p); setAssets(a)
    }, 220)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = q.trim().toLowerCase()
    const exact = assets?.find(a => a.assetTag.toLowerCase() === t || a.serialNumber.toLowerCase() === t)
    if (exact) nav(`/c/${exact.subCategoryId}?q=${encodeURIComponent(exact.assetTag)}`)
  }

  return (
    <>
      <form className="scan" role="search" onSubmit={submit}>
        <Icon name="scan" />
        <label htmlFor="scan-input" style={srOnly}>חיפוש פריט או עובד</label>
        <input id="scan-input" autoComplete="off" value={q} onChange={e => setQ(e.target.value)}
          placeholder="סרקו ברקוד או הקלידו מספר נכס, מספר סנטרלי או שם עובד" />
        <CameraScan what="מספר לחיפוש" onValue={setQ} />
        <button className="btn btn-primary" type="submit">חיפוש</button>
      </form>
      {(people || assets) && (
        <div className="panel scan-results" style={{ padding: '0 14px 14px' }}>
          {people && people.length > 0 && <EmployeeCards people={people} />}
          {assets && assets.length > 0 && (
            <div className="pick-list" style={{ marginTop: 14 }}>
              {assets.map(a => (
                <button key={a.id} onClick={() => nav(`/c/${a.subCategoryId}?q=${encodeURIComponent(a.assetTag)}`)}>
                  <Tag tag={a.assetTag} /><span className="cell-main">{a.model}</span>
                  <span className="muted">{a.employeeName ?? a.subCategoryName}</span>
                  <span style={{ marginInlineStart: 'auto' }}><Pill status={a.status} /></span>
                </button>
              ))}
            </div>
          )}
          {people?.length === 0 && assets?.length === 0 && <div className="empty">לא נמצא פריט או עובד. בדקו את המספר או נסו מספר סנטרלי.</div>}
        </div>
      )}
      <div className="shelves">
        {d.categories.map(cat => {
          const all = cat.subCategories.reduce((s, x) => s + x.counts.active, 0)
          return (
            <section key={cat.id} className="panel shelf">
              <div className="shelf-head"><Icon name={cat.icon} /><h2>{cat.name}</h2><span className="muted num">{all} פריטים</span></div>
              {cat.subCategories.map(s => (
                <button key={s.id} className="shelf-row" onClick={() => nav(`/c/${s.id}`)}>
                  <span className="name">{s.name}</span>
                  <span className={`stock ${s.counts.available ? '' : 'out'}`}><b>{s.counts.available}</b> זמינים מתוך {s.counts.active}</span>
                  <StatusBar c={s.counts} thin />
                </button>
              ))}
            </section>
          )
        })}
        <button className="shelf-add" onClick={() => open({ kind: 'addcat' })}><Icon name="plus" />הוספת קטגוריה</button>
      </div>
    </>
  )
}

/* ---------------- תור עבודה ---------------- */
function Queue({ d, empQ, setEmpQ }: ViewProps) {
  const { open } = useData()
  const nav = useNavigate()
  const today = d.today
  const q = (title: string, icon: string, list: AssetRow[], row: (a: AssetRow) => React.ReactNode, empty: string) => (
    <section className="panel queue">
      <div className="panel-head"><h2 className="section-title"><Icon name={icon} />{title}<span className="count-badge">{list.length}</span></h2></div>
      {list.length ? list.map(row) : <div className="empty">{empty}</div>}
    </section>
  )
  return (
    <div className="queue-grid">
      <div>
        {q('ממתינים לחתימת עובד', 'sign', d.pending, a => {
          const days = daysBetween(a.deliveredAt!, today)
          return (
            <div key={a.id} className="queue-row"><Tag tag={a.assetTag} />
              <div><div className="who">{a.employeeName}</div><div className="what">{a.subCategoryName} · נמסר {fmtDate(a.deliveredAt)} · <span className={`days ${days > 5 ? 'hot' : ''}`}>{days} ימים</span> ללא חתימה</div></div>
              <button className="btn btn-sm" onClick={() => open({ kind: 'form', assetId: a.id })}><Icon name="sign" />טופס חתימה</button></div>
          )
        }, 'כל העובדים חתמו.')}
        {q('בתיקון / מעבדה', 'wrench', d.repair, a => {
          const days = a.repairSince ? daysBetween(a.repairSince, today) : 0
          return (
            <div key={a.id} className="queue-row"><Tag tag={a.assetTag} />
              <div><div className="who">{a.model}</div><div className="what">{a.subCategoryName} · בתיקון מ־{fmtDate(a.repairSince)} · <span className={`days ${days > 21 ? 'hot' : ''}`}>{days} ימים</span></div></div>
              <button className="btn btn-sm" onClick={() => open({ kind: 'edit', assetId: a.id })}><Icon name="edit" />עדכון</button></div>
          )
        }, 'אין ציוד בתיקון.')}
        {q('אחריות מסתיימת ב־90 הימים הקרובים', 'shield', d.warrantySoon, a => {
          const days = daysBetween(today, a.warrantyEnd)
          return (
            <div key={a.id} className="queue-row"><Tag tag={a.assetTag} />
              <div><div className="who">{a.model}</div><div className="what">{a.supplierName} · מסתיימת {fmtDate(a.warrantyEnd)} · בעוד <span className={`days ${days < 30 ? 'hot' : ''}`}>{days} ימים</span></div></div>
              <button className="btn btn-sm btn-ghost" onClick={() => nav(`/c/${a.subCategoryId}?q=${encodeURIComponent(a.assetTag)}`)}>לפריט</button></div>
          )
        }, 'אין אחריות שמסתיימת בקרוב.')}
      </div>
      <aside>
        <EmployeeSearch q={empQ} setQ={setEmpQ} />
        <section className="panel queue">
          <div className="panel-head"><h2 className="section-title">פעולות מהירות</h2></div>
          <div className="side-actions">
            <button className="btn btn-primary" onClick={() => open({ kind: 'intake' })}><Icon name="in" />קליטת ציוד חדש למלאי</button>
            <button className="btn" onClick={() => open({ kind: 'scrap' })}><Icon name="out" />גריעת ציוד / השבתה</button>
            <button className="btn" onClick={() => nav('/disposals')}><Icon name="report" />דו״ח גריעות לחודש הנוכחי</button>
          </div>
        </section>
        <section className="panel queue">
          <div className="panel-head"><h2 className="section-title">גריעות החודש</h2><span className="count-badge">{d.monthDisposals.count}</span></div>
          <ul className="stat-list">
            {d.monthDisposals.byReason.map(r => <li key={r.reason}><span>{r.reason}</span><b>{r.count}</b></li>)}
            <li style={{ borderTop: '1px solid var(--line-2)', paddingTop: 8 }}><span>שווי לגריעה בספרים</span><b>{fmtMoney(d.monthDisposals.value)}</b></li>
          </ul>
        </section>
      </aside>
    </div>
  )
}

/* ---------------- חיפוש ציוד לפי עובד ---------------- */
function EmployeeSearch({ q, setQ }: { q: string; setQ: (s: string) => void }) {
  const [people, setPeople] = useState<EmployeeLookup[] | null>(null)
  const { version } = useData()
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setPeople(null); return }
    const h = setTimeout(() => {
      api.get<EmployeeLookup[]>(`/api/employees/lookup?q=${encodeURIComponent(t)}`).then(setPeople).catch(() => setPeople([]))
    }, 220)
    return () => clearTimeout(h)
  }, [q, version])

  return (
    <section className="panel emp-search" aria-label="חיפוש ציוד לפי עובד">
      <h2 className="section-title" style={{ marginBottom: 10 }}><Icon name="user" />ציוד חתום לפי עובד</h2>
      <div className="search"><Icon name="search" />
        <input className="input" id="emp-q" aria-label="שם עובד" placeholder="הקלידו שם עובד, למשל יוסי כהן" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} /></div>
      {people && (people.length ? <EmployeeCards people={people} /> : <div className="empty" style={{ padding: '18px 0 4px' }}>לא נמצא עובד או מחלקה בשם הזה.</div>)}
    </section>
  )
}

export function EmployeeCards({ people }: { people: EmployeeLookup[] }) {
  const { open } = useData()
  return (
    <>
      {people.map(p => (
        <div key={p.id} className="emp-card">
          <div className="emp-card-head"><Icon name="user" /><b>{p.fullName}</b>{p.department && <span className="muted">{p.department}</span>}
            {!p.isActive && <span className="badge-off">לא פעיל</span>}
            <span style={{ marginInlineStart: 'auto' }} className="num">{p.signed.length} פריטים חתומים · {fmtMoney(p.signedValue)}</span></div>
          {p.signed.map(a => (
            <div key={a.id} className="emp-item"><Tag tag={a.assetTag} />
              <div className="grow"><div className="cell-main">{a.model}</div><div className="cell-sub">{a.subCategoryName} · נמסר {fmtDate(a.deliveredAt)}</div></div>
              <button className="btn btn-sm btn-ghost" onClick={() => open({ kind: 'form', assetId: a.id })}><Icon name="sign" />טופס חתום</button></div>
          ))}
          {p.pending.map(a => (
            <div key={a.id} className="emp-item"><Tag tag={a.assetTag} />
              <div className="grow"><div className="cell-main">{a.model}</div><div className="cell-sub">{a.subCategoryName} · <Pill status="pending" /></div></div>
              <button className="btn btn-sm" onClick={() => open({ kind: 'addsig', assetId: a.id })}><Icon name="sign" />הוספת חתימה</button></div>
          ))}
          {p.signed.length + p.pending.length === 0 && <div className="emp-item muted">אין ציוד רשום על שם זה.</div>}
        </div>
      ))}
    </>
  )
}
