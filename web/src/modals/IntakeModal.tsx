import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { addMonthsIso, fmtMoney, todayIso } from '../format'
import { useData } from '../state'
import type { SubPage } from '../types'
import { Tag } from '../ui/Bits'
import { CameraScan } from '../ui/CameraScan'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { CompanyPicker } from '../ui/Pickers'
import { useToast } from '../ui/Toast'

type Row = { key: number; model: string; serial: string }
let rowKey = 1

export function IntakeModal({ subId: fixedSub, onClose }: { subId?: number; onClose: () => void }) {
  const { catalog, changed } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [subId, setSubId] = useState<number | null>(fixedSub ?? null)
  const sub = useMemo(() => catalog.flatMap(c => c.subCategories.map(s => ({ ...s, cat: c }))).find(s => s.id === subId) ?? null, [catalog, subId])

  const [companyId, setCompanyId] = useState<number | null>(null)
  const [supplier, setSupplier] = useState('')
  const [invoice, setInvoice] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [price, setPrice] = useState('')
  const [pdate, setPdate] = useState(todayIso())
  const [months, setMonths] = useState(24)
  const [wend, setWend] = useState(addMonthsIso(todayIso(), 24))
  const [wendTouched, setWendTouched] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [error, setError] = useState('')
  const [bad, setBad] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const snRefs = useRef<(HTMLInputElement | null)[]>([])
  const focusRow = useRef<number | null>(null)

  useEffect(() => { api.get<string[]>('/api/suppliers').then(setSuppliers).catch(() => {}) }, [])

  // ברירות מחדל מהרכישה האחרונה בתת-הקטגוריה: ספק, מחיר ואחריות. הדגם מוצג כ-placeholder ונשמר אם השדה נשאר ריק
  useEffect(() => {
    if (!sub) return
    setMonths(sub.defaultWarrantyMonths)
    setWendTouched(false)
    setRows(rs => (rs.length ? rs : [1, 2, 3].map(() => ({ key: rowKey++, model: '', serial: '' }))))
    api.get<SubPage>(`/api/subcategories/${sub.id}`).then(p => {
      if (p.lastPurchase) {
        setSupplier(s => s || p.lastPurchase!.supplierName)
        setPrice(v => v || String(p.lastPurchase!.unitPrice))
      }
    }).catch(() => {})
  }, [sub?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!wendTouched && pdate) setWend(addMonthsIso(pdate, months)) }, [pdate, months, wendTouched])
  useEffect(() => { if (focusRow.current != null) { snRefs.current[focusRow.current]?.focus(); focusRow.current = null } }, [rows.length])

  const nextNum = sub ? Number(sub.nextTag.split('-')[1]) : 0
  const modelHint = sub ? sub.defaultModel ?? sub.name : ''
  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRow = (after?: number) => {
    focusRow.current = after != null ? after + 1 : rows.length
    setRows(rs => [...rs, { key: rowKey++, model: rs[rs.length - 1]?.model ?? '', serial: '' }])
  }

  const save = async () => {
    const b = new Set<string>()
    const miss: string[] = []
    if (!sub) { b.add('sub'); miss.push('תת קטגוריה') }
    if (!companyId) { b.add('co'); miss.push('עבור איזו חברה') }
    if (!supplier.trim()) { b.add('sup'); miss.push('שם ספק') }
    if (!invoice.trim()) { b.add('inv'); miss.push('מספר חשבונית') }
    if (!pdf) { b.add('pdf'); miss.push('קובץ החשבונית (PDF)') }
    if (price === '' || Number(price) < 0) { b.add('price'); miss.push('מחיר ליחידה') }
    if (!pdate) { b.add('date'); miss.push('תאריך רכישה') }
    if (!wend) { b.add('wend'); miss.push('תאריך תום אחריות') }
    const seen = new Set<string>()
    let dup = false
    rows.forEach(r => {
      const s = r.serial.trim().toLowerCase()
      if (!s) b.add(`sn${r.key}`)
      else if (seen.has(s)) { b.add(`sn${r.key}`); dup = true }
      seen.add(s)
    })
    if (rows.some(r => !r.serial.trim())) miss.push('מספר סנטרלי לכל שורה')
    setBad(b)
    if (miss.length || dup) { setError((miss.length ? `חסרים: ${miss.join(', ')}. ` : '') + (dup ? 'יש מספר סנטרלי שחוזר פעמיים.' : '')); return }

    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('data', JSON.stringify({
        subCategoryId: sub!.id, companyId, supplierName: supplier, invoiceNumber: invoice, purchaseDate: pdate, warrantyEnd: wend,
        unitPrice: Number(price), items: rows.map(x => ({ model: x.model, serialNumber: x.serial })),
      }))
      fd.append('invoice', pdf!, pdf!.name)
      const r = await api.form<{ count: number; ids: number[] }>('/api/intake', fd)
      changed({ fresh: r.ids })
      toast(`${r.count} פריטים נקלטו בהצלחה למלאי`)
      onClose()
      if (!fixedSub) nav(`/c/${sub!.id}`)
    } catch (e) {
      const err = e as ApiError
      setError(err.message)
      // סימון השורות שהשרת דחה (מספר סנטרלי שכבר קיים)
      const serials = (err.data as { serials?: string[] })?.serials
      if (serials) setBad(new Set(rows.filter(r => serials.some(s => s.split(' ')[0].toLowerCase() === r.serial.trim().toLowerCase())).map(r => `sn${r.key}`)))
    } finally { setBusy(false) }
  }

  return (
    <Modal title="קליטת מוצר למלאי" onClose={onClose}
      context={fixedSub && sub ? <><Icon name={sub.cat.icon} />{sub.cat.name} / {sub.name}</> : undefined}
      footer={<>
        <div><div className="total-line"><b>{rows.length}</b> פריטים · שווי כולל <b>{fmtMoney((Number(price) || 0) * rows.length)}</b></div>
          <div className="form-error" role="alert">{error}</div></div>
        <div className="actions"><button className="btn" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}><Icon name="check" />{busy ? 'שומר…' : 'שמור וקלוט למלאי'}</button></div>
      </>}>
      <div className="grid-2">
        {!fixedSub && (
          <div className="field"><label htmlFor="in-sub">תת קטגוריה <span className="req">*</span></label>
            <select className={`input ${bad.has('sub') ? 'bad' : ''}`} id="in-sub" value={subId ?? ''} onChange={e => setSubId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">בחרו לאן לקלוט…</option>
              {catalog.map(c => <optgroup key={c.id} label={c.name}>{c.subCategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
            </select></div>
        )}
        <div className="field"><label htmlFor="in-co">עבור חברה <span className="req">*</span></label>
          <CompanyPicker id="in-co" value={companyId} onChange={setCompanyId} invalid={bad.has('co')} /></div>
      </div>
      <div>
        <div className="group-title">פרטי הרכישה והחשבונית</div>
        <div className="grid-3">
          <div className="field"><label htmlFor="in-sup">שם הספק <span className="req">*</span></label>
            <input className={`input ${bad.has('sup') ? 'bad' : ''}`} id="in-sup" list="sup-list" value={supplier} onChange={e => setSupplier(e.target.value)} />
            <datalist id="sup-list">{suppliers.map(s => <option key={s} value={s} />)}</datalist></div>
          <div className="field"><label htmlFor="in-inv">מספר חשבונית ספק <span className="req">*</span></label>
            <input className={`input mono ${bad.has('inv') ? 'bad' : ''}`} id="in-inv" value={invoice} onChange={e => setInvoice(e.target.value)} /></div>
          <div className="field"><label htmlFor="in-price">מחיר ליחידה (₪, ללא מע״מ) <span className="req">*</span></label>
            <input className={`input num ${bad.has('price') ? 'bad' : ''}`} id="in-price" type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></div>
          <div className="field"><label htmlFor="in-date">תאריך רכישה <span className="req">*</span></label>
            <input className={`input ${bad.has('date') ? 'bad' : ''}`} id="in-date" type="date" value={pdate} onChange={e => setPdate(e.target.value)} /></div>
          <div className="field"><label htmlFor="in-wm">משך אחריות</label>
            <select className="input" id="in-wm" value={months} onChange={e => { setMonths(Number(e.target.value)); setWendTouched(false) }}>
              {[0, 12, 24, 36, 48, 60].map(m => <option key={m} value={m}>{m ? `${m} חודשים` : 'ללא אחריות'}</option>)}
            </select></div>
          <div className="field"><label htmlFor="in-wend">תאריך תום אחריות <span className="req">*</span></label>
            <input className={`input ${bad.has('wend') ? 'bad' : ''}`} id="in-wend" type="date" value={wend} onChange={e => { setWend(e.target.value); setWendTouched(true) }} />
            <span className="hint">מחושב אוטומטית, ניתן לשינוי</span></div>
        </div>
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="in-pdf">קובץ החשבונית (PDF) <span className="req">*</span></label>
          <label className={`drop ${bad.has('pdf') ? 'bad' : ''}`} htmlFor="in-pdf"><Icon name="upload" />
            <span>{pdf ? <><b><bdi>{pdf.name.replace(/\.pdf$/i, '')}</bdi></b> · <bdi>{pdf.size < 1024 * 1024 ? `${Math.max(1, Math.round(pdf.size / 1024))} KB` : `${(pdf.size / 1024 / 1024).toFixed(1)} MB`}</bdi></> : 'בחירת קובץ PDF של החשבונית (עד 10MB)'}</span></label>
          <input type="file" id="in-pdf" hidden accept=".pdf,application/pdf" onChange={e => {
            const f = e.target.files?.[0] ?? null
            e.target.value = ''
            if (!f) return
            if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setError('קובץ החשבונית חייב להיות PDF.'); return }
            if (f.size > 10 * 1024 * 1024) { setError('קובץ החשבונית גדול מ-10MB.'); return }
            setPdf(f); setError(''); setBad(b => { const n = new Set(b); n.delete('pdf'); return n })
          }} />
          <span className="hint">נשמר במערכת ונשלח במייל הקליטה</span></div>
      </div>
      <div>
        <div className="group-title"><span>פריטים לקליטה</span><span className="hint">סורק ברקוד? Enter אחרי סריקה מוסיף שורה חדשה. בטאבלט: כפתור המצלמה ליד השדה</span></div>
        <div className="table-wrap"><table className="intake-table">
          <thead><tr><th>#</th><th>דגם</th><th>מספר נכס</th><th>מספר סנטרלי <span className="req">*</span></th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="rownum">{i + 1}</td>
                <td><input className="input" aria-label={`דגם שורה ${i + 1}`} placeholder={modelHint} value={r.model} onChange={e => setRow(i, { model: e.target.value })} /></td>
                <td>{sub ? <Tag tag={`${sub.prefix}-${nextNum + i}`} /> : <span className="muted">בחרו תת קטגוריה</span>}</td>
                <td><div className="with-cam">
                  <input ref={el => { snRefs.current[i] = el }} className={`input mono ${bad.has(`sn${r.key}`) ? 'bad' : ''}`} aria-label={`מספר סנטרלי שורה ${i + 1}`}
                    placeholder="סריקה או הקלדה" value={r.serial} onChange={e => setRow(i, { serial: e.target.value })}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      if (i === rows.length - 1) addRow(i)
                      else snRefs.current[i + 1]?.focus()
                    }} />
                  <CameraScan what={`מספר הסנטרלי לשורה ${i + 1}`} onValue={t => setRow(i, { serial: t })} />
                </div></td>
                <td><button className="icon-btn danger" aria-label={`מחיקת שורה ${i + 1}`} disabled={rows.length === 1}
                  onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><Icon name="trash" /></button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <button className="add-row" type="button" onClick={() => addRow()}><Icon name="plus" />הוספת שורה</button>
        {sub && <p className="hint" style={{ margin: '8px 0 0' }}>מספרי הנכס נקבעים סופית בשמירה. אם מישהו אחר קולט במקביל, המספרים יזוזו בהתאם.</p>}
      </div>
    </Modal>
  )
}
