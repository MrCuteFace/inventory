import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api'
import type { Company, Employee, EmployeeChoice } from '../types'
import { Icon } from './Icon'

let employeesCache: Promise<Employee[]> | null = null
export const loadEmployees = (fresh = false) => {
  if (fresh || !employeesCache) employeesCache = api.get<Employee[]>('/api/employees').catch(e => { employeesCache = null; throw e })
  return employeesCache
}
export const invalidateEmployees = () => { employeesCache = null }

let companiesCache: Promise<Company[]> | null = null

/** רשימת החברות (טבלת Companies), נטענת פעם אחת. */
export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([])
  useEffect(() => {
    companiesCache ??= api.get<Company[]>('/api/companies').catch(e => { companiesCache = null; throw e })
    companiesCache.then(setCompanies).catch(() => {})
  }, [])
  return companies
}

/** שם קצר לתצוגה צפופה: בלי בע"מ ובלי שנת הייסוד בסוגריים. */
export const shortCompany = (name: string) => name.replace(/\s*\(\d{4}\)/, '').replace(/\s*בע["״]מ/, '').trim()

/** בחירת החברה שעבורה נרכש הפריט. רשימה קבועה מהמסד (טבלת Companies). */
export function CompanyPicker({ id, value, onChange, invalid }: {
  id: string; value: number | null; onChange: (id: number | null) => void; invalid?: boolean
}) {
  const companies = useCompanies()
  return (
    <select className={`input ${invalid ? 'bad' : ''}`} id={id} value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">בחרו חברה…</option>
      {companies.map(c => <option key={c.id} value={c.id}>{c.name} · ח״פ {c.companyNumber}</option>)}
    </select>
  )
}

/**
 * בחירת עובד מהרשימה עם השלמה אוטומטית. שם שלא קיים ברשימה הופך ל"עובד חדש" שייווצר בשמירה,
 * עם שדה מחלקה אופציונלי.
 */
export function EmployeePicker({ id, value, onChange, invalid }: {
  id: string
  value: EmployeeChoice | null
  onChange: (v: EmployeeChoice | null) => void
  invalid?: boolean
}) {
  const listId = useId()
  const [list, setList] = useState<Employee[]>([])
  const [text, setText] = useState(value?.name ?? '')
  const [dept, setDept] = useState('')

  useEffect(() => { loadEmployees().then(setList).catch(() => setList([])) }, [])

  const apply = (t: string, d: string) => {
    const name = t.trim()
    if (!name) return onChange(null)
    const hit = list.find(e => e.fullName === name)
    onChange(hit ? { employeeId: hit.id, name: hit.fullName } : { newEmployeeName: name, newEmployeeDepartment: d.trim() || undefined, name })
  }

  const isNew = text.trim() !== '' && list.length > 0 && !list.some(e => e.fullName === text.trim())
  return (
    <div className="emp-suggest">
      <input className={`input ${invalid ? 'bad' : ''}`} id={id} list={listId} autoComplete="off" value={text}
        placeholder="הקלידו שם עובד או מחלקה"
        onChange={e => { setText(e.target.value); apply(e.target.value, dept) }} />
      <datalist id={listId}>
        {list.map(e => <option key={e.id} value={e.fullName}>{e.department ?? ''}</option>)}
      </datalist>
      {isNew && (
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          <div className="emp-new"><Icon name="plus" className="" /> {text.trim()} יתווסף לרשימת העובדים</div>
          <input className="input" aria-label="מחלקה (רשות)" placeholder="מחלקה (רשות)" value={dept}
            onChange={e => { setDept(e.target.value); apply(text, e.target.value) }} />
        </div>
      )}
    </div>
  )
}

export function appendEmployee(fd: FormData, v: EmployeeChoice) {
  if ('employeeId' in v) fd.append('employeeId', String(v.employeeId))
  else {
    fd.append('newEmployeeName', v.newEmployeeName)
    if (v.newEmployeeDepartment) fd.append('newEmployeeDepartment', v.newEmployeeDepartment)
  }
}

/** מקטין צילום בדפדפן לפני ההעלאה: עד 1800px בצלע הארוכה, JPEG באיכות 0.82 (בד"כ 200-500KB). */
export async function compressImage(file: File, maxSide = 1800): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('compress'))), 'image/jpeg', 0.82))
}

