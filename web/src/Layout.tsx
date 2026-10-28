import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth, useData } from './state'
import { BrandLockup, SphereMark } from './ui/brand/Brand'
import { Icon } from './ui/Icon'

function toggleTheme() {
  const r = document.documentElement
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  r.dataset.theme = dark ? 'light' : 'dark'
  try { localStorage.setItem('inv-theme', r.dataset.theme) } catch { /* אין אחסון - לא נורא */ }
}

export function Layout({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth()
  const { catalog, open } = useData()
  const [navOpen, setNavOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setNavOpen(false), [loc.pathname])

  const link = ({ isActive }: { isActive: boolean }) => `rail-link${isActive ? ' active' : ''}`

  return (
    <div className="app" data-nav={navOpen ? 'open' : undefined}>
      <aside className="rail" aria-label="ניווט ראשי">
        <div className="brand">
          <BrandLockup size={40} />
          <div className="brand-name">מלאי ורכש קבוע</div>
          <div className="brand-sub">ציוד מחשוב ותקשורת</div>
        </div>
        <nav>
          <NavLink to="/" end className={link}><Icon name="home" />דף הבית</NavLink>
          <NavLink to="/disposals" className={link}><Icon name="report" />דו״ח גריעות חודשי</NavLink>
          <NavLink to="/employees" className={link}><Icon name="users" />עובדים</NavLink>
          {me?.isAdmin && <NavLink to="/invoices" className={link}><Icon name="receipt" />חשבוניות</NavLink>}
          {me?.isAdmin && <NavLink to="/users" className={link}><Icon name="key" />משתמשי מערכת</NavLink>}
          {me?.isAdmin && <NavLink to="/mail" className={link}><Icon name="mail" />מיילים</NavLink>}
        </nav>
        <div className="rail-sep" />
        <div className="tree-head">קטגוריות ציוד</div>
        <nav aria-label="קטגוריות">
          {catalog.map(c => (
            <div key={c.id}>
              <div className="tree-cat"><Icon name={c.icon} />{c.name}</div>
              {c.subCategories.map(s => (
                <NavLink key={s.id} to={`/c/${s.id}`} className={({ isActive }) => `rail-link tree-sub${isActive ? ' active' : ''}`}>
                  {s.name}<span className="count num">{s.activeCount}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="rail-foot">
          <button className="rail-link" onClick={() => open({ kind: 'addsub' })}><Icon name="plus" />הוספת תת קטגוריה</button>
          <button className="rail-link" onClick={() => open({ kind: 'addcat' })}><Icon name="plus" />הוספת קטגוריה</button>
          <button className="rail-link" onClick={toggleTheme}><Icon name="sun" />תצוגה בהירה/כהה</button>
          <div className="user-chip"><Icon name="user" /><b>{me?.fullName}</b></div>
          <button className="rail-link" onClick={logout}><Icon name="logout" />יציאה</button>
        </div>
      </aside>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <main className="main">
        <div className="topbar">
          <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label="פתיחת תפריט"><Icon name="menu" /></button>
          <SphereMark size={28} />
          <b>מלאי ורכש קבוע</b>
        </div>
        {children}
      </main>
    </div>
  )
}
