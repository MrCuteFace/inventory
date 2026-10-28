import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useLoad } from '../state'
import { ErrorBox, Loading } from '../ui/Bits'
import { Icon } from '../ui/Icon'
import { CompanyScope, useCompanies } from '../ui/Pickers'
import { useToast } from '../ui/Toast'

type Recipient = { id: number; email: string; name: string | null; onIntake: boolean; onDisposal: boolean; companyIds: number[] }
type LogRow = { id: number; at: string; kind: 'intake' | 'disposal' | 'test'; subject: string; recipients: string; outcome: 'accepted' | 'failed' | 'disabled'; error: string | null; durationMs: number | null }
type MailState = { enabled: boolean; onlyTo: string[] | null; recipients: Recipient[]; log: LogRow[] }

const KIND: Record<LogRow['kind'], string> = { intake: 'קליטת מלאי', disposal: 'גריעה', test: 'בדיקה' }
const OUTCOME: Record<LogRow['outcome'], [string, string]> = {
  accepted: ['נשלח', 'st-avail'], failed: ['השליחה נכשלה', 'st-scrapped'], disabled: ['לא נשלח', 'st-pending'],
}
const fmtAt = (s: string) => new Date(s).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function Mail() {
  const { data, error, retry, setData } = useLoad<MailState>('/api/mail')
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [onIntake, setOnIntake] = useState(true)
  const [onDisposal, setOnDisposal] = useState(true)
  const [companyIds, setCompanyIds] = useState<number[]>([])
  const companies = useCompanies()
  const [testTo, setTestTo] = useState('')
  const [testKind, setTestKind] = useState<'intake' | 'disposal'>('intake')
  const [testing, setTesting] = useState(false)
  const reload = () => api.get<MailState>('/api/mail').then(setData).catch(() => retry())

  const add = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/api/mail/recipients', { email, name, onIntake, onDisposal, companyIds })
      setEmail(''); setName(''); setOnIntake(true); setOnDisposal(true); setCompanyIds([]); reload()
    } catch (err) { toast((err as Error).message, 'bad') }
  }
  const update = async (r: Recipient, patch: Partial<Recipient>) => {
    try { await api.put(`/api/mail/recipients/${r.id}`, { ...r, ...patch }); reload() }
    catch (err) { toast((err as Error).message, 'bad') }
  }
  const remove = async (r: Recipient) => {
    if (!confirm(`להסיר את ${r.email} מרשימת הנמענים?`)) return
    try { await api.del(`/api/mail/recipients/${r.id}`); reload() }
    catch (err) { toast((err as Error).message, 'bad') }
  }
  const test = async (e: FormEvent) => {
    e.preventDefault()
    setTesting(true)
    try {
      const r = await api.post<LogRow>('/api/mail/test', { email: testTo, kind: testKind })
      if (r.outcome === 'accepted') toast(`מייל הבדיקה נשלח. בדקו שהגיע לתיבת הדואר של ${testTo}`)
      else toast(r.error ?? OUTCOME[r.outcome][0], 'bad')
      reload()
    } catch (err) { toast((err as Error).message, 'bad') } finally { setTesting(false) }
  }

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">מיילים</h1>
        <div className="muted">מי מקבל עדכון במייל על קליטת מלאי ועל גריעה. כל נמען יכול לקבל סוג אחד או את שניהם, של כל החברות או רק של חברות מסוימות.</div></div></div>
      {error && <ErrorBox error={error} onRetry={retry} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          {!data.enabled && <div className="warn" style={{ marginBottom: 16 }}><Icon name="alert" /><span>שליחת המיילים כבויה במערכת. אפשר לנהל נמענים, אבל מיילים לא יוצאים; כל ניסיון נרשם ביומן כ״לא נשלח״. להפעלה יש לפנות למי שאחראי על התקנת המערכת.</span></div>}
          {data.enabled && data.onlyTo && <div className="warn" style={{ marginBottom: 16 }}><Icon name="alert" /><span>מצב בדיקה: מיילים יוצאים רק אל {data.onlyTo.join(', ')}. שאר הנמענים מדולגים ונרשמים ביומן.</span></div>}

          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head"><h2 className="section-title">נמענים</h2></div>
            <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
              <form className="inline-form" onSubmit={add}>
                <div className="field"><label htmlFor="mr-email">כתובת מייל</label><input className="input" id="mr-email" dir="ltr" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="field"><label htmlFor="mr-name">שם (לא חובה)</label><input className="input" id="mr-name" value={name} onChange={e => setName(e.target.value)} /></div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', height: 40 }}><input type="checkbox" checked={onIntake} onChange={e => setOnIntake(e.target.checked)} /> קליטת מלאי</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', height: 40 }}><input type="checkbox" checked={onDisposal} onChange={e => setOnDisposal(e.target.checked)} /> גריעה</label>
                <button className="btn btn-primary" type="submit" disabled={!email.trim() || (!onIntake && !onDisposal)}><Icon name="plus" />הוספת נמען</button>
              </form>
              <div className="scope-row"><span className="muted">מיילים של:</span>
                <CompanyScope label="חברות לנמען החדש" value={companyIds} onChange={setCompanyIds} companies={companies} /></div>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>כתובת</th><th>שם</th><th>קליטת מלאי</th><th>גריעה</th><th>חברות</th><th /></tr></thead>
              <tbody>
                {data.recipients.length ? data.recipients.map(r => (
                  <tr key={r.id}>
                    <td><span className="sn" dir="ltr">{r.email}</span></td>
                    <td>{r.name ?? <span className="muted">—</span>}</td>
                    <td><input type="checkbox" aria-label={`מייל קליטה ל-${r.email}`} checked={r.onIntake} disabled={r.onIntake && !r.onDisposal} onChange={e => update(r, { onIntake: e.target.checked })} /></td>
                    <td><input type="checkbox" aria-label={`מייל גריעה ל-${r.email}`} checked={r.onDisposal} disabled={r.onDisposal && !r.onIntake} onChange={e => update(r, { onDisposal: e.target.checked })} /></td>
                    <td><CompanyScope label={`חברות של ${r.email}`} value={r.companyIds} onChange={ids => update(r, { companyIds: ids })} companies={companies} /></td>
                    <td><div className="row-actions"><button className="icon-btn danger" title="הסרה" aria-label={`הסרת ${r.email}`} onClick={() => remove(r)}><Icon name="trash" /></button></div></td>
                  </tr>
                )) : <tr><td colSpan={6}><div className="empty">אין עדיין נמענים. הוסיפו כתובת למעלה.</div></td></tr>}
              </tbody>
            </table></div>
          </section>

          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head"><h2 className="section-title">מייל בדיקה</h2><span className="hint">נשלח מיד, עם נתונים לדוגמה</span></div>
            <div style={{ padding: 16 }}>
              <form className="inline-form" onSubmit={test}>
                <div className="field"><label htmlFor="mt-to">אל</label><input className="input" id="mt-to" dir="ltr" type="email" value={testTo} onChange={e => setTestTo(e.target.value)} /></div>
                <div className="field"><label htmlFor="mt-kind">איזה נוסח</label>
                  <select className="input" id="mt-kind" value={testKind} onChange={e => setTestKind(e.target.value as 'intake' | 'disposal')}>
                    <option value="intake">קליטת מלאי</option><option value="disposal">גריעה</option>
                  </select></div>
                <button className="btn" type="submit" disabled={!testTo.trim() || testing}><Icon name="check" />{testing ? 'שולח…' : 'שליחת בדיקה'}</button>
              </form>
              <p className="hint" style={{ margin: '10px 0 0' }}>״נשלח״ אומר שהמייל יצא מהמערכת לשרת הדואר של החברה. המערכת לא מקבלת אישור שהמייל הגיע, ולכן אחרי בדיקה כדאי לוודא שהוא אכן בתיבת הדואר.</p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="section-title">יומן שליחה</h2><span className="hint">50 האחרונים</span></div>
            <div className="table-wrap"><table>
              <thead><tr><th>מתי</th><th>סוג</th><th>נושא</th><th>אל</th><th>תוצאה</th></tr></thead>
              <tbody>
                {data.log.length ? data.log.map(l => (
                  <tr key={l.id}>
                    <td className="num">{fmtAt(l.at)}</td>
                    <td>{KIND[l.kind] ?? l.kind}</td>
                    <td className="cell-main">{l.subject}</td>
                    <td><span className="cell-sub" dir="ltr">{l.recipients || '—'}</span></td>
                    <td><span className={`pill ${OUTCOME[l.outcome][1]}`}>{OUTCOME[l.outcome][0]}</span>
                      {l.error && <div className="cell-sub">{l.error}</div>}</td>
                  </tr>
                )) : <tr><td colSpan={5}><div className="empty">עוד לא נשלח אף מייל.</div></td></tr>}
              </tbody>
            </table></div>
          </section>
        </>
      )}
    </>
  )
}
