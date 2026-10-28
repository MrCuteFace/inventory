import { useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth, useData, useLoad } from '../state'
import type { Employee } from '../types'
import { ErrorBox, Loading } from '../ui/Bits'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { invalidateEmployees } from '../ui/Pickers'
import { useToast } from '../ui/Toast'
import { useSort } from '../ui/useSort'

export function Employees() {
  const [showInactive, setShowInactive] = useState(false)
  const { data, error, retry } = useLoad<Employee[]>(`/api/employees?includeInactive=${showInactive}`)
  const { changed } = useData()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [dept, setDept] = useState('')
  const [editing, setEditing] = useState<Employee | null>(null)
  const [importing, setImporting] = useState(false)
  const { me } = useAuth()

  const filtered = useMemo(() => (data ?? []).filter(e => !q.trim() || e.fullName.includes(q.trim()) || (e.department ?? '').includes(q.trim())), [data, q])
  const { sorted, th } = useSort(filtered, { num: e => e.employeeNumber, name: e => e.fullName, dept: e => e.department ?? '', holding: e => e.holding, unsigned: e => e.unsigned }, { initial: { key: 'name', dir: 1 } })

  const add = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/api/employees', { fullName: name, department: dept })
      toast(`${name.trim()} נוסף לרשימה`); setName(''); setDept(''); invalidateEmployees(); changed()
    } catch (err) { toast((err as Error).message, 'bad') }
  }

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">עובדים</h1><div className="muted">מי יכול לקבל ציוד. אפשר להוסיף גם מחלקה או מקום, למשל ״חדר ישיבות״.</div></div>
        {me?.isAdmin && <div className="actions"><button className="btn" onClick={() => setImporting(true)}><Icon name="upload" />ייבוא אלפון מאקסל</button></div>}
      </div>
      <section className="panel" style={{ padding: 16, marginBottom: 20 }}>
        <form className="inline-form" onSubmit={add}>
          <div className="field"><label htmlFor="ne-name">שם מלא</label><input className="input" id="ne-name" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="ne-dept">מחלקה</label><input className="input" id="ne-dept" value={dept} onChange={e => setDept(e.target.value)} /></div>
          <button className="btn btn-primary" type="submit" disabled={!name.trim()}><Icon name="plus" />הוספת עובד</button>
        </form>
      </section>
      {error && <ErrorBox error={error} onRetry={retry} />}
      {!data && !error && <Loading />}
      {data && (
        <section className="panel">
          <div className="toolbar">
            <div className="search"><Icon name="search" /><input className="input" type="search" aria-label="חיפוש עובד" placeholder="חיפוש לפי שם או מחלקה" value={q} onChange={e => setQ(e.target.value)} /></div>
            <label className="chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> הצגת לא פעילים</label>
          </div>
          <div className="table-wrap"><table>
            <thead><tr>{th('num', 'מס׳ עובד')}{th('name', 'שם')}{th('dept', 'מחלקה')}{th('holding', 'פריטים אצלו', 'n')}{th('unsigned', 'ממתינים לחתימה', 'n')}<th /></tr></thead>
            <tbody>
              {sorted.map(e => (
                <tr key={e.id}>
                  <td className="num">{e.employeeNumber ?? <span className="muted">—</span>}</td>
                  <td className="cell-main">{e.fullName}{!e.isActive && <span className="badge-off">לא פעיל</span>}</td>
                  <td>{e.department ?? <span className="muted">—</span>}</td>
                  <td className="num">{e.holding}</td>
                  <td className="num">{e.unsigned || <span className="muted">0</span>}</td>
                  <td><div className="row-actions"><button className="icon-btn" title="עריכה" aria-label={`עריכת ${e.fullName}`} onClick={() => setEditing(e)}><Icon name="edit" /></button></div></td>
                </tr>
              ))}
              {!sorted.length && <tr><td colSpan={6}><div className="empty">אין עובדים תואמים.</div></td></tr>}
            </tbody>
          </table></div>
        </section>
      )}
      {editing && <EditEmployee e={editing} onClose={() => setEditing(null)} />}
      {importing && <ImportEmployees onClose={() => setImporting(false)} />}
    </>
  )
}

