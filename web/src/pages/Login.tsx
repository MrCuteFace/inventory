import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../state'
import type { Me } from '../types'
import { BrandLockup } from '../ui/brand/Brand'

const DEMO_USERS = [
  { username: 'dana', name: 'דנה לוי', role: 'מנהלת: כל המסכים, כולל חשבוניות, משתמשים ומיילים' },
  { username: 'eli', name: 'אלי מור', role: 'משתמש: קליטה, מסירה, גריעה ודו״חות' },
]

export function Login() {
  const { setMe } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { setMe(await api.post<Me>('/api/auth/login', { username, password })) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  // Demo only: signs in as one of the seeded users without typing (password Demo1234).
  const quick = async (name: string) => {
    setBusy(true); setError('')
    try { setMe(await api.post<Me>('/api/auth/login', { username: name, password: 'Demo1234' })) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo-bg"><BrandLockup size={48} /></div>
        <h1>מלאי ורכש קבוע</h1>
        <div className="field"><label htmlFor="lg-user">שם משתמש</label>
          <input className="input" id="lg-user" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} autoFocus dir="ltr" /></div>
        <div className="field"><label htmlFor="lg-pass">סיסמה</label>
          <input className="input" id="lg-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} dir="ltr" /></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || !username || !password}>{busy ? 'מתחבר…' : 'כניסה'}</button>
        {import.meta.env.VITE_DEMO && (
          <div className="demo-login">
            <div className="hint">גרסת הדגמה עם נתונים מומצאים. היכנסו בלחיצה:</div>
            {DEMO_USERS.map(u => (
              <button key={u.username} className="btn" type="button" disabled={busy} onClick={() => quick(u.username)}>
                <b>{u.name}</b><span>{u.role}</span>
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  )
}

export function ChangePassword({ forced, onDone }: { forced?: boolean; onDone?: () => void }) {
  const { setMe, logout } = useAuth()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next !== again) { setError('הסיסמאות החדשות אינן זהות.'); return }
    setBusy(true); setError('')
    try { setMe(await api.post<Me>('/api/auth/change-password', { currentPassword: cur, newPassword: next })); onDone?.() }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>{forced ? 'בחירת סיסמה חדשה' : 'החלפת סיסמה'}</h1>
        {forced && <p className="hint" style={{ margin: 0, textAlign: 'center' }}>זו כניסה ראשונה או שהסיסמה אופסה. בחרו סיסמה אישית כדי להמשיך.</p>}
        <div className="field"><label htmlFor="cp-cur">{forced ? 'הסיסמה הזמנית' : 'סיסמה נוכחית'}</label>
          <input className="input" id="cp-cur" type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} dir="ltr" /></div>
        <div className="field"><label htmlFor="cp-new">סיסמה חדשה</label>
          <input className="input" id="cp-new" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} dir="ltr" />
          <span className="hint">8 תווים לפחות, עם אות וספרה</span></div>
        <div className="field"><label htmlFor="cp-again">אימות סיסמה חדשה</label>
          <input className="input" id="cp-again" type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} dir="ltr" /></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || !cur || !next}>שמירה</button>
        {forced && <button className="btn btn-ghost" type="button" onClick={logout}>יציאה</button>}
      </form>
    </div>
  )
}
