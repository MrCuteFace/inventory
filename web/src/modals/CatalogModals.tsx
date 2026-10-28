import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useData } from '../state'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'

const ICONS: [string, string][] = [['box', 'ארגז כללי'], ['pc', 'מחשב'], ['printer', 'מדפסת'], ['tablet', 'טאבלט'], ['radio', 'מכשיר קשר'], ['monitor', 'מסך'], ['phone', 'טלפון']]

export function AddCategoryModal({ onClose }: { onClose: () => void }) {
  const { reloadCatalog, open } = useData()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('box')
  const [error, setError] = useState('')
  const save = async () => {
    if (!name.trim()) { setError('תנו שם לקטגוריה'); return }
    try {
      const r = await api.post<{ id: number }>('/api/categories', { name, icon })
      await reloadCatalog()
      open({ kind: 'addsub', categoryId: r.id }) // קטגוריה בלי תת-קטגוריה לא שימושית, אז ממשיכים ישר להוספה
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <Modal title="הוספת קטגוריה" narrow onClose={onClose}
      footer={<><div className="form-error" role="alert">{error}</div><div className="actions"><button className="btn" onClick={onClose}>ביטול</button><button className="btn btn-primary" onClick={save}>יצירת קטגוריה</button></div></>}>
      <div className="field"><label htmlFor="nc-name">שם הקטגוריה <span className="req">*</span></label>
        <input className="input" id="nc-name" placeholder="לדוגמה: רשתות ותקשורת" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="nc-icon">סמל</label>
        <select className="input" id="nc-icon" value={icon} onChange={e => setIcon(e.target.value)}>{ICONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <p className="hint" style={{ margin: 0 }}>אחרי השמירה תתבקשו להוסיף את תת־הקטגוריה הראשונה.</p>
    </Modal>
  )
}

export function AddSubCategoryModal({ categoryId, onClose }: { categoryId?: number; onClose: () => void }) {
  const { catalog, changed } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [cat, setCat] = useState(categoryId ?? catalog[0]?.id ?? 0)
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [model, setModel] = useState('')
  const [months, setMonths] = useState(24)
  const [start, setStart] = useState(100)
  const [error, setError] = useState('')
  const save = async () => {
    if (!name.trim() || prefix.length < 2) { setError('נדרשים שם וקידומת של 2 אותיות לפחות'); return }
    try {
      const r = await api.post<{ id: number }>('/api/subcategories', { categoryId: cat, name, prefix, defaultModel: model, defaultWarrantyMonths: months, startNumber: start })
      changed(); toast(`תת הקטגוריה ״${name.trim()}״ נוצרה`); onClose(); nav(`/c/${r.id}`)
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <Modal title="הוספת תת קטגוריה" narrow onClose={onClose}
      footer={<><div className="form-error" role="alert">{error}</div><div className="actions"><button className="btn" onClick={onClose}>ביטול</button><button className="btn btn-primary" onClick={save}>יצירה ומעבר לדף</button></div></>}>
      <div className="grid-2">
        <div className="field span-2"><label htmlFor="ns-cat">קטגוריית על</label>
          <select className="input" id="ns-cat" value={cat} onChange={e => setCat(Number(e.target.value))}>
            {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="ns-name">שם תת הקטגוריה <span className="req">*</span></label>
          <input className="input" id="ns-name" placeholder="לדוגמה: נתבים" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="ns-prefix">קידומת למספר הנכס <span className="req">*</span></label>
          <input className="input mono" id="ns-prefix" placeholder="NET" maxLength={8} value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
          <span className="hint">הפריט הראשון יקבל <span className="sn">{(prefix || 'NET')}-{start}</span></span></div>
        <div className="field"><label htmlFor="ns-model">דגם ברירת מחדל</label><input className="input" id="ns-model" value={model} onChange={e => setModel(e.target.value)} /></div>
        <div className="field"><label htmlFor="ns-wm">אחריות ברירת מחדל</label>
          <select className="input" id="ns-wm" value={months} onChange={e => setMonths(Number(e.target.value))}>{[0, 12, 24, 36, 48, 60].map(x => <option key={x} value={x}>{x ? `${x} חודשים` : 'ללא'}</option>)}</select></div>
        <div className="field"><label htmlFor="ns-start">מספר ראשון</label>
          <input className="input num" id="ns-start" type="number" min={1} value={start} onChange={e => setStart(Math.max(1, Number(e.target.value) || 1))} />
          <span className="hint">אם כבר יש מדבקות מודפסות, התחילו מהמספר הבא</span></div>
      </div>
    </Modal>
  )
}
