import { useEffect, useRef, useState } from 'react'
import { api, useFileUrl } from '../api'
import { fmtDate, todayIso } from '../format'
import { useData } from '../state'
import type { AssetDetails, EmployeeChoice } from '../types'
import { Loading, Pill, Sn, Tag } from '../ui/Bits'
import { CameraScan } from '../ui/CameraScan'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { appendEmployee, CompanyPicker, EmployeePicker, invalidateEmployees, SignaturePad } from '../ui/Pickers'
import { useToast } from '../ui/Toast'

const DECLARATION = 'אני מאשר/ת כי קיבלתי את הציוד המפורט לעיל במצב תקין, ואני מתחייב/ת לשמור עליו ולהשתמש בו לצורכי עבודה בלבד. במקרה של נזק, אובדן או סיום העסקה אחזיר את הציוד למחסן ה-IT. ציוד חלופי יונפק לפי נוהל ״ישן תמורת חדש״.'

function useAsset(id: number) {
  const [d, setD] = useState<AssetDetails | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get<AssetDetails>(`/api/assets/${id}`).then(setD).catch(e => setErr(e.message)) }, [id])
  return { d, err }
}

/* ---------------- עריכה: פרטים, תיקון, שיוך, החזרה ---------------- */
export function EditModal({ assetId, onClose }: { assetId: number; onClose: () => void }) {
  const { d, err } = useAsset(assetId)
  const { changed, open } = useData()
  const toast = useToast()
  const [model, setModel] = useState('')
  const [serial, setSerial] = useState('')
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [repair, setRepair] = useState(false)
  const [assignTo, setAssignTo] = useState<EmployeeChoice | null>(null)
  const [deliveredAt, setDeliveredAt] = useState(todayIso())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!d) return
    setModel(d.asset.model); setSerial(d.asset.serialNumber); setCompanyId(d.asset.companyId); setRepair(d.asset.status === 'repair')
  }, [d])

  if (!d) return <Modal title="עריכת פריט" narrow onClose={onClose}>{err ? <div className="form-error">{err}</div> : <Loading />}</Modal>
  const a = d.asset

  const save = async () => {
    if (!companyId) { setError('בחרו עבור איזו חברה הפריט'); return }
    setBusy(true); setError('')
    try {
      await api.put(`/api/assets/${a.id}`, { model, serialNumber: serial, inRepair: repair, companyId })
      if (assignTo && assignTo.name !== a.employeeName) {
        await api.post(`/api/assets/${a.id}/assign`, { ...('employeeId' in assignTo ? { employeeId: assignTo.employeeId } : { newEmployeeName: assignTo.newEmployeeName, newEmployeeDepartment: assignTo.newEmployeeDepartment }), deliveredAt })
        if (!('employeeId' in assignTo)) invalidateEmployees()
      }
      changed(); toast(`${a.assetTag} עודכן`); onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const giveBack = async () => {
    try { await api.post(`/api/assets/${a.id}/return`); changed(); toast(`${a.assetTag} הוחזר למחסן`); onClose() }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <Modal title="עריכת פריט" narrow onClose={onClose} context={<><Tag tag={a.assetTag} /> {a.categoryName} / {a.subCategoryName}</>}
      footer={<><div className="form-error" role="alert">{error}</div>
        <div className="actions"><button className="btn" onClick={onClose}>ביטול</button><button className="btn btn-primary" onClick={save} disabled={busy}>שמירת שינויים</button></div></>}>
      <div className="grid-2">
        <div className="field span-2"><label htmlFor="ed-model">שם המוצר / דגם</label><input className="input" id="ed-model" value={model} onChange={e => setModel(e.target.value)} /></div>
        <div className="field"><label htmlFor="ed-sn">מספר סנטרלי</label><div className="with-cam"><input className="input mono" id="ed-sn" value={serial} onChange={e => setSerial(e.target.value)} />
          <CameraScan what="המספר הסנטרלי" onValue={setSerial} /></div></div>
        <div className="field span-2"><label htmlFor="ed-co">עבור חברה <span className="req">*</span></label>
          <CompanyPicker id="ed-co" value={companyId} onChange={setCompanyId} invalid={!!error && !companyId} /></div>
        <div className="field"><span className="label">מצב</span>
          <div className="seg" role="radiogroup">
            <label><input type="radio" name="ed-rep" checked={!repair} onChange={() => setRepair(false)} /><span>תקין</span></label>
            <label><input type="radio" name="ed-rep" checked={repair} onChange={() => setRepair(true)} /><span>בתיקון</span></label>
          </div></div>
      </div>
      <div>
        <div className="group-title">שיוך לעובד</div>
        {a.employeeName && (
          <div className="actions" style={{ marginBottom: 10 }}>
            <span>כרגע אצל <b>{a.employeeName}</b> מ־{fmtDate(a.deliveredAt)}</span>
            <button className="btn btn-sm btn-ghost" onClick={giveBack}><Icon name="box" />החזרה למחסן</button>
          </div>
        )}
        <div className="grid-2">
          <div className="field"><label htmlFor="ed-as">{a.employeeName ? 'העברה לעובד אחר' : 'מסירה לעובד'}</label>
            <EmployeePicker id="ed-as" value={null} onChange={setAssignTo} /></div>
          <div className="field"><label htmlFor="ed-date">תאריך מסירה</label><input className="input" id="ed-date" type="date" value={deliveredAt} onChange={e => setDeliveredAt(e.target.value)} /></div>
        </div>
        <span className="hint">מסירה חדשה ממתינה לחתימת העובד</span>
      </div>
      <div className="field"><span className="label">חתימת עובד</span>
        {a.signed
          ? <div className="actions"><span className="sig ok"><Icon name="check" />חתום על ידי {a.employeeName}</span><button className="btn btn-sm" onClick={() => open({ kind: 'form', assetId: a.id })}><Icon name="sign" />צפייה בטופס</button></div>
          : <div className="actions"><span className="muted">{a.employeeName ? 'ממתין לחתימה' : 'אין חתימה'}</span><button className="btn btn-sm" onClick={() => open({ kind: 'addsig', assetId: a.id })}><Icon name="sign" />הוספת חתימה</button></div>}
      </div>
    </Modal>
  )
}

/* ---------------- הוספת חתימה: בחירת עובד וחתימה על המסך ---------------- */
export function AddSignatureModal({ assetId, onClose }: { assetId: number; onClose: () => void }) {
  const { d, err } = useAsset(assetId)
  const { changed } = useData()
  const toast = useToast()
  const padRef = useRef<HTMLCanvasElement | null>(null)
  const [inked, setInked] = useState(false)
  const [padKey, setPadKey] = useState(0)
  const [who, setWho] = useState<EmployeeChoice | null>(null)
  const [ready, setReady] = useState(false)   // הבוחר קורא את הערך רק בעלייה, ולכן נבנה מחדש אחרי מילוי העובד המשויך
  const [date, setDate] = useState(todayIso())
  const [bad, setBad] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!d) return
    if (d.asset.employeeId && d.asset.employeeName) setWho({ employeeId: d.asset.employeeId, name: d.asset.employeeName })
    if (d.asset.deliveredAt) setDate(d.asset.deliveredAt)
    setReady(true)
  }, [d])

  if (!d) return <Modal title="הוספת חתימת עובד" onClose={onClose}>{err ? <div className="form-error">{err}</div> : <Loading />}</Modal>
  const a = d.asset

  const save = async () => {
    const b = new Set<string>(), miss: string[] = []
    if (!who) { b.add('who'); miss.push('שם העובד') }
    if (!date) { b.add('date'); miss.push('תאריך מסירה') }
    if (!inked) { b.add('pad'); miss.push('חתימה') }
    setBad(b)
    if (miss.length) { setError('חסרים: ' + miss.join(', ')); return }
    const blob = await new Promise<Blob | null>(res => padRef.current!.toBlob(res, 'image/png'))
    if (!blob) return
    const fd = new FormData()
    fd.append('kind', 'drawn')
    appendEmployee(fd, who!)
    fd.append('deliveredAt', date)
    fd.append('image', blob, 'signature.png')
    setBusy(true); setError('')
    try {
      await api.form(`/api/assets/${a.id}/signature`, fd)
      if (!('employeeId' in who!)) invalidateEmployees()
      changed(); toast(`החתימה נשמרה. ${a.assetTag} בשימוש אצל ${who!.name}`); onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal title="הוספת חתימת עובד" onClose={onClose} context={<><Tag tag={a.assetTag} /> {a.model}</>}
      footer={<><div className="actions" style={{ marginInlineStart: 0 }}>
          <button className="btn btn-ghost" onClick={() => { setPadKey(k => k + 1); setInked(false) }}>ניקוי חתימה</button>
          <span className="form-error" role="alert">{error}</span></div>
        <div className="actions"><button className="btn" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}><Icon name="check" />חתום ואשר קבלה</button></div></>}>
      <div className="grid-2">
        <div className="field"><label htmlFor="as-who">שם העובד / מחלקה <span className="req">*</span></label>
          <EmployeePicker key={ready ? 1 : 0} id="as-who" value={who} onChange={setWho} invalid={bad.has('who')} /></div>
        <div className="field"><label htmlFor="as-date">תאריך מסירה <span className="req">*</span></label>
          <input className={`input ${bad.has('date') ? 'bad' : ''}`} id="as-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      </div>
      <dl className="details">
        <div><dt>קטגוריה</dt><dd>{a.categoryName} / {a.subCategoryName}</dd></div>
        <div><dt>מספר סנטרלי</dt><dd><Sn>{a.serialNumber}</Sn></dd></div>
        <div><dt>סטטוס נוכחי</dt><dd><Pill status={a.status} /></dd></div>
      </dl>
      <p style={{ margin: 0 }}>{DECLARATION}</p>
      <div><div className="label" style={{ marginBottom: 6 }}>חתימת העובד <span className="req">*</span></div>
        <SignaturePad key={padKey} padRef={padRef} onInk={v => { setInked(v); if (v) setBad(s => { const n = new Set(s); n.delete('pad'); return n }) }} /></div>
    </Modal>
  )
}

