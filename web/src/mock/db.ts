/**
 * The static demo's database: the same tables as the real schema, held in memory and saved to
 * sessionStorage, so a reload keeps your changes and a new tab starts from the seed again.
 *
 * The seed follows the server's demo seeder: invented employees, purchases spread over three years,
 * and items in every status - in stock, signed for, awaiting a signature, in repair, written off.
 */

export type AssetStateValue = 'active' | 'repair' | 'scrapped'

export interface User { id: number; username: string; fullName: string; password: string; isAdmin: boolean; isActive: boolean; mustChangePassword: boolean; createdAt: string }
export interface Employee { id: number; employeeNumber: number | null; fullName: string; department: string | null; isActive: boolean }
export interface Category { id: number; name: string; icon: string; sortOrder: number }
export interface SubCategory { id: number; categoryId: number; name: string; prefix: string; nextNumber: number; defaultModel: string | null; defaultWarrantyMonths: number; sortOrder: number }
export interface Company { id: number; name: string; companyNumber: string; sortOrder: number }
export interface Purchase { id: number; subCategoryId: number; supplierName: string; invoiceNumber: string; purchaseDate: string; warrantyEnd: string; unitPrice: number; invoice: { fileName: string; sizeBytes: number; uploadedAt: string; fileId: string | null } | null }
export interface Asset { id: number; subCategoryId: number; purchaseId: number; companyId: number | null; assetTag: string; serialNumber: string; model: string; state: AssetStateValue; repairSince: string | null }
export interface Assignment { id: number; assetId: number; employeeId: number; deliveredAt: string; returnedAt: string | null; signatureKind: string | null; signatureFileId: string | null; signedAt: string | null }
export interface Disposal { id: number; assetId: number; reason: string; description: string | null; returnedToWarehouse: boolean; previousEmployeeId: number | null; photoFileId: string | null; approvedBy: number; disposedAt: string }
export interface AuditEntry { id: number; at: string; userId: number | null; action: string; assetId: number | null; subCategoryId: number | null; text: string }
export interface MailRecipient { id: number; email: string; name: string | null; onIntake: boolean; onDisposal: boolean; companyIds: number[] }
export interface MailLogEntry { id: number; at: string; kind: 'intake' | 'disposal' | 'test'; subject: string; recipients: string; outcome: 'accepted' | 'failed' | 'disabled'; error: string | null; durationMs: number | null }

export interface Db {
  users: User[]
  employees: Employee[]
  categories: Category[]
  subCategories: SubCategory[]
  companies: Company[]
  purchases: Purchase[]
  assets: Asset[]
  assignments: Assignment[]
  disposals: Disposal[]
  audit: AuditEntry[]
  mailRecipients: MailRecipient[]
  mailLog: MailLogEntry[]
  /** Uploaded and generated files (signatures, photos, invoice PDFs) as data URLs. */
  files: Record<string, string>
  /** The signed-in user, or null. */
  session: number | null
  seq: number
}

export const DISPOSAL_REASONS = [
  'תקלה טכנית / בלאי טבעי',
  'נזק פיזי / שבירה',
  'אובדן / גניבה',
  'ציוד מיושן טכנולוגית (Obsolete)',
]

/* ------------------------------------------------------------------ dates */

const pad = (n: number) => String(n).padStart(2, '0')
/** DateOnly, as the API serializes it. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** DateTime in local time with no offset, as the API serializes it. */
export const stamp = (d: Date) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }
export const parseDay = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
export const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()) }

/* ------------------------------------------------------------------- seed */

function seeded(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { double: next, int: (min: number, max: number) => min + Math.floor(next() * (max - min)) }
}

