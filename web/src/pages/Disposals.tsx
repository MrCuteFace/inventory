import { useState } from 'react'
import { download, openFile } from '../api'
import { fmtDate, fmtMoney } from '../format'
import { useData, useLoad } from '../state'
import { ErrorBox, Loading, Sn, Tag } from '../ui/Bits'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { useSort } from '../ui/useSort'

type Row = {
  assetId: number; disposedAt: string; assetTag: string; serialNumber: string; model: string; subCategory: string
  reason: string; description: string | null; invoiceNumber: string; supplierName: string; purchaseDate: string
  price: number; returnedToWarehouse: boolean; previousEmployee: string | null; approver: string; hasPhoto: boolean
}
type Report = { month: string; count: number; value: number; notReturned: number; items: Row[] }

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export function Disposals() {
  const [month, setMonth] = useState(thisMonth())
  const { data, error, retry } = useLoad<Report>(`/api/reports/disposals?month=${month}`)
  const { open } = useData()
  const toast = useToast()
  const { sorted, th } = useSort(data?.items ?? [], {
    date: r => r.disposedAt, tag: r => r.assetTag, model: r => r.model, reason: r => r.reason, invoice: r => r.invoiceNumber,
    price: r => r.price, returned: r => (r.returnedToWarehouse ? 1 : 0), approver: r => r.approver,
  }, { initial: { key: 'date', dir: -1 } })

  const [y, m] = month.split('-').map(Number)
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })

  const exportXlsx = async () => {
    try { await download(`/api/reports/disposals/export?month=${month}`, `disposals-${month}.xlsx`) }
    catch (e) { toast((e as Error).message, 'bad') }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">דו״ח גריעות · {monthName}</h1>
          <div className="muted">לעדכון פחת ורכוש קבוע בהנהלת חשבונות</div>
        </div>
        <div className="actions">
          <label htmlFor="dm" className="muted" style={{ alignSelf: 'center' }}>חודש</label>
          <input id="dm" className="input month-pick" type="month" value={month} max={thisMonth()} onChange={e => e.target.value && setMonth(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn" onClick={exportXlsx}><Icon name="download" />ייצוא ל-Excel</button>
          <button className="btn" onClick={() => window.print()}><Icon name="printer" />PDF / הדפסה</button>
        </div>
      </div>
      {error && <ErrorBox error={error} onRetry={retry} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <section className="kpis" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
            <div className="kpi"><div className="kpi-label">פריטים שנגרעו</div><div className="kpi-val">{data.count}</div></div>
            <div className="kpi"><div className="kpi-label">שווי רכישה מקורי</div><div className="kpi-val">{fmtMoney(data.value)}</div></div>
            <div className="kpi"><div className="kpi-label">לא הוחזרו פיזית למחסן</div><div className="kpi-val">{data.notReturned}</div></div>
          </section>
          <section className="panel"><div className="table-wrap"><table>
            <thead><tr>{th('date', 'תאריך גריעה')}{th('tag', 'מספר נכס')}{th('model', 'פריט')}{th('reason', 'סיבה')}{th('invoice', 'חשבונית מקורית')}{th('price', 'שווי')}{th('returned', 'הוחזר למחסן')}{th('approver', 'אושר ע״י')}</tr></thead>
            <tbody>
              {sorted.length ? sorted.map(r => (
                <tr key={r.assetId}>
                  <td className="num">{fmtDate(r.disposedAt)}</td>
                  <td><Tag tag={r.assetTag} /></td>
                  <td><div className="cell-main">{r.model}</div><div className="cell-sub">{r.subCategory} · <Sn>{r.serialNumber}</Sn></div></td>
                  <td><div>{r.reason}</div>{r.description && <div className="cell-sub">{r.description}</div>}
                    {r.hasPhoto && <a className="cell-sub" href={`/api/assets/${r.assetId}/disposal-photo`} onClick={e => openFile(e, `/api/assets/${r.assetId}/disposal-photo`)} target="_blank" rel="noreferrer">צילום הנזק</a>}</td>
                  <td><Sn>{r.invoiceNumber}</Sn></td>
                  <td className="num">{fmtMoney(r.price)}</td>
                  <td>{r.returnedToWarehouse ? <span className="sig ok"><Icon name="check" />כן</span> : <span className="pill st-pending">חסר במלאי</span>}</td>
                  <td>{r.approver}</td>
                </tr>
              )) : <tr><td colSpan={8}><div className="empty">לא נגרע ציוד בחודש הזה.</div></td></tr>}
            </tbody>
          </table></div>
          <div className="foot-note no-print"><span>לגריעת פריט: כפתור הפח בשורה בדף הקטגוריה, או</span>
            <button className="btn btn-sm" onClick={() => open({ kind: 'scrap' })}><Icon name="out" />גריעת ציוד</button></div>
          </section>
        </>
      )}
    </>
  )
}