/* ---------------- טופס מסירה: צפייה בחתום, או חתימה על המסך ---------------- */
export function HandoverModal({ assetId, onClose }: { assetId: number; onClose: () => void }) {
  const { d, err } = useAsset(assetId)
  const { changed, open } = useData()
  const toast = useToast()
  const padRef = useRef<HTMLCanvasElement | null>(null)
  const [inked, setInked] = useState(false)
  const [padKey, setPadKey] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!d) return <Modal title="טופס מסירת ציוד לעובד" onClose={onClose}>{err ? <div className="form-error">{err}</div> : <Loading />}</Modal>
  const a = d.asset

  if (!a.employeeId) {
    // אין למי למסור: החתימה עוברת דרך מסך הוספת החתימה, שבו בוחרים עובד
    return (
      <Modal title="טופס מסירת ציוד לעובד" narrow onClose={onClose}
        footer={<div className="actions"><button className="btn" onClick={onClose}>סגירה</button><button className="btn btn-primary" onClick={() => open({ kind: 'addsig', assetId: a.id })}>הוספת חתימה</button></div>}>
        <p style={{ margin: 0 }}>{a.assetTag} לא משויך לעובד, ולכן אין טופס מסירה. אפשר לשייך דרך עריכה, או בהוספת חתימה, שבה בוחרים את העובד.</p>
      </Modal>
    )
  }

  const sign = async () => {
    const blob = await new Promise<Blob | null>(res => padRef.current!.toBlob(res, 'image/png'))
    if (!blob) return
    const fd = new FormData()
    fd.append('kind', 'drawn')
    fd.append('image', blob, 'signature.png')
    setBusy(true); setError('')
    try {
      await api.form(`/api/assets/${a.id}/signature`, fd)
      changed(); toast(`החתימה נשמרה. ${a.assetTag} בשימוש אצל ${a.employeeName}`); onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const photo = a.signatureKind === 'photo'
  return (
    <Modal title="טופס מסירת ציוד לעובד" onClose={onClose} context={<><Tag tag={a.assetTag} /> {a.subCategoryName}</>}
      footer={a.signed
        ? <><span className="sig ok"><Icon name="check" />הטופס חתום</span>
            <div className="actions"><button className="btn" onClick={() => window.print()}><Icon name="printer" />הדפסה / PDF</button><button className="btn btn-primary" onClick={onClose}>סגירה</button></div></>
        : <><div className="actions" style={{ marginInlineStart: 0 }}>
              <button className="btn btn-ghost" onClick={() => { setPadKey(k => k + 1); setInked(false) }}>ניקוי חתימה</button>
              <span className="form-error" role="alert">{error}</span></div>
            <div className="actions"><button className="btn" onClick={onClose}>ביטול</button>
              <button className="btn btn-primary" disabled={!inked || busy} onClick={sign}><Icon name="check" />חתום ואשר קבלה</button></div></>}>
      <div className="form-sheet">
        <h3>אישור קבלת ציוד · קבוצת הדגמה</h3>
        <dl className="details">
          <div><dt>שם העובד / מחלקה</dt><dd>{a.employeeName}</dd></div>
          <div><dt>תאריך מסירה</dt><dd>{fmtDate(a.deliveredAt)}</dd></div>
          <div><dt>פריט</dt><dd>{a.model}</dd></div>
          <div><dt>מספר סנטרלי</dt><dd><Sn>{a.serialNumber}</Sn></dd></div>
          <div><dt>מספר נכס</dt><dd><Tag tag={a.assetTag} /></dd></div>
          <div><dt>קטגוריה</dt><dd>{a.categoryName} / {a.subCategoryName}</dd></div>
        </dl>
        <p>{DECLARATION}</p>
        {a.signed ? (
          <div>
            <div className={`sig-img ${photo ? 'photo' : ''}`}><SignatureImage assetId={a.id} /></div>
            <div className="hint">{photo ? 'צילום של טופס חתום שהועלה למערכת' : `נחתם על המסך על ידי ${a.employeeName}`}</div>
          </div>
        ) : (
          <div><div className="label" style={{ marginBottom: 6 }}>חתימת העובד</div><SignaturePad key={padKey} padRef={padRef} onInk={setInked} /></div>
        )}
      </div>
      {d.history.length > 1 && (
        <div><div className="group-title">היסטוריית מסירות</div>
          <ul className="history">{d.history.map(h => (
            <li key={h.id}><b>{h.employee}</b><span className="muted">{fmtDate(h.deliveredAt)} – {h.returnedAt ? fmtDate(h.returnedAt) : 'היום'}</span>
              {h.signed ? <span className="sig ok"><Icon name="check" />חתום</span> : <span className="sig wait"><Icon name="clock" />לא נחתם</span>}</li>
          ))}</ul></div>
      )}
    </Modal>
  )
}

/** The signature on the open handover, as stored. */
function SignatureImage({ assetId }: { assetId: number }) {
  const src = useFileUrl(`/api/assets/${assetId}/signature`)
  return src ? <img src={src} alt="חתימת העובד" /> : null
}
