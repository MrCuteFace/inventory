import { useEffect, useRef, useState } from 'react'
import { api, download, openFile } from '../api'
import { fmtDate, fmtMoney } from '../format'
import { useData, useLoad } from '../state'
import { ErrorBox, Loading, Sn } from '../ui/Bits'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { useSort } from '../ui/useSort'

type Row = {
  id: number; invoiceNumber: string; supplierName: string; purchaseDate: string; unitPrice: number; total: number
  category: string; categoryIcon: string; subCategory: string; subCategoryId: number; count: number; companies: string[]
  file: { fileName: string; sizeBytes: number; uploadedAt: string } | null
}

const MAX_BYTES = 10 * 1024 * 1024

export function Invoices() {
  const { catalog } = useData()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [type, setType] = useState('') // c<id> = קטגוריה, s<id> = תת קטגוריה
  const [missingOnly, setMissingOnly] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<Row | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t) }, [q])

  const params = new URLSearchParams()
  if (debounced) params.set('q', debounced)
  if (type.startsWith('c')) params.set('categoryId', type.slice(1))
  if (type.startsWith('s')) params.set('subCategoryId', type.slice(1))
  const { data, error, retry } = useLoad<Row[]>(`/api/invoices?${params}`)

  const rows = (data ?? []).filter(r => !missingOnly || !r.file)
  const missing = (data ?? []).filter(r => !r.file).length
  const { sorted, th } = useSort(rows, {
    inv: r => r.invoiceNumber, date: r => r.purchaseDate, sup: r => r.supplierName, type: r => `${r.category} ${r.subCategory}`,
    count: r => r.count, total: r => r.total,
  }, { initial: { key: 'date', dir: -1 } })

  const pick = (r: Row) => { setTarget(r); fileInput.current?.click() }
  const upload = async (f: File) => {
    if (!target) return
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { toast('קובץ החשבונית חייב להיות PDF.', 'bad'); return }
    if (f.size > MAX_BYTES) { toast('קובץ החשבונית גדול מ-10MB.', 'bad'); return }
    if (target.file && !confirm(`להחליף את הקובץ של חשבונית ${target.invoiceNumber}? הקובץ הקודם יימחק.`)) return
    const fd = new FormData()
    fd.append('file', f, f.name)
    setUploading(target.id)
    try {
      await api.form(`/api/invoices/${target.id}`, fd)
      toast(target.file ? `הקובץ של חשבונית ${target.invoiceNumber} הוחלף` : `החשבונית ${target.invoiceNumber} צורפה`)
      retry()
    } catch (e) { toast((e as Error).message, 'bad') } finally { setUploading(null); setTarget(null) }
  }
  const save = async (r: Row) => {
    try { await download(`/api/invoices/${r.id}/pdf?download=true`, r.file?.fileName ?? 'invoice.pdf') }
    catch (e) { toast((e as Error).message, 'bad') }
  }

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">חשבוניות</h1>
        <div className="muted">חשבונית לכל קליטת ציוד. חיפוש לפי מספר חשבונית או ספק, וסינון לפי סוג הציוד.</div></div></div>
      {error && <ErrorBox error={error} onRetry={retry} />}
      <section className="panel">
        <div className="toolbar">
          <div className="search"><Icon name="search" /><input className="input" type="search" aria-label="חיפוש חשבונית"
            placeholder="מספר חשבונית או שם ספק" value={q} onChange={e => setQ(e.target.value)} /></div>
          <select className="input" aria-label="סוג ציוד" value={type} onChange={e => setType(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
            <option value="">כל סוגי הציוד</option>
            {catalog.map(c => (
              <optgroup key={c.id} label={c.name}>
                <option value={`c${c.id}`}>כל ה{c.name}</option>
                {c.subCategories.map(s => <option key={s.id} value={`s${s.id}`}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
          <label className="chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} />
            {' '}רק בלי קובץ{data ? ` (${missing})` : ''}</label>
        </div>
        {!data && !error && <Loading />}
        {data && (
          <div className="table-wrap"><table>
            <thead><tr>{th('inv', 'מספר חשבונית')}{th('date', 'תאריך רכישה')}{th('sup', 'ספק')}{th('type', 'סוג ציוד')}<th>עבור חברה</th>
              {th('count', 'יחידות', 'n')}{th('total', 'סה״כ (ללא מע״מ)', 'n')}<th>קובץ</th></tr></thead>
            <tbody>
              {sorted.length ? sorted.map(r => (
                <tr key={r.id}>
                  <td><Sn>{r.invoiceNumber}</Sn></td>
                  <td className="num">{fmtDate(r.purchaseDate)}</td>
                  <td>{r.supplierName}</td>
                  <td><div className="cell-main"><Icon name={r.categoryIcon} /> {r.subCategory}</div><div className="cell-sub">{r.category}</div></td>
                  <td>{r.companies.length ? r.companies.join(', ') : <span className="muted">—</span>}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{fmtMoney(r.total)}</td>
                  <td>
                    {r.file ? (
                      <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                        <a className="btn btn-sm" href={`/api/invoices/${r.id}/pdf`} onClick={e => openFile(e, `/api/invoices/${r.id}/pdf`)} target="_blank" rel="noreferrer" title={r.file.fileName}><Icon name="report" />צפייה</a>
                        <button className="icon-btn" title="הורדה" aria-label={`הורדת חשבונית ${r.invoiceNumber}`} onClick={() => save(r)}><Icon name="download" /></button>
                        <button className="icon-btn" title="החלפת קובץ" aria-label={`החלפת הקובץ של חשבונית ${r.invoiceNumber}`} disabled={uploading === r.id} onClick={() => pick(r)}><Icon name="upload" /></button>
                      </div>
                    ) : (
                      <button className="btn btn-sm" disabled={uploading === r.id} onClick={() => pick(r)}>
                        <Icon name="upload" />{uploading === r.id ? 'מעלה…' : 'צירוף חשבונית'}</button>
                    )}
                    {!r.file && <div className="cell-sub" style={{ color: 'var(--scrap)' }}>חסרה חשבונית</div>}
                  </td>
                </tr>
              )) : <tr><td colSpan={8}><div className="empty">{debounced || type || missingOnly ? 'לא נמצאו חשבוניות שמתאימות לחיפוש.' : 'אין עדיין קליטות ציוד.'}</div></td></tr>}
            </tbody>
          </table></div>
        )}
      </section>
      <input ref={fileInput} type="file" hidden accept=".pdf,application/pdf" onChange={e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) upload(f); else setTarget(null)
      }} />
    </>
  )
}