function EditEmployee({ e, onClose }: { e: Employee; onClose: () => void }) {
  const { changed } = useData()
  const toast = useToast()
  const [name, setName] = useState(e.fullName)
  const [dept, setDept] = useState(e.department ?? '')
  const [active, setActive] = useState(e.isActive)
  const [err, setErr] = useState('')
  const save = async () => {
    try {
      await api.put(`/api/employees/${e.id}`, { fullName: name, department: dept, isActive: active })
      invalidateEmployees(); changed(); toast('העובד עודכן'); onClose()
    } catch (x) { setErr((x as Error).message) }
  }
  return (
    <Modal title="עריכת עובד" narrow onClose={onClose} footer={<><div className="form-error" role="alert">{err}</div>
      <div className="actions"><button className="btn" onClick={onClose}>ביטול</button><button className="btn btn-primary" onClick={save}>שמירה</button></div></>}>
      <div className="field"><label htmlFor="ee-name">שם מלא</label><input className="input" id="ee-name" value={name} onChange={x => setName(x.target.value)} /></div>
      <div className="field"><label htmlFor="ee-dept">מחלקה</label><input className="input" id="ee-dept" value={dept} onChange={x => setDept(x.target.value)} /></div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={active} onChange={x => setActive(x.target.checked)} /> פעיל (מופיע ברשימת השיוך)</label>
      {e.holding > 0 && !active && <div className="warn"><Icon name="alert" /><span>יש לעובד {e.holding} פריטים. החזירו או העבירו אותם לפני ההשבתה.</span></div>}
    </Modal>
  )
}

type ImportResult = {
  applied: boolean; total: number; added: string[]; updated: { name: string; changes: string[] }[]; unchanged: number
  missing: { id: number; name: string; department: string | null; holding: number }[]
}

/** ייבוא אלפון: תצוגה מקדימה של מה ישתנה, ואז אישור. רק מספר עובד, שם ומחלקה נקראים מהקובץ. */
function ImportEmployees({ onClose }: { onClose: () => void }) {
  const { changed } = useData()
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async (apply: boolean) => {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    setBusy(true); setErr('')
    try {
      const r = await api.form<ImportResult>(`/api/employees/import?apply=${apply}`, fd)
      if (apply) {
        invalidateEmployees(); changed()
        toast(`האלפון יובא: ${r.added.length} חדשים, ${r.updated.length} עודכנו`)
        onClose()
      } else setPreview(r)
    } catch (e) { setErr((e as Error).message); setPreview(null) } finally { setBusy(false) }
  }

  const nothing = preview && !preview.added.length && !preview.updated.length
  return (
    <Modal title="ייבוא אלפון עובדים" onClose={onClose}
      footer={<><div className="form-error" role="alert">{err}</div>
        <div className="actions"><button className="btn" onClick={onClose}>ביטול</button>
          {preview
            ? <button className="btn btn-primary" disabled={busy || !!nothing} onClick={() => send(true)}><Icon name="check" />אישור וייבוא</button>
            : <button className="btn btn-primary" disabled={busy || !file} onClick={() => send(false)}>בדיקת הקובץ</button>}
        </div></>}>
      <p style={{ margin: 0 }}>קובץ Excel עם כותרות <b>מספר עובד</b>, <b>שם פרטי</b>, <b>שם משפחה</b> (או <b>שם מלא</b>) ו<b>מחלקה</b>. רק העמודות האלה נקראות; תעודת זהות, טלפון ומייל לא נשמרים במערכת.</p>
      <label className="drop" htmlFor="imp-file"><Icon name="upload" /><span>{file ? <b>{file.name}</b> : 'בחירת קובץ xlsx'}</span></label>
      <input type="file" id="imp-file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null) }} />
      {preview && (
        <div style={{ display: 'grid', gap: 14 }}>
          <dl className="details">
            <div><dt>שורות בקובץ</dt><dd className="num">{preview.total}</dd></div>
            <div><dt>עובדים חדשים</dt><dd className="num">{preview.added.length}</dd></div>
            <div><dt>יעודכנו</dt><dd className="num">{preview.updated.length}</dd></div>
          </dl>
          {nothing && <div className="hint">אין מה לעדכן: כל העובדים בקובץ כבר קיימים ומעודכנים.</div>}
          {preview.updated.length > 0 && <div><div className="group-title">שינויים</div>
            <ul className="history">{preview.updated.slice(0, 30).map(u => <li key={u.name}><b>{u.name}</b><span className="muted">{u.changes.join(' · ')}</span></li>)}</ul></div>}
          {preview.missing.length > 0 && <div className="warn"><Icon name="alert" /><span>
            {preview.missing.length} עובדים מהאלפון הקודם לא מופיעים בקובץ ({preview.missing.slice(0, 8).map(m => m.name).join(', ')}{preview.missing.length > 8 ? '…' : ''}).
            הם לא מושבתים אוטומטית; אם עזבו, השביתו אותם ידנית אחרי שהציוד שלהם הוחזר.</span></div>}
        </div>
      )}
    </Modal>
  )
}
