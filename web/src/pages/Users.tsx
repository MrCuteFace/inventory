import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { fmtDate } from '../format'
import { useAuth, useLoad } from '../state'
import { ErrorBox, Loading } from '../ui/Bits'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'

type U = { id: number; username: string; fullName: string; isAdmin: boolean; isActive: boolean; mustChangePassword: boolean; locked: boolean; createdAt: string }

export function Users() {
  const { me } = useAuth()
  const { data, error, retry, setData } = useLoad<U[]>('/api/users')
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [temp, setTemp] = useState<{ who: string; pass: string } | null>(null)
  const reload = () => api.get<U[]>('/api/users').then(setData).catch(() => retry())

  const add = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const r = await api.post<{ temporaryPassword: string }>('/api/users', { username, fullName, isAdmin })
      setTemp({ who: `${fullName} (${username.trim().toLowerCase()})`, pass: r.temporaryPassword })
      setUsername(''); setFullName(''); setIsAdmin(false); reload()
    } catch (err) { toast((err as Error).message, 'bad') }
  }
  const update = async (u: U, patch: Partial<U>) => {
    try { await api.put(`/api/users/${u.id}`, { fullName: u.fullName, isAdmin: u.isAdmin, isActive: u.isActive, ...patch }); reload() }
    catch (err) { toast((err as Error).message, 'bad') }
  }
  const reset = async (u: U) => {
    try { const r = await api.post<{ temporaryPassword: string }>(`/api/users/${u.id}/reset-password`); setTemp({ who: u.fullName, pass: r.temporaryPassword }); reload() }
    catch (err) { toast((err as Error).message, 'bad') }
  }

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">משתמשי מערכת</h1><div className="muted">מי יכול להיכנס למערכת. מנהלים רואים גם את הדף הזה.</div></div></div>
      <section className="panel" style={{ padding: 16, marginBottom: 20 }}>
        <form className="inline-form" onSubmit={add}>
          <div className="field"><label htmlFor="nu-user">שם משתמש (באנגלית)</label><input className="input" id="nu-user" dir="ltr" value={username} onChange={e => setUsername(e.target.value)} /></div>
          <div className="field"><label htmlFor="nu-name">שם מלא</label><input className="input" id="nu-name" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', height: 40 }}><input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> מנהל</label>
          <button className="btn btn-primary" type="submit" disabled={!username.trim() || !fullName.trim()}><Icon name="plus" />הוספת משתמש</button>
        </form>
      </section>
      {error && <ErrorBox error={error} onRetry={retry} />}
      {!data && !error && <Loading />}
      {data && (
        <section className="panel"><div className="table-wrap"><table>
          <thead><tr><th>שם</th><th>שם משתמש</th><th>הרשאה</th><th>מצב</th><th>נוצר</th><th /></tr></thead>
          <tbody>
            {data.map(u => (
              <tr key={u.id} className={u.isActive ? '' : 'is-scrapped'}>
                <td className="cell-main">{u.fullName}</td>
                <td><span className="sn">{u.username}</span></td>
                <td>
                  <select className="input" style={{ height: 32, width: 'auto' }} aria-label={`הרשאה של ${u.fullName}`} value={u.isAdmin ? 'admin' : 'user'}
                    disabled={u.id === me?.id} onChange={e => update(u, { isAdmin: e.target.value === 'admin' })}>
                    <option value="user">משתמש</option><option value="admin">מנהל</option>
                  </select>
                </td>
                <td>{!u.isActive ? 'מושבת' : u.locked ? <span className="pill st-scrapped">נעול</span> : u.mustChangePassword ? <span className="pill st-pending">טרם בחר סיסמה</span> : <span className="pill st-avail">פעיל</span>}</td>
                <td className="num">{fmtDate(u.createdAt)}</td>
                <td><div className="row-actions">
                  <button className="btn btn-sm" onClick={() => reset(u)}><Icon name="key" />איפוס סיסמה</button>
                  {u.id !== me?.id && <button className="btn btn-sm btn-ghost" onClick={() => update(u, { isActive: !u.isActive })}>{u.isActive ? 'השבתה' : 'הפעלה'}</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div></section>
      )}
      {temp && (
        <Modal title="סיסמה זמנית" narrow onClose={() => setTemp(null)} footer={<div className="actions"><button className="btn btn-primary" onClick={() => setTemp(null)}>סגירה</button></div>}>
          <p style={{ margin: 0 }}>הסיסמה הזמנית של <b>{temp.who}</b>. מסרו אותה למשתמש; בכניסה הראשונה הוא יתבקש לבחור סיסמה משלו. היא לא תוצג שוב.</p>
          <div className="temp-pass">{temp.pass}</div>
        </Modal>
      )}
    </>
  )
}
