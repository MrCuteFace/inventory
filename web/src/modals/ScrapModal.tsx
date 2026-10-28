import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtDate, fmtMoney } from '../format'
import { useAuth, useData } from '../state'
import type { AssetDetails, AssetRow } from '../types'
import { Pill, Sn, Tag } from '../ui/Bits'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { PhotoPicker } from '../ui/Pickers'
import { useToast } from '../ui/Toast'

export function AssetDetailsGrid({ a }: { a: AssetRow }) {
  const items: [string, React.ReactNode][] = [
    ['פריט', a.model], ['קטגוריה', `${a.categoryName} / ${a.subCategoryName}`], ['מספר סנטרלי', <Sn>{a.serialNumber}</Sn>],
    ['משויך ל', a.employeeName ?? 'מחסן IT'], ['תאריך רכישה', fmtDate(a.purchaseDate)], ['חשבונית ספק', <Sn>{a.invoiceNumber}</Sn>],
    ['מספר נכס', <Tag tag={a.assetTag} />], ['סטטוס נוכחי', <Pill status={a.status} />], ['שווי', fmtMoney(a.price)],
  ]
  return <dl className="details">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
}

export function ScrapModal({ assetId, subId, onClose }: { assetId?: number; subId?: number; onClose: () => void }) {
  const { me } = useAuth()
  const { changed } = useData()
  const toast = useToast()
  const [asset, setAsset] = useState<AssetRow | null>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AssetRow[] | null>(null)
  const [reason, setReason] = useState('')
  const [desc, setDesc] = useState('')
  const [returned, setReturned] = useState(true)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [error, setError] = useState('')
  const [bad, setBad] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.get<string[]>('/api/disposal-reasons').then(setReasons).catch(() => {}) }, [])
  useEffect(() => { if (assetId) api.get<AssetDetails>(`/api/assets/${assetId}`).then(d => setAsset(d.asset)).catch(e => setError(e.message)) }, [assetId])
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setResults(null); return }
    const h = setTimeout(() => api.get<AssetRow[]>(`/api/assets/search?q=${encodeURIComponent(t)}&activeOnly=true`).then(r => {
      // מתוך דף קטגוריה: פריטים של אותה תת-קטגוריה קודם
      setResults(subId ? [...r.filter(x => x.subCategoryId === subId), ...r.filter(x => x.subCategoryId !== subId)] : r)
    }).catch(() => setResults([])), 200)
    return () => clearTimeout(h)
  }, [q, subId])

  const submit = async () => {
    const b = new Set<string>(), errs: string[] = []
    if (!asset) { b.add('q'); errs.push('בחרו פריט לגריעה') }
    if (!reason) { b.add('reason'); errs.push('בחרו סיבת השבתה') }
    setBad(b)
    if (errs.length) { setError(errs.join(' · ')); return }
    const fd = new FormData()
    fd.append('reason', reason)
    if (desc.trim()) fd.append('description', desc.trim())
    fd.append('returnedToWarehouse', String(returned))
    if (photo) fd.append('photo', photo, 'damage.jpg')
    setBusy(true); setError('')
    try {
      await api.form(`/api/assets/${asset!.id}/dispose`, fd)
      changed()
      toast(`${asset!.assetTag} הועבר לגריעה ונוסף לדו״ח החודשי`)
      onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal title="השבתת ציוד / גריעה מהמלאי" onClose={onClose} context={asset && assetId ? <Tag tag={asset.assetTag} /> : undefined}
      footer={<><div className="form-error" role="alert">{error}</div>
        <div className="actions"><button className="btn" onClick={onClose}>ביטול</button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}><Icon name="out" />אישור והעברה לגריעה</button></div></>}>
      {!assetId && (
        <div>
          <div className="field"><label htmlFor="sc-q">זיהוי הציוד <span className="req">*</span></label>
            <div className="search" style={{ maxWidth: 'none' }}><Icon name="scan" />
              <input className={`input ${bad.has('q') ? 'bad' : ''}`} id="sc-q" autoComplete="off" placeholder="סרקו או הקלידו מספר נכס / מספר סנטרלי"
                value={q} onChange={e => { setQ(e.target.value); setAsset(null) }} /></div></div>
          {results && !asset && (
            <div className="pick-list">
              {results.length ? results.map(a => (
                <button key={a.id} type="button" onClick={() => { setAsset(a); setQ(a.assetTag); setResults(null) }}>
                  <Tag tag={a.assetTag} /><span>{a.model}</span><Sn>{a.serialNumber}</Sn>
                  <span style={{ marginInlineStart: 'auto' }}><Pill status={a.status} /></span>
                </button>
              )) : <div className="empty" style={{ padding: 14 }}>לא נמצא פריט פעיל עם המספר הזה</div>}
            </div>
          )}
        </div>
      )}
      {asset && <AssetDetailsGrid a={asset} />}
      <div className="grid-2">
        <div className="field"><label htmlFor="sc-reason">סיבת ההשבתה <span className="req">*</span></label>
          <select className={`input ${bad.has('reason') ? 'bad' : ''}`} id="sc-reason" value={reason} onChange={e => setReason(e.target.value)}>
            <option value="">בחרו סיבה…</option>{reasons.map(r => <option key={r}>{r}</option>)}
          </select></div>
        <div className="field"><span className="label">האם הציוד הפיזי הוחזר למחסן ה-IT?</span>
          <div className="seg" role="radiogroup">
            <label><input type="radio" name="sc-ret" checked={returned} onChange={() => setReturned(true)} /><span>כן</span></label>
            <label><input type="radio" name="sc-ret" checked={!returned} onChange={() => setReturned(false)} /><span>לא</span></label>
          </div></div>
        <div className="field span-2"><label htmlFor="sc-desc">פירוט הנזק / תיאור המקרה</label>
          <textarea className="input" id="sc-desc" maxLength={1000} placeholder="לדוגמה: נשבר המסך במהלך פריקה במסוף" value={desc} onChange={e => setDesc(e.target.value)} /></div>
      </div>
      {!returned && <div className="warn"><Icon name="alert" /><span>נוהל ״ישן תמורת חדש״: הציוד לא הוחזר. המקרה יסומן כ״חסר במלאי״ בדו״ח, ונדרש אישור מנהל לפני הנפקת ציוד חלופי.</span></div>}
      <div className="grid-2">
        <div className="field"><span className="label">צירוף תמונה (רשות)</span><PhotoPicker id="sc-file" label="בחירת קובץ או צילום של הנזק" onChange={setPhoto} /></div>
        <div className="field"><label htmlFor="sc-appr">גורם מאשר</label><input className="input" id="sc-appr" value={me?.fullName ?? ''} readOnly />
          <span className="hint">נרשם אוטומטית לפי המשתמש המחובר</span></div>
      </div>
    </Modal>
  )
}