/** בחירת/גרירת צילום עם תצוגה מקדימה. מחזיר Blob מוקטן. */
export function PhotoPicker({ id, onChange, invalid, big, hint, label }: {
  id: string
  onChange: (b: Blob | null) => void
  invalid?: boolean
  big?: boolean
  hint?: string
  label: string
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [over, setOver] = useState(false)
  const [err, setErr] = useState('')
  const urlRef = useRef<string | null>(null)
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const load = async (f: File | undefined) => {
    if (!f) return
    setErr('')
    if (!f.type.startsWith('image/')) { setErr('אפשר לבחור קובץ תמונה בלבד (JPG או PNG).'); return }
    try {
      const blob = await compressImage(f)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = URL.createObjectURL(blob)
      setPreview(urlRef.current)
      setName(f.name)
      onChange(blob)
    } catch {
      setErr('לא הצלחנו לקרוא את התמונה. נסו קובץ אחר.')
    }
  }

  return (
    <>
      <label className={`${big ? 'photo-drop' : 'drop'} ${over ? 'over' : ''} ${invalid ? 'bad' : ''}`} htmlFor={id}
        onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]) }}>
        {preview ? <img src={preview} alt="תצוגה מקדימה" /> : <Icon name={big ? 'image' : 'upload'} />}
        <span>{preview ? <><b>{name}</b> · לחיצה להחלפה</> : <><b>{label}</b>{big && ' או גרירה לכאן'}</>}</span>
        {hint && !preview && <span className="hint">{hint}</span>}
      </label>
      <input type="file" id={id} accept="image/*" hidden onChange={e => load(e.target.files?.[0])} />
      {err && <div className="form-error">{err}</div>}
    </>
  )
}

/** משטח חתימה: עכבר, עט או אצבע. onInk נקרא בפעם הראשונה שמשהו צויר. */
export function SignaturePad({ padRef, onInk }: { padRef: React.MutableRefObject<HTMLCanvasElement | null>; onInk: (inked: boolean) => void }) {
  const drawing = useRef(false)
  const inked = useRef(false)
  useEffect(() => {
    const cv = padRef.current!
    const fit = () => {
      const r = cv.getBoundingClientRect()
      cv.width = r.width * devicePixelRatio
      cv.height = r.height * devicePixelRatio
      const ctx = cv.getContext('2d')!
      ctx.scale(devicePixelRatio, devicePixelRatio)
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1a2e6b'
    }
    requestAnimationFrame(fit)
  }, [padRef])

  const pt = (e: React.PointerEvent) => { const r = padRef.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  return (
    <div className="sig-pad">
      <canvas ref={padRef} aria-label="משטח חתימה"
        onPointerDown={e => { drawing.current = true; padRef.current!.setPointerCapture(e.pointerId); const [x, y] = pt(e); const c = padRef.current!.getContext('2d')!; c.beginPath(); c.moveTo(x, y) }}
        onPointerMove={e => {
          if (!drawing.current) return
          const [x, y] = pt(e); const c = padRef.current!.getContext('2d')!; c.lineTo(x, y); c.stroke()
          if (!inked.current) { inked.current = true; onInk(true) }
        }}
        onPointerUp={() => { drawing.current = false }} />
      <div className="sig-line" />
      {!inked.current && <div className="sig-hint">חתמו כאן עם העכבר או האצבע</div>}
    </div>
  )
}

export function clearPad(cv: HTMLCanvasElement | null) {
  if (!cv) return
  cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height)
}

/**
 * לאילו חברות נמען מקבל מיילים. רשימה ריקה = כל החברות: סימון "כל החברות" מנקה את הבחירה,
 * וסימון חברה מבטל את "כל החברות". ביטול החברה האחרונה מחזיר ל"כל החברות".
 */
export function CompanyScope({ value, onChange, label, companies }: {
  value: number[]; onChange: (ids: number[]) => void; label: string; companies: Company[]
}) {
  const all = value.length === 0
  const toggle = (id: number, on: boolean) => onChange(on ? [...value, id].sort((a, b) => a - b) : value.filter(x => x !== id))
  return (
    <div className="scope" role="group" aria-label={label}>
      <label><input type="checkbox" checked={all} disabled={all} onChange={e => e.target.checked && onChange([])} /> כל החברות</label>
      {companies.map(c => (
        <label key={c.id} title={c.name}><input type="checkbox" checked={value.includes(c.id)} onChange={e => toggle(c.id, e.target.checked)} /> {shortCompany(c.name)}</label>
      ))}
    </div>
  )
}