/** A drawn-looking signature: one wavy stroke on a transparent canvas. */
function squiggle(rng: ReturnType<typeof seeded>): string {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 120
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.strokeStyle = '#1e1e1e'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  let y = 70
  let vy = 0
  for (let x = 20; x < 340; x++) {
    vy += (rng.double() - 0.5) * 1.6 - (y - 65) * 0.02
    vy = Math.max(-4, Math.min(4, vy))
    y = Math.max(20, Math.min(100, y + vy))
    if (x === 20) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  return canvas.toDataURL('image/png')
}

export function seed(): Db {
  const rng = seeded(51853)
  const now = new Date()
  const t = today()
  let seq = 0
  const id = () => ++seq

  const db: Db = {
    users: [], employees: [], categories: [], subCategories: [], companies: [], purchases: [], assets: [],
    assignments: [], disposals: [], audit: [], mailRecipients: [], mailLog: [], files: {}, session: null, seq: 0,
  }

  db.users.push(
    { id: id(), username: 'dana', fullName: 'דנה לוי', password: 'Demo1234', isAdmin: true, isActive: true, mustChangePassword: false, createdAt: stamp(addDays(now, -400)) },
    { id: id(), username: 'eli', fullName: 'אלי מור', password: 'Demo1234', isAdmin: false, isActive: true, mustChangePassword: false, createdAt: stamp(addDays(now, -200)) },
    { id: id(), username: 'yael', fullName: 'יעל שגיא', password: 'Demo1234', isAdmin: false, isActive: true, mustChangePassword: false, createdAt: stamp(addDays(now, -90)) },
  )
  const me = db.users[0]

  // Invented group companies; the numbers are not registered to anyone.
  db.companies.push(
    { id: id(), name: 'מסוף הדגמה בע"מ', companyNumber: '510000001', sortOrder: 1 },
    { id: id(), name: 'הובלות הדגמה בע"מ', companyNumber: '510000002', sortOrder: 2 },
    { id: id(), name: 'מכולות הדגמה בע"מ', companyNumber: '510000003', sortOrder: 3 },
  )

  const cats: [string, string][] = [['מחשבים', 'pc'], ['מדפסות', 'printer'], ['טאבלטים', 'tablet'], ['קשרים', 'radio'], ['מסכים', 'monitor'], ['טלפונים', 'phone']]
  cats.forEach(([name, icon], i) => db.categories.push({ id: id(), name, icon, sortOrder: i + 1 }))
  const catId = (name: string) => db.categories.find((c) => c.name === name)!.id

  const subs: [string, string, string, number, number][] = [
    ['מחשבים', 'מחשבים נייחים', 'PC', 36, 1],
    ['מחשבים', 'מחשבים ניידים', 'LPT', 36, 2],
    ['מדפסות', 'מדפסות מדבקות', 'LBL', 12, 1],
    ['מדפסות', 'מדפסות משרד', 'PRN', 12, 2],
    ['טאבלטים', 'טאבלטים', 'TAB', 24, 1],
    ['קשרים', 'מכשירי קשר', 'COMMS', 24, 1],
    ['קשרים', 'מעמדים לקשר', 'STND', 12, 2],
    ['מסכים', 'מסכי טלוויזיה', 'TV', 24, 1],
    ['מסכים', 'מסכים למחשב', 'MON', 36, 2],
    ['טלפונים', 'טלפונים ניידים', 'MOB', 24, 1],
    ['טלפונים', 'טלפונים משרדיים', 'TEL', 24, 2],
  ]
  for (const [cat, name, prefix, months, sort] of subs) {
    db.subCategories.push({ id: id(), categoryId: catId(cat), name, prefix, nextNumber: 100, defaultModel: null, defaultWarrantyMonths: months, sortOrder: sort })
  }

  const people: [string, string][] = [
    ['יוסי כהן', 'מסוף 2'], ['מיכל אברהם', 'הנהלת חשבונות'], ['אבי מזרחי', 'תפעול נמל'], ['נועה פרץ', 'שירות לקוחות'],
    ['רונן ביטון', 'מחסן ראשי'], ['שירה דהן', 'משאבי אנוש'], ['עומר פרידמן', 'תפעול נמל'], ['ליאת גבאי', 'רכש'],
    ['איתי שמעוני', 'מסוף 1'], ['הדס קליין', 'מכס ושילוח'], ['משה אוחיון', 'אבטחה'], ['תמר רוזן', 'הנהלה'],
    ['גיל ששון', 'מסוף 2'], ['רותם בן דוד', 'IT'], ['סהר אלמוג', 'מכס ושילוח'], ['קובי נחום', 'אבטחה'],
    ['חדר ישיבות', 'מקום'], ['מחלקת תפעול', 'מחלקה'],
  ]
  people.forEach(([fullName, department], i) =>
    db.employees.push({ id: id(), employeeNumber: i < 16 ? 1001 + i : null, fullName, department, isActive: true }))
  const persons = db.employees.slice(0, 16)
  const places = db.employees.slice(16)

  const defs: Record<string, [string, number, string, number]> = {
    PC: ['Dell OptiPlex 7020', 3450, 'מחשבי הנמל בע"מ', 14],
    LPT: ['Lenovo ThinkPad T14 Gen 5', 5200, 'מחשבי הנמל בע"מ', 18],
    LBL: ['Zebra ZD421', 1890, 'פרינט-ליין', 9],
    PRN: ['HP LaserJet Pro 4002dn', 1240, 'פרינט-ליין', 5],
    TAB: ['Samsung Galaxy Tab Active5', 2650, 'מובייל-פרו', 11],
    COMMS: ['מכשיר קשר דגם ABCD', 1480, 'טל-קום ציוד קשר', 15],
    STND: ['מעמד טעינה כפול ABCD', 320, 'טל-קום ציוד קשר', 6],
    TV: ['Samsung 55" Crystal UHD', 2290, 'אור מסכים', 4],
    MON: ['Dell P2425H 24"', 780, 'מחשבי הנמל בע"מ', 22],
    MOB: ['Samsung Galaxy A56', 1690, 'מובייל-פרו', 16],
    TEL: ['Yealink T54W', 640, 'טל-קום ציוד קשר', 12],
  }

  const serial = (prefix: string) => {
    const al = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
    return `${prefix}-${Array.from({ length: 9 }, () => al[rng.int(0, al.length)]).join('')}`
  }
  const descriptions = ['נשבר המסך במהלך פריקה במסוף', 'לא נדלק לאחר נפילה במים', 'סוללה מתנפחת, הוצא משימוש', 'לא נמצא בספירת מלאי רבעונית', 'דגם ישן, אין עדכוני אבטחה']

  db.files.sig = squiggle(rng)

  for (const sub of db.subCategories) {
    const d = defs[sub.prefix]
    if (!d) continue
    const [model, price, supplier, n] = d
    sub.defaultModel = model
    let made = 0
    while (made < n) {
      const batch = Math.min(n - made, 2 + rng.int(0, 5))
      const pDate = addDays(t, -(40 + rng.int(0, 1000)))
      let warrantyEnd = addMonths(pDate, sub.defaultWarrantyMonths)
      // A few warranties ending soon, so the home page's work queue is not empty.
      if (rng.double() < 0.12) warrantyEnd = addDays(t, 10 + rng.int(0, 80))
      const invoiceNumber = `חש-${pad(pDate.getFullYear() % 100)}-${String(rng.int(100, 999)).padStart(4, '0')}`
      const purchase: Purchase = {
        id: id(), subCategoryId: sub.id, supplierName: supplier, invoiceNumber,
        purchaseDate: dayKey(pDate), warrantyEnd: dayKey(warrantyEnd),
        unitPrice: price - (rng.double() < 0.4 ? Math.round(price * 0.06) : 0),
        // Older purchases predate required invoice files; most have one.
        invoice: rng.double() < 0.85
          ? { fileName: `invoice-${invoiceNumber.replace(/[^\d-]/g, '')}.pdf`, sizeBytes: 90_000 + rng.int(0, 400_000), uploadedAt: stamp(pDate), fileId: null }
          : null,
      }
      db.purchases.push(purchase)
      const companyId = db.companies[rng.double() < 0.6 ? 0 : 1 + rng.int(0, db.companies.length - 1)].id

      for (let b = 0; b < batch; b++, made++) {
        const a: Asset = {
          id: id(), subCategoryId: sub.id, purchaseId: purchase.id, companyId, model,
          assetTag: `${sub.prefix}-${sub.nextNumber++}`,
          serialNumber: sub.prefix === 'COMMS' ? `642VCN${1058 + made}` : serial(sub.prefix),
          state: 'active', repairSince: null,
        }
        db.assets.push(a)

        const roll = rng.double()
        const shared = sub.prefix === 'TV' || (sub.prefix === 'TEL' && rng.double() < 0.5)
        const holder = () => (shared ? places[rng.int(0, places.length)] : persons[rng.int(0, persons.length)])
        if (roll < 0.22) {
          /* in stock */
        } else if (roll < 0.72) {
          const signedAt = addDays(pDate, 4 + rng.int(0, 30))
          signedAt.setHours(10, 0, 0)
          db.assignments.push({
            id: id(), assetId: a.id, employeeId: holder().id, deliveredAt: dayKey(addDays(pDate, 3 + rng.int(0, 30))), returnedAt: null,
            signatureKind: 'drawn', signatureFileId: 'sig', signedAt: stamp(signedAt),
          })
        } else if (roll < 0.8) {
          db.assignments.push({
            id: id(), assetId: a.id, employeeId: holder().id, deliveredAt: dayKey(addDays(t, -(1 + rng.int(0, 9)))), returnedAt: null,
            signatureKind: null, signatureFileId: null, signedAt: null,
          })
        } else if (roll < 0.88) {
          a.state = 'repair'
          a.repairSince = dayKey(addDays(t, -(2 + rng.int(0, 40))))
        } else {
          a.state = 'scrapped'
          const thisMonth = rng.double() < 0.6
          const at = thisMonth ? addDays(now, -rng.int(0, Math.max(1, t.getDate()))) : addDays(now, -(30 + rng.int(0, 120)))
          db.disposals.push({
            id: id(), assetId: a.id, reason: DISPOSAL_REASONS[rng.int(0, DISPOSAL_REASONS.length)],
            description: descriptions[rng.int(0, descriptions.length)], returnedToWarehouse: rng.double() < 0.75,
            previousEmployeeId: null, photoFileId: null, approvedBy: me.id, disposedAt: stamp(at),
          })
        }
      }
    }
  }

  // A short history, newest last, so the home page's activity feed reads like a real week.
  const log = (daysAgo: number, hour: number, action: string, text: string, assetId: number | null = null, subCategoryId: number | null = null, userId = me.id) => {
    const at = addDays(now, -daysAgo)
    at.setHours(hour, rng.int(0, 60), 0)
    db.audit.push({ id: id(), at: stamp(at), userId, action, assetId, subCategoryId, text })
  }
  const pending = db.assignments.filter((x) => !x.signedAt)
  const repair = db.assets.filter((x) => x.state === 'repair')
  const scrapped = db.disposals.slice().sort((a, b) => a.disposedAt.localeCompare(b.disposedAt))
  const tagOf = (assetId: number) => db.assets.find((x) => x.id === assetId)!.assetTag
  const nameOf = (employeeId: number) => db.employees.find((x) => x.id === employeeId)!.fullName
  log(9, 9, 'intake', 'נטענו נתוני הדגמה')
  repair.slice(0, 3).forEach((a, i) => log(8 - i, 11, 'repair', `${a.assetTag} הועבר לתיקון`, a.id, a.subCategoryId))
  scrapped.slice(-3).forEach((d, i) => log(5 - i, 13, 'dispose', `${tagOf(d.assetId)} נגרע: ${d.reason}`, d.assetId, null, db.users[1].id))
  pending.slice(0, 6).forEach((x, i) => log(2 - Math.floor(i / 3), 10 + i, 'assign', `${tagOf(x.assetId)} שויך ל${nameOf(x.employeeId)}, ממתין לחתימה`, x.assetId))
  db.audit.sort((a, b) => a.at.localeCompare(b.at))

  db.mailRecipients.push(
    { id: id(), email: 'accounting@example.com', name: 'הנהלת חשבונות', onIntake: true, onDisposal: true, companyIds: [] },
    { id: id(), email: 'it@example.com', name: 'מחלקת IT', onIntake: true, onDisposal: false, companyIds: [db.companies[0].id] },
  )

  db.seq = seq
  return db
}

/* ------------------------------------------------------------ persistence */

const KEY = 'inventory-demo-db'

export function load(): Db {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch { /* storage unavailable: start from the seed */ }
  return seed()
}

export function save(db: Db) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    // Over quota (large uploads): keep working in memory, without the files that do not fit.
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...db, files: { sig: db.files.sig } }))
    } catch { /* storage unavailable */ }
  }
}
