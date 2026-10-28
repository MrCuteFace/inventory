import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { download } from '../api'
import { fmtDate, fmtMoney, STATUS_LABEL, STATUS_ORDER } from '../format'
import { useData, useLoad } from '../state'
import type { AssetRow, Status, SubPage } from '../types'
import { ErrorBox, Loading, Pill, Sn, Tag, srOnly, statusClass } from '../ui/Bits'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { useSort } from '../ui/useSort'

export function Category() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { data, error, retry } = useLoad<SubPage>(`/api/subcategories/${id}`)
  const { open, fresh } = useData()
  const toast = useToast()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState<'all' | Status>('all')
  const prevKpis = useRef<SubPage['kpis'] | null>(null)
  const [bumped, setBumped] = useState<Set<string>>(new Set())

  // מעבר לתת-קטגוריה אחרת מאפס סינון; חיפוש מהקישור (?q=) נטען פעם אחת
  useEffect(() => { setQ(params.get('q') ?? ''); setStatus('all'); prevKpis.current = null }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // הדגשה קצרה של מדד שהשתנה אחרי פעולה
  useEffect(() => {
    if (!data) return
    const prev = prevKpis.current
    if (prev) {
      const changed = new Set(Object.keys(data.kpis).filter(k => (data.kpis as Record<string, unknown>)[k] !== (prev as Record<string, unknown>)[k]))
      setBumped(changed)
      setTimeout(() => setBumped(new Set()), 700)
    }
    prevKpis.current = data.kpis
  }, [data])

  const byQ = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!data) return []
    if (!t) return data.assets
    return data.assets.filter(a => [a.assetTag, a.serialNumber, a.employeeName ?? '', a.model].some(v => v.toLowerCase().includes(t)))
  }, [data, q])
  const filtered = useMemo(() => byQ.filter(a => status === 'all' || a.status === status), [byQ, status])
  const { sorted, th } = useSort(filtered, {
    model: a => a.model, sn: a => a.serialNumber, tag: a => a.assetTag, status: a => STATUS_ORDER.indexOf(a.status),
    assignee: a => a.employeeName ?? '', invoice: a => a.invoiceNumber, sig: a => (a.signed ? 2 : a.employeeId ? 1 : 0),
  })

  if (error) return <ErrorBox error={error} onRetry={retry} />
  if (!data || String(data.id) !== id) return <Loading />

  const k = data.kpis
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, byQ.filter(a => a.status === s).length])) as Record<Status, number>
  const kv = (key: string, v: React.ReactNode, small = false) => <div className={`kpi-val ${small ? 'small' : ''} ${bumped.has(key) ? 'bump' : ''}`}>{v}</div>

  const exportXlsx = async () => {
    try { await download(`/api/subcategories/${data.id}/export`, `${data.prefix}.xlsx`) }
    catch (e) { toast((e as Error).message, 'bad') }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb"><Icon name={data.category.icon} /><span>{data.category.name}</span><span aria-hidden="true">/</span></div>
          <h1 className="page-title">{data.name}</h1>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => open({ kind: 'scrap', subId: data.id })}><Icon name="out" />גריעה מהמלאי</button>
          <button className="btn btn-primary" onClick={() => open({ kind: 'intake', subId: data.id })}><Icon name="in" />הכנס כמות למלאי</button>
        </div>
      </div>

      <section className="kpis" aria-label="מדדים">
        <div className="kpi"><div className="kpi-label">כמות כללית</div>{kv('active', k.active)}</div>
        <div className="kpi"><div className="kpi-label"><i className="dot bg-use" />בשימוש</div>{kv('inUse', k.inUse)}</div>
        <div className="kpi"><div className="kpi-label"><i className="dot bg-avail" />במלאי (זמין)</div>{kv('available', k.available)}</div>
        <div className="kpi"><div className="kpi-label"><i className="dot bg-repair" />בתיקון / מעבדה</div>{kv('repair', k.repair)}</div>
        <div className="kpi"><div className="kpi-label">מחיר ליחידה</div>{kv('unitPrice', fmtMoney(k.unitPrice))}</div>
        <div className="kpi"><div className="kpi-label">שווי כללי</div>{kv('value', fmtMoney(k.value))}</div>
        <div className="kpi"><div className="kpi-label">שם ספק</div><div className="kpi-val small" title={k.supplier ?? ''}>{k.supplier ?? '—'}</div></div>
      </section>

      <section className="panel" aria-label="טבלת ציוד">
        <div className="toolbar">
          <div className="search"><Icon name="search" />
            <input className="input" type="search" aria-label="חיפוש" placeholder="חיפוש לפי מספר נכס, סנטרלי או שם עובד" autoComplete="off"
              value={q} onChange={e => { setQ(e.target.value); if (params.get('q')) setParams({}, { replace: true }) }} /></div>
          <div className="chips">
            <button className="chip" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>הכל <span className="n">{byQ.length}</span></button>
            {STATUS_ORDER.map(s => (
              <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
                <i className={`dot bg-${statusClass(s)}`} />{STATUS_LABEL[s]} <span className="n">{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="btn btn-sm" onClick={exportXlsx}><Icon name="download" />Excel</button>
            <button className="btn btn-sm" onClick={() => window.print()} title="הדפסה או שמירה כ-PDF"><Icon name="printer" />PDF / הדפסה</button>
          </div>
        </div>
        <div className="table-wrap"><table>
          <thead><tr>
            {th('model', 'שם המוצר / דגם')}{th('sn', 'מספר סנטרלי')}{th('tag', 'מספר נכס')}{th('status', 'סטטוס')}
            {th('assignee', 'משויך ל')}{th('invoice', 'חשבונית ספק')}{th('sig', 'חתימה')}<th><span style={srOnly}>פעולות</span></th>
          </tr></thead>
          <tbody>
            {sorted.length ? sorted.map(a => <Row key={a.id} a={a} fresh={fresh.has(a.id)} />) : (
              <tr><td colSpan={8}><div className="empty">
                {data.assets.length
                  ? 'לא נמצאו פריטים התואמים לחיפוש. נסו מספר נכס מלא או מספר סנטרלי.'
                  : 'אין עדיין ציוד בתת־קטגוריה הזו. לחצו על ״הכנס כמות למלאי״ כדי לקלוט את הפריטים הראשונים.'}
              </div></td></tr>
            )}
          </tbody>
        </table></div>
        <div className="foot-note">
          <span>מוצגים {sorted.length} מתוך {data.assets.length} פריטים</span>
          <span>מספר נכס הבא בתור: <b className="sn">{data.nextTag}</b></span>
        </div>
      </section>
    </>
  )
}

function Row({ a, fresh }: { a: AssetRow; fresh: boolean }) {
  const { open } = useData()
  const scrapped = a.status === 'scrapped'
  return (
    <tr className={`${scrapped ? 'is-scrapped' : ''} ${fresh ? 'fresh' : ''}`}>
      <td><div className="cell-main">{a.model}</div><div className="cell-sub">נרכש {fmtDate(a.purchaseDate)}{a.companyName && <> · {a.companyName}</>}</div></td>
      <td><Sn>{a.serialNumber}</Sn></td>
      <td><Tag tag={a.assetTag} /></td>
      <td><Pill status={a.status} /></td>
      <td>
        {a.employeeName
          ? <><div className="cell-main">{a.employeeName}</div><div className="cell-sub">נמסר {fmtDate(a.deliveredAt)}</div></>
          : a.disposalReason ? <span className="cell-sub">{a.disposalReason}</span> : <span className="muted">—</span>}
      </td>
      <td><Sn>{a.invoiceNumber}</Sn></td>
      <td><SigCell a={a} /></td>
      <td><div className="row-actions">
        <button className="icon-btn" title="עריכה" aria-label={`עריכת ${a.assetTag}`} disabled={scrapped} onClick={() => open({ kind: 'edit', assetId: a.id })}><Icon name="edit" /></button>
        <button className="icon-btn" title={a.signed ? 'צפייה בטופס חתימה' : 'הוספת חתימה'} aria-label={`חתימה ${a.assetTag}`} disabled={scrapped}
          onClick={() => open(a.signed ? { kind: 'form', assetId: a.id } : { kind: 'addsig', assetId: a.id })}><Icon name="sign" /></button>
        <button className="icon-btn danger" title="גריעה מהירה" aria-label={`גריעת ${a.assetTag}`} disabled={scrapped} onClick={() => open({ kind: 'scrap', assetId: a.id })}><Icon name="trash" /></button>
      </div></td>
    </tr>
  )
}

function SigCell({ a }: { a: AssetRow }) {
  const { open } = useData()
  if (a.status === 'scrapped') return <span className="muted">—</span>
  if (a.signed) return <button className="sig ok" onClick={() => open({ kind: 'form', assetId: a.id })} title="צפייה בטופס החתום"><Icon name="check" />חתום</button>
  if (a.employeeId) return <button className="sig wait" onClick={() => open({ kind: 'addsig', assetId: a.id })} title="הוספת חתימה"><Icon name="clock" />ממתין</button>
  return <button className="sig-add" onClick={() => open({ kind: 'addsig', assetId: a.id })} aria-label={`הוספת חתימה ל-${a.assetTag}`} title="הוספת חתימה">—<span className="more">הוספת חתימה</span></button>
}
