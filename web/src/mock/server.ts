/**
 * The static demo's back end: the API's routes, answered in the browser by standing in for `fetch`.
 *
 * Each handler follows its controller in the real API: the same validation, the same Hebrew
 * error messages, the same derived statuses and the same audit-log lines. Files (signatures, damage
 * photos, invoice PDFs) are kept as data URLs; Excel and PDF reports are generated in the browser.
 */
import {
  DISPOSAL_REASONS, addDays, dayKey, load, save, stamp, today,
  type Asset, type Db, type Employee, type MailRecipient,
} from './db'

type Json = Record<string, unknown>
type Req = { method: string; path: string; query: URLSearchParams; body: Json; form: FormData | null }
type Handler = (req: Req, params: string[]) => Response | Promise<Response>

const db: Db = load()

/* ---------------------------------------------------------------- helpers */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const noContent = () => new Response(null, { status: 204 })
const bad = (error: string) => json({ error }, 400)
const notFound = (error = 'לא נמצא.') => json({ error }, 404)
const conflict = (error: string) => json({ error }, 409)

const nextId = () => ++db.seq
const nowStamp = () => stamp(new Date())
const todayKey = () => dayKey(today())
const me = () => db.users.find((u) => u.id === db.session) ?? null

function log(action: string, text: string, assetId: number | null = null, subCategoryId: number | null = null) {
  db.audit.push({ id: nextId(), at: nowStamp(), userId: db.session, action, assetId, subCategoryId, text })
}

const openAssignment = (assetId: number) => db.assignments.find((x) => x.assetId === assetId && x.returnedAt === null)
const employee = (id: number) => db.employees.find((e) => e.id === id)!

function deriveStatus(a: Asset) {
  if (a.state === 'scrapped') return 'scrapped'
  if (a.state === 'repair') return 'repair'
  const open = openAssignment(a.id)
  if (!open) return 'available'
  return open.signedAt ? 'in_use' : 'pending'
}

/** AssetQueries.RowsAsync: one row per item, with its derived status. */
function row(a: Asset) {
  const sub = db.subCategories.find((s) => s.id === a.subCategoryId)!
  const cat = db.categories.find((c) => c.id === sub.categoryId)!
  const p = db.purchases.find((x) => x.id === a.purchaseId)!
  const company = db.companies.find((c) => c.id === a.companyId) ?? null
  const open = openAssignment(a.id)
  const disposal = db.disposals.find((d) => d.assetId === a.id) ?? null
  return {
    id: a.id, subCategoryId: a.subCategoryId, subCategoryName: sub.name, categoryName: cat.name,
    assetTag: a.assetTag, serialNumber: a.serialNumber, model: a.model,
    companyId: a.companyId, companyName: company?.name ?? null,
    status: deriveStatus(a), repairSince: a.repairSince,
    purchaseDate: p.purchaseDate, warrantyEnd: p.warrantyEnd, invoiceNumber: p.invoiceNumber, supplierName: p.supplierName,
    price: p.unitPrice,
    employeeId: open?.employeeId ?? null, employeeName: open ? employee(open.employeeId).fullName : null,
    deliveredAt: open?.deliveredAt ?? null, signed: !!open?.signedAt, signatureKind: open?.signatureKind ?? null,
    disposalReason: disposal?.reason ?? null, disposedAt: disposal?.disposedAt ?? null,
  }
}
type Row = ReturnType<typeof row>

/** "Active" is everything not written off; value sums the purchase prices of those items. */
function counts(rows: Row[]) {
  const c = { available: 0, inUse: 0, pending: 0, repair: 0, scrapped: 0, active: 0, value: 0 }
  for (const r of rows) {
    if (r.status === 'available') c.available++
    else if (r.status === 'in_use') c.inUse++
    else if (r.status === 'pending') c.pending++
    else if (r.status === 'repair') c.repair++
    else c.scrapped++
    if (r.status !== 'scrapped') c.value += r.price
  }
  c.active = c.available + c.inUse + c.pending + c.repair
  return c
}

const byOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'he')
const subsOf = (categoryId: number) => db.subCategories.filter((s) => s.categoryId === categoryId).sort(byOrder)
const cmp = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '')
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const formStr = (f: FormData | null, k: string) => { const v = f?.get(k); return typeof v === 'string' ? v : null }

async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

const IMAGE_MAX = 5 * 1024 * 1024
const PDF_MAX = 10 * 1024 * 1024

async function readImage(file: FormDataEntryValue | null): Promise<[string | null, string | null]> {
  if (!(file instanceof Blob) || file.size === 0) return [null, 'לא צורפה תמונה.']
  if (file.size > IMAGE_MAX) return [null, 'התמונה גדולה מדי (עד 5MB).']
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return [null, 'סוג הקובץ אינו נתמך. צרפו PNG או JPEG.']
  return [await fileToDataUrl(file), null]
}

async function readPdf(file: FormDataEntryValue | null): Promise<[{ name: string; size: number; data: string } | null, string | null]> {
  if (!(file instanceof File) || file.size === 0) return [null, 'צרפו את קובץ החשבונית (PDF).']
  if (file.size > PDF_MAX) return [null, 'קובץ החשבונית גדול מדי (עד 10MB).']
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (String.fromCharCode(...head) !== '%PDF-') return [null, 'הקובץ אינו PDF תקין.']
  return [{ name: file.name, size: file.size, data: await fileToDataUrl(file) }, null]
}

function resolveEmployee(id: number | null, newName: string | null, newDept: string | null): [Employee | null, string | null] {
  if (id !== null) {
    const e = db.employees.find((x) => x.id === id)
    return !e || !e.isActive ? [null, 'העובד לא נמצא או אינו פעיל.'] : [e, null]
  }
  const name = (newName ?? '').trim()
  if (!name) return [null, 'בחרו עובד מהרשימה או הוסיפו עובד חדש.']
  if (name.length > 100) return [null, 'שם העובד ארוך מדי.']
  const existing = db.employees.find((x) => x.fullName === name)
  if (existing) { existing.isActive = true; return [existing, null] }
  const created: Employee = { id: nextId(), employeeNumber: null, fullName: name, department: newDept?.trim() || null, isActive: true }
  db.employees.push(created)
  log('employee', `נוסף עובד ${name}`)
  return [created, null]
}

/** Mail is switched off in the demo, as on a fresh install: every attempt is logged as not sent. */
function queueMail(kind: 'intake' | 'disposal', companyId: number | null, subject: string) {
  const to = db.mailRecipients
    .filter((r) => (kind === 'intake' ? r.onIntake : r.onDisposal) && (r.companyIds.length === 0 || (companyId !== null && r.companyIds.includes(companyId))))
    .map((r) => r.email)
  if (to.length === 0) return
  db.mailLog.push({ id: nextId(), at: nowStamp(), kind, subject, recipients: to.join(', '), outcome: 'disabled', error: null, durationMs: null })
}

/* ----------------------------------------------------------------- routes */

const routes: [string, RegExp, Handler, { anon?: boolean; admin?: boolean }?][] = []
const route = (method: string, pattern: string, handler: Handler, opts?: { anon?: boolean; admin?: boolean }) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '(\\d+)')}$`), handler, opts])

/* auth */

route('POST', '/api/auth/login', (req) => {
  const username = str(req.body.username).trim().toLowerCase()
  const user = db.users.find((u) => u.username === username)
  if (!user || !user.isActive || user.password !== str(req.body.password)) return json({ error: 'שם משתמש או סיסמה שגויים.' }, 401)
  db.session = user.id
  return json(meOf(user.id))
}, { anon: true })

route('POST', '/api/auth/logout', () => { db.session = null; return noContent() }, { anon: true })
route('GET', '/api/auth/me', () => json(meOf(db.session!)))

route('POST', '/api/auth/change-password', (req) => {
  const user = me()!
  if (str(req.body.currentPassword) !== user.password) return bad('הסיסמה הנוכחית שגויה.')
  const pw = str(req.body.newPassword)
  if (pw.length < 8) return bad('הסיסמה צריכה להיות באורך 8 תווים לפחות.')
  if (!/\d/.test(pw) || !/\p{L}/u.test(pw)) return bad('הסיסמה צריכה לכלול לפחות אות אחת וספרה אחת.')
  user.password = pw
  user.mustChangePassword = false
  log('user', `${user.fullName} החליף/ה סיסמה`)
  return json(meOf(user.id))
})

function meOf(id: number) {
  const u = db.users.find((x) => x.id === id)!
  return { id: u.id, username: u.username, fullName: u.fullName, isAdmin: u.isAdmin, mustChangePassword: u.mustChangePassword }
}

/* catalog */

route('GET', '/api/catalog', () => {
  const active = new Map<number, number>()
  for (const a of db.assets) if (a.state !== 'scrapped') active.set(a.subCategoryId, (active.get(a.subCategoryId) ?? 0) + 1)
  return json(db.categories.slice().sort(byOrder).map((c) => ({
    id: c.id, name: c.name, icon: c.icon,
    subCategories: subsOf(c.id).map((s) => ({
      id: s.id, name: s.name, prefix: s.prefix, defaultModel: s.defaultModel, defaultWarrantyMonths: s.defaultWarrantyMonths,
      nextTag: `${s.prefix}-${s.nextNumber}`, activeCount: active.get(s.id) ?? 0,
    })),
  })))
})

const ICONS = ['box', 'pc', 'printer', 'tablet', 'radio', 'monitor', 'phone']

route('POST', '/api/categories', (req) => {
  const name = str(req.body.name).trim()
  if (!name || name.length > 60) return bad('שם קטגוריה: 1 עד 60 תווים.')
  if (db.categories.some((c) => c.name === name)) return conflict(`הקטגוריה "${name}" כבר קיימת.`)
  const icon = ICONS.includes(str(req.body.icon)) ? str(req.body.icon) : 'box'
  const c = { id: nextId(), name, icon, sortOrder: Math.max(0, ...db.categories.map((x) => x.sortOrder)) + 1 }
  db.categories.push(c)
  log('category', `נוספה קטגוריה "${name}"`)
  return json({ id: c.id })
})

route('POST', '/api/subcategories', (req) => {
  const name = str(req.body.name).trim()
  const prefix = str(req.body.prefix).trim().toUpperCase()
  const months = Number(req.body.defaultWarrantyMonths)
  if (!name || name.length > 60) return bad('שם תת-קטגוריה: 1 עד 60 תווים.')
  if (!/^[A-Z]{2,8}$/.test(prefix)) return bad('קידומת: 2 עד 8 אותיות באנגלית, למשל NET.')
  if (!(months >= 0 && months <= 120)) return bad('אחריות: בין 0 ל-120 חודשים.')
  const cat = db.categories.find((c) => c.id === Number(req.body.categoryId))
  if (!cat) return bad('קטגוריית העל לא נמצאה.')
  if (db.subCategories.some((s) => s.prefix === prefix)) return conflict(`הקידומת ${prefix} כבר בשימוש.`)
  if (db.subCategories.some((s) => s.categoryId === cat.id && s.name === name)) return conflict(`"${name}" כבר קיימת תחת ${cat.name}.`)
  const start = Number(req.body.startNumber)
  const s = {
    id: nextId(), categoryId: cat.id, name, prefix, sortOrder: Math.max(0, ...subsOf(cat.id).map((x) => x.sortOrder)) + 1,
    defaultModel: str(req.body.defaultModel).trim() || null, defaultWarrantyMonths: months, nextNumber: start > 0 ? start : 100,
  }
  db.subCategories.push(s)
  log('category', `נוספה תת-קטגוריה "${name}" תחת ${cat.name} (מספור ${prefix}-${s.nextNumber})`, null, s.id)
  return json({ id: s.id })
})

route('PUT', '/api/subcategories/:id', (req, [id]) => {
  const s = db.subCategories.find((x) => x.id === Number(id))
  if (!s) return notFound()
  const name = str(req.body.name).trim()
  const months = Number(req.body.defaultWarrantyMonths)
  if (!name || name.length > 60) return bad('שם תת-קטגוריה: 1 עד 60 תווים.')
  if (!(months >= 0 && months <= 120)) return bad('אחריות: בין 0 ל-120 חודשים.')
  s.name = name
  s.defaultModel = str(req.body.defaultModel).trim() || null
  s.defaultWarrantyMonths = months
  log('category', `עודכנה תת-קטגוריה "${name}"`, null, s.id)
  return noContent()
})

route('GET', '/api/subcategories/:id', (_req, [id]) => {
  const sub = db.subCategories.find((s) => s.id === Number(id))
  if (!sub) return notFound('תת-הקטגוריה לא נמצאה.')
  const cat = db.categories.find((c) => c.id === sub.categoryId)!
  const rows = db.assets.filter((a) => a.subCategoryId === sub.id).map(row)
  const c = counts(rows)
  const last = db.purchases.filter((p) => p.subCategoryId === sub.id)
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.id - a.id)[0]
  const lastPurchase = last ? { supplierName: last.supplierName, unitPrice: last.unitPrice, purchaseDate: last.purchaseDate, warrantyEnd: last.warrantyEnd } : null
  return json({
    id: sub.id, name: sub.name, prefix: sub.prefix, category: { id: cat.id, name: cat.name, icon: cat.icon },
    nextTag: `${sub.prefix}-${sub.nextNumber}`, defaultModel: sub.defaultModel, defaultWarrantyMonths: sub.defaultWarrantyMonths,
    kpis: {
      active: c.active, inUse: c.inUse + c.pending, pending: c.pending, available: c.available, repair: c.repair, scrapped: c.scrapped,
      unitPrice: last?.unitPrice ?? null, value: c.value, supplier: last?.supplierName ?? null,
    },
    lastPurchase,
    assets: rows.sort((a, b) => Number(a.status === 'scrapped') - Number(b.status === 'scrapped') || b.id - a.id),
  })
})

route('GET', '/api/suppliers', () => json([...new Set(db.purchases.map((p) => p.supplierName))].sort((a, b) => a.localeCompare(b, 'he'))))
route('GET', '/api/companies', () => json(db.companies.slice().sort(byOrder).map(({ id, name, companyNumber }) => ({ id, name, companyNumber }))))
route('GET', '/api/disposal-reasons', () => json(DISPOSAL_REASONS))

/* dashboard */

route('GET', '/api/dashboard', () => {
  const rows = db.assets.map(row)
  const t = today()
  const monthStart = stamp(new Date(t.getFullYear(), t.getMonth(), 1))
  const live = rows.filter((r) => r.status !== 'scrapped')
  const monthDisposals = rows.filter((r) => r.disposedAt && r.disposedAt >= monthStart)
  const soon = dayKey(addDays(t, 90))
  const tk = dayKey(t)
  return json({
    totals: counts(rows),
    categories: db.categories.slice().sort(byOrder).map((c) => ({
      id: c.id, name: c.name, icon: c.icon,
      subCategories: subsOf(c.id).map((s) => ({ id: s.id, name: s.name, counts: counts(rows.filter((r) => r.subCategoryId === s.id)) })),
    })),
    pending: live.filter((r) => r.status === 'pending').sort((a, b) => cmp(a.deliveredAt, b.deliveredAt)),
    repair: live.filter((r) => r.status === 'repair').sort((a, b) => cmp(a.repairSince, b.repairSince)),
    warrantySoon: live.filter((r) => r.warrantyEnd >= tk && r.warrantyEnd <= soon).sort((a, b) => cmp(a.warrantyEnd, b.warrantyEnd)),
    monthDisposals: {
      count: monthDisposals.length,
      value: monthDisposals.reduce((n, r) => n + r.price, 0),
      byReason: DISPOSAL_REASONS.map((reason) => ({ reason, count: monthDisposals.filter((r) => r.disposalReason === reason).length })),
    },
    recent: auditRows(12),
    today: tk,
  })
})

function auditRows(take: number) {
  return db.audit.slice().sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id).slice(0, take).map((l) => ({
    id: l.id, at: l.at, action: l.action, text: l.text, assetId: l.assetId, subCategoryId: l.subCategoryId,
    user: db.users.find((u) => u.id === l.userId)?.fullName ?? null,
  }))
}

route('GET', '/api/audit', (req) => json(auditRows(Math.max(1, Math.min(500, Number(req.query.get('take') ?? 50))))))

/* assets */

route('GET', '/api/assets/search', (req) => {
  const q = (req.query.get('q') ?? '').trim()
  if (q.length < 2) return json([])
  const activeOnly = req.query.get('activeOnly') === 'true'
  const hits = db.assets
    .filter((a) => (a.assetTag.includes(q) || a.serialNumber.includes(q)) && (!activeOnly || a.state !== 'scrapped'))
    .sort((a, b) => a.assetTag.localeCompare(b.assetTag))
    .slice(0, 12)
  return json(hits.map(row))
})

route('GET', '/api/assets/:id', (_req, [id]) => {
  const a = db.assets.find((x) => x.id === Number(id))
  if (!a) return notFound('הפריט לא נמצא.')
  const history = db.assignments.filter((x) => x.assetId === a.id)
    .sort((x, y) => y.deliveredAt.localeCompare(x.deliveredAt) || y.id - x.id)
    .map((x) => ({ id: x.id, employee: employee(x.employeeId).fullName, deliveredAt: x.deliveredAt, returnedAt: x.returnedAt, signed: !!x.signedAt, signatureKind: x.signatureKind }))
  const d = db.disposals.find((x) => x.assetId === a.id)
  const disposal = d ? {
    reason: d.reason, description: d.description, returnedToWarehouse: d.returnedToWarehouse, disposedAt: d.disposedAt,
    approver: db.users.find((u) => u.id === d.approvedBy)?.fullName ?? '', hasPhoto: !!d.photoFileId,
    previousEmployee: d.previousEmployeeId ? employee(d.previousEmployeeId).fullName : null,
  } : null
  const logRows = db.audit.filter((l) => l.assetId === a.id).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 20)
    .map((l) => ({ at: l.at, action: l.action, text: l.text, user: db.users.find((u) => u.id === l.userId)?.fullName ?? null }))
  return json({ asset: row(a), history, disposal, log: logRows })
})

route('PUT', '/api/assets/:id', (req, [id]) => {
  const a = db.assets.find((x) => x.id === Number(id))
  if (!a) return notFound('הפריט לא נמצא.')
  if (a.state === 'scrapped') return bad('פריט שנגרע אינו ניתן לעריכה.')
  const model = str(req.body.model).trim()
  const serial = str(req.body.serialNumber).trim()
  if (!model || !serial) return bad('דגם ומספר סנטרלי הם שדות חובה.')
  const company = db.companies.find((c) => c.id === Number(req.body.companyId))
  if (!company) return bad('בחרו עבור איזו חברה הפריט.')
  if (serial !== a.serialNumber && db.assets.some((x) => x.serialNumber === serial && x.id !== a.id)) return conflict(`המספר הסנטרלי ${serial} כבר רשום על פריט אחר.`)

  const changes: string[] = []
  if (model !== a.model) { changes.push(`דגם: ${model}`); a.model = model }
  if (serial !== a.serialNumber) { changes.push(`סנטרלי: ${a.serialNumber} → ${serial}`); a.serialNumber = serial }
  if (company.id !== a.companyId) { changes.push(`חברה: ${company.name}`); a.companyId = company.id }
  const inRepair = req.body.inRepair === true
  if (inRepair && a.state !== 'repair') {
    a.state = 'repair'; a.repairSince = todayKey()
    log('repair', `${a.assetTag} הועבר לתיקון`, a.id, a.subCategoryId)
  } else if (!inRepair && a.state === 'repair') {
    a.state = 'active'; a.repairSince = null
    log('repair', `${a.assetTag} חזר מתיקון`, a.id, a.subCategoryId)
  }
  if (changes.length) log('edit', `${a.assetTag} עודכן: ${changes.join(', ')}`, a.id, a.subCategoryId)
  return noContent()
})

route('POST', '/api/assets/:id/assign', (req, [id]) => {
  const a = db.assets.find((x) => x.id === Number(id))
  if (!a) return notFound('הפריט לא נמצא.')
  if (a.state === 'scrapped') return bad('אי אפשר לשייך פריט שנגרע.')
  const empId = req.body.employeeId == null ? null : Number(req.body.employeeId)
  const [emp, err] = resolveEmployee(empId, str(req.body.newEmployeeName) || null, str(req.body.newEmployeeDepartment) || null)
  if (!emp) return bad(err!)
  const open = openAssignment(a.id)
  if (open && open.employeeId === emp.id) return conflict(`${a.assetTag} כבר משויך ל${emp.fullName}.`)
  if (open) open.returnedAt = todayKey()
  db.assignments.push({ id: nextId(), assetId: a.id, employeeId: emp.id, deliveredAt: str(req.body.deliveredAt) || todayKey(), returnedAt: null, signatureKind: null, signatureFileId: null, signedAt: null })
  log('assign', `${a.assetTag} שויך ל${emp.fullName}, ממתין לחתימה`, a.id, a.subCategoryId)
  return noContent()
})

route('POST', '/api/assets/:id/return', (_req, [id]) => {
  const a = db.assets.find((x) => x.id === Number(id))
  if (!a) return notFound('הפריט לא נמצא.')
  const open = openAssignment(a.id)
  if (!open) return bad('הפריט אינו משויך לאף אחד.')
  open.returnedAt = todayKey()
  log('return', `${a.assetTag} הוחזר למחסן מ${employee(open.employeeId).fullName}`, a.id, a.subCategoryId)
  return noContent()
})

route('POST', '/api/assets/:id/signature', async (req, [id]) => {
  const a = db.assets.find((x) => x.id === Number(id))
  if (!a) return notFound('הפריט לא נמצא.')
  if (a.state === 'scrapped') return bad('פריט שנגרע אינו ניתן לחתימה.')
  if (formStr(req.form, 'kind') !== 'drawn') return bad('סוג חתימה לא תקין.')
  const [img, imgErr] = await readImage(req.form?.get('image') ?? null)
  if (!img) return bad(imgErr!)

  let open = openAssignment(a.id)
  let emp = open ? employee(open.employeeId) : null
  const empIdRaw = formStr(req.form, 'employeeId')
  const newName = formStr(req.form, 'newEmployeeName')
  if (empIdRaw || newName?.trim()) {
    const [resolved, err] = resolveEmployee(empIdRaw ? Number(empIdRaw) : null, newName, formStr(req.form, 'newEmployeeDepartment'))
    if (!resolved) return bad(err!)
    emp = resolved
  }
  if (!emp) return bad('בחרו את העובד שקיבל את הציוד.')
  const deliveredAt = formStr(req.form, 'deliveredAt')
  if (!open || open.employeeId !== emp.id) {
    if (open) open.returnedAt = todayKey()
    open = { id: nextId(), assetId: a.id, employeeId: emp.id, deliveredAt: deliveredAt || todayKey(), returnedAt: null, signatureKind: null, signatureFileId: null, signedAt: null }
    db.assignments.push(open)
  } else if (deliveredAt) {
    open.deliveredAt = deliveredAt
  }
  const fileId = `sig-${open.id}`
  db.files[fileId] = img
  open.signatureKind = 'drawn'
  open.signatureFileId = fileId
  open.signedAt = nowStamp()
  log('sign', `${emp.fullName} חתם/ה על קבלת ${a.assetTag}`, a.id, a.subCategoryId)
  return noContent()
})

route('GET', '/api/assets/:id/signature', (req, [id]) => {
  const assignmentId = req.query.get('assignmentId')
  const x = db.assignments.find((s) => s.assetId === Number(id) && s.signatureFileId &&
    (assignmentId ? s.id === Number(assignmentId) : s.returnedAt === null))
  return x ? dataUrlResponse(db.files[x.signatureFileId!]) : notFound()
})

route('POST', '/api/assets/:id/dispose', async (req, [id]) => {
  const a = db.assets.find((x) => x.id === Number(id))
  if (!a) return notFound('הפריט לא נמצא.')
  if (a.state === 'scrapped') return conflict(`${a.assetTag} כבר נגרע.`)
  const reason = formStr(req.form, 'reason') ?? ''
  if (!DISPOSAL_REASONS.includes(reason)) return bad('בחרו סיבת השבתה מהרשימה.')
  let photoFileId: string | null = null
  const photo = req.form?.get('photo') ?? null
  if (photo) {
    const [img, err] = await readImage(photo)
    if (!img) return bad(err!)
    photoFileId = `photo-${a.id}`
    db.files[photoFileId] = img
  }
  const returned = formStr(req.form, 'returnedToWarehouse') === 'true'
  const open = openAssignment(a.id)
  if (open) open.returnedAt = todayKey()
  a.state = 'scrapped'
  a.repairSince = null
  const description = (formStr(req.form, 'description') ?? '').trim().slice(0, 1000) || null
  db.disposals.push({ id: nextId(), assetId: a.id, reason, description, returnedToWarehouse: returned, previousEmployeeId: open?.employeeId ?? null, photoFileId, approvedBy: db.session!, disposedAt: nowStamp() })
  const prev = open ? employee(open.employeeId).fullName : null
  log('dispose', `${a.assetTag} נגרע: ${reason}${returned ? '' : ' · חסר במלאי'}${prev ? ` (היה אצל ${prev})` : ''}`, a.id, a.subCategoryId)
  queueMail('disposal', a.companyId, `גריעת ציוד: ${a.model} (${a.assetTag})`)
  return noContent()
})

route('GET', '/api/assets/:id/disposal-photo', (_req, [id]) => {
  const d = db.disposals.find((x) => x.assetId === Number(id) && x.photoFileId)
  return d ? dataUrlResponse(db.files[d.photoFileId!]) : notFound()
})

/* intake */

route('POST', '/api/intake', async (req) => {
  let data: Json | null = null
  try { data = JSON.parse(formStr(req.form, 'data') ?? '') } catch { data = null }
  if (!data) return bad('פרטי הקליטה חסרים או לא תקינים.')
  const supplier = str(data.supplierName).trim()
  const invoiceNumber = str(data.invoiceNumber).trim()
  const items = ((data.items as Json[]) ?? []).map((i) => ({ model: str(i.model).trim(), serial: str(i.serialNumber).trim() }))
  const company = db.companies.find((c) => c.id === Number(data.companyId))
  const invoice = req.form?.get('invoice') ?? null
  const unitPrice = Number(data.unitPrice)

  const errors: string[] = []
  if (!company) errors.push('עבור איזו חברה')
  if (!supplier) errors.push('שם ספק')
  if (!invoiceNumber) errors.push('מספר חשבונית')
  if (!(invoice instanceof Blob) || invoice.size === 0) errors.push('קובץ החשבונית (PDF)')
  if (!(unitPrice >= 0)) errors.push('מחיר ליחידה תקין')
  if (items.length === 0) errors.push('לפחות פריט אחד')
  if (items.some((i) => !i.serial)) errors.push('מספר סנטרלי לכל שורה')
  if (errors.length) return bad(`חסרים: ${errors.join(', ')}.`)
  if (items.length > 200) return bad('אפשר לקלוט עד 200 פריטים בפעם אחת.')
  const purchaseDate = str(data.purchaseDate)
  const warrantyEnd = str(data.warrantyEnd)
  if (warrantyEnd < purchaseDate) return bad('תאריך תום האחריות מוקדם מתאריך הרכישה.')
  if (invoiceNumber.length > 40) return bad('מספר החשבונית ארוך מדי (עד 40 תווים).')
  const [pdf, pdfErr] = await readPdf(invoice)
  if (!pdf) return bad(pdfErr!)

  const seen = new Map<string, number>()
  for (const i of items) seen.set(i.serial.toLowerCase(), (seen.get(i.serial.toLowerCase()) ?? 0) + 1)
  const dup = items.filter((i) => seen.get(i.serial.toLowerCase())! > 1).map((i) => i.serial)
  if (dup.length) return json({ error: `מספר סנטרלי חוזר פעמיים: ${[...new Set(dup)].join(', ')}`, serials: [...new Set(dup)] }, 400)
  const existing = db.assets.filter((a) => items.some((i) => i.serial === a.serialNumber)).map((a) => `${a.serialNumber} (${a.assetTag})`)
  if (existing.length) return json({ error: `כבר קיים במערכת: ${existing.join(', ')}`, serials: existing }, 409)

  const sub = db.subCategories.find((s) => s.id === Number(data.subCategoryId))
  if (!sub) return bad('תת-הקטגוריה לא נמצאה.')
  const fileId = `inv-${nextId()}`
  db.files[fileId] = pdf.data
  const purchase = {
    id: nextId(), subCategoryId: sub.id, supplierName: supplier, invoiceNumber, purchaseDate, warrantyEnd, unitPrice,
    invoice: { fileName: pdf.name, sizeBytes: pdf.size, uploadedAt: nowStamp(), fileId },
  }
  db.purchases.push(purchase)
  const created = items.map((i) => {
    const a: Asset = {
      id: nextId(), subCategoryId: sub.id, purchaseId: purchase.id, companyId: company!.id,
      assetTag: `${sub.prefix}-${sub.nextNumber++}`, serialNumber: i.serial,
      model: i.model || sub.defaultModel || sub.name, state: 'active', repairSince: null,
    }
    db.assets.push(a)
    return a
  })
  log('intake', `נקלטו ${created.length} ${sub.name} (${created[0].assetTag}${created.length > 1 ? ` עד ${created[created.length - 1].assetTag}` : ''}, חשבונית ${invoiceNumber}, עבור ${company!.name})`, null, sub.id)
  queueMail('intake', company!.id, `קליטת ציוד: ${created.length} ${sub.name}`)
  return json({ count: created.length, ids: created.map((a) => a.id), tags: created.map((a) => a.assetTag) })
})

/* invoices (admin) */

route('GET', '/api/invoices', (req) => {
  const text = (req.query.get('q') ?? '').trim()
  const subId = req.query.get('subCategoryId')
  const catId = req.query.get('categoryId')
  const rows = db.purchases
    .filter((p) => !text || p.invoiceNumber.includes(text) || p.supplierName.includes(text))
    .filter((p) => {
      const sub = db.subCategories.find((s) => s.id === p.subCategoryId)!
      return subId ? sub.id === Number(subId) : catId ? sub.categoryId === Number(catId) : true
    })
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.id - a.id)
    .slice(0, 1000)
    .map((p) => {
      const sub = db.subCategories.find((s) => s.id === p.subCategoryId)!
      const cat = db.categories.find((c) => c.id === sub.categoryId)!
      const assets = db.assets.filter((a) => a.purchaseId === p.id)
      const companies = [...new Set(assets.map((a) => db.companies.find((c) => c.id === a.companyId)?.name).filter(Boolean))]
      return {
        id: p.id, invoiceNumber: p.invoiceNumber, supplierName: p.supplierName, purchaseDate: p.purchaseDate, unitPrice: p.unitPrice,
        total: p.unitPrice * assets.length, category: cat.name, categoryIcon: cat.icon, subCategory: sub.name, subCategoryId: sub.id,
        count: assets.length, companies,
        file: p.invoice ? { fileName: p.invoice.fileName, sizeBytes: p.invoice.sizeBytes, uploadedAt: p.invoice.uploadedAt } : null,
      }
    })
  return json(rows)
}, { admin: true })

route('GET', '/api/invoices/:id/pdf', async (req, [id]) => {
  const p = db.purchases.find((x) => x.id === Number(id))
  if (!p?.invoice) return notFound('לרכישה הזו לא צורפה חשבונית.')
  const uploaded = p.invoice.fileId ? db.files[p.invoice.fileId] : null
  const blob = uploaded ? await (await fetchDataUrl(uploaded)).blob() : await (await import('./reports')).sampleInvoicePdf(invoiceData(p.id))
  const disposition = req.query.get('download') === 'true' ? 'attachment' : 'inline'
  return new Response(blob, { headers: { 'content-type': 'application/pdf', 'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(p.invoice.fileName)}` } })
}, { admin: true })

function invoiceData(purchaseId: number) {
  const p = db.purchases.find((x) => x.id === purchaseId)!
  const sub = db.subCategories.find((s) => s.id === p.subCategoryId)!
  const assets = db.assets.filter((a) => a.purchaseId === p.id)
  const company = db.companies.find((c) => c.id === assets[0]?.companyId) ?? db.companies[0]
  return { invoiceNumber: p.invoiceNumber, supplier: p.supplierName, date: p.purchaseDate, company: company.name, item: `${sub.name}: ${assets[0]?.model ?? sub.defaultModel ?? ''}`, count: assets.length, unitPrice: p.unitPrice }
}

route('POST', '/api/invoices/:id', async (req, [id]) => {
  const p = db.purchases.find((x) => x.id === Number(id))
  if (!p) return notFound('הרכישה לא נמצאה.')
  const [pdf, err] = await readPdf(req.form?.get('file') ?? null)
  if (!pdf) return bad(err!)
  const replaced = !!p.invoice
  const fileId = `inv-${p.id}`
  db.files[fileId] = pdf.data
  p.invoice = { fileName: pdf.name, sizeBytes: pdf.size, uploadedAt: nowStamp(), fileId }
  const sub = db.subCategories.find((s) => s.id === p.subCategoryId)!
  log('invoice', `${replaced ? 'הוחלף קובץ' : 'צורף קובץ'} חשבונית ${p.invoiceNumber} (${sub.name}, ${p.supplierName})`, null, sub.id)
  return noContent()
}, { admin: true })

/* employees */

route('GET', '/api/employees', (req) => {
  const all = req.query.get('includeInactive') === 'true'
  return json(db.employees.filter((e) => all || e.isActive).sort((a, b) => a.fullName.localeCompare(b.fullName, 'he')).map((e) => {
    const open = db.assignments.filter((x) => x.employeeId === e.id && x.returnedAt === null)
    return { id: e.id, employeeNumber: e.employeeNumber, fullName: e.fullName, department: e.department, isActive: e.isActive, holding: open.length, unsigned: open.filter((x) => !x.signedAt).length }
  }))
})

route('GET', '/api/employees/lookup', (req) => {
  const q = (req.query.get('q') ?? '').trim()
  if (q.length < 2) return json([])
  const people = db.employees.filter((e) => e.fullName.includes(q) || (e.department ?? '').includes(q))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'he')).slice(0, 6)
  return json(people.map((p) => {
    const mine = db.assets.filter((a) => openAssignment(a.id)?.employeeId === p.id).map(row).sort((a, b) => cmp(a.deliveredAt, b.deliveredAt))
    const signed = mine.filter((r) => r.signed)
    return { id: p.id, fullName: p.fullName, department: p.department, isActive: p.isActive, signed, pending: mine.filter((r) => !r.signed), signedValue: signed.reduce((n, r) => n + r.price, 0) }
  }))
})

route('POST', '/api/employees', (req) => {
  const name = str(req.body.fullName).trim()
  if (!name || name.length > 100) return bad('שם: 1 עד 100 תווים.')
  if (db.employees.some((e) => e.fullName === name)) return conflict(`${name} כבר ברשימה.`)
  const e: Employee = { id: nextId(), employeeNumber: null, fullName: name, department: str(req.body.department).trim().slice(0, 100) || null, isActive: true }
  db.employees.push(e)
  log('employee', `נוסף עובד ${name}`)
  return json({ id: e.id })
})

route('PUT', '/api/employees/:id', (req, [id]) => {
  const e = db.employees.find((x) => x.id === Number(id))
  if (!e) return notFound()
  const name = str(req.body.fullName).trim()
  if (!name || name.length > 100) return bad('שם: 1 עד 100 תווים.')
  if (name !== e.fullName && db.employees.some((x) => x.fullName === name && x.id !== e.id)) return conflict(`${name} כבר ברשימה.`)
  const active = req.body.isActive !== false
  if (!active && e.isActive && db.assignments.some((x) => x.employeeId === e.id && x.returnedAt === null))
    return bad(`ל${e.fullName} יש ציוד משויך. החזירו או העבירו אותו לפני ההשבתה.`)
  e.fullName = name
  e.department = str(req.body.department).trim().slice(0, 100) || null
  e.isActive = active
  log('employee', `עודכן עובד ${name}${active ? '' : ' (הושבת)'}`)
  return noContent()
})

route('POST', '/api/employees/import', async (req) => {
  const file = req.form?.get('file')
  if (!(file instanceof Blob) || file.size === 0) return bad('בחרו קובץ Excel.')
  const { readEmployeeSheet } = await import('./reports')
  const [rows, err] = await readEmployeeSheet(file)
  if (err) return bad(err)
  const nums = rows.filter((r) => r.number !== null).map((r) => r.number!)
  const dups = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))]
  if (dups.length) return bad(`מספר עובד מופיע פעמיים בקובץ: ${dups.join(', ')}`)

  const apply = req.query.get('apply') === 'true'
  // A preview works on a copy, so nothing changes until the import is applied.
  const all: Employee[] = apply ? db.employees : db.employees.map((e) => ({ ...e }))
  const added: string[] = []
  const updated: { name: string; changes: string[] }[] = []
  let unchanged = 0
  const seen = new Set<number>()
  for (const r of rows) {
    let e = (r.number !== null ? all.find((x) => x.employeeNumber === r.number) : undefined)
      ?? all.find((x) => x.fullName === r.fullName && (x.employeeNumber === null || r.number === null))
    if (!e) {
      const name = all.some((x) => x.fullName === r.fullName) && r.number !== null ? `${r.fullName} (${r.number})` : r.fullName
      e = { id: apply ? nextId() : -1, employeeNumber: r.number, fullName: name, department: r.department, isActive: true }
      all.push(e)
      added.push(name)
      continue
    }
    seen.add(e.id)
    const changes: string[] = []
    if (e.fullName !== r.fullName && !all.some((x) => x !== e && x.fullName === r.fullName)) { changes.push(`שם: ${e.fullName} → ${r.fullName}`); e.fullName = r.fullName }
    if (r.department !== null && e.department !== r.department) { changes.push(`מחלקה: ${e.department ?? '—'} → ${r.department}`); e.department = r.department }
    if (r.number !== null && e.employeeNumber !== r.number) { changes.push(`מספר עובד: ${r.number}`); e.employeeNumber = r.number }
    if (!e.isActive) { changes.push('הוחזר לפעילות'); e.isActive = true }
    if (changes.length) updated.push({ name: e.fullName, changes })
    else unchanged++
  }
  const missing = all.filter((x) => x.id > 0 && x.isActive && x.employeeNumber !== null && !seen.has(x.id))
    .map((x) => ({ id: x.id, name: x.fullName, department: x.department, holding: db.assignments.filter((a) => a.employeeId === x.id && a.returnedAt === null).length }))
  if (apply) log('employee', `יובא אלפון עובדים: ${added.length} חדשים, ${updated.length} עודכנו`)
  return json({ applied: apply, total: rows.length, added, updated, unchanged, missing })
}, { admin: true })

/* users (admin) */

route('GET', '/api/users', () => json(db.users.slice().sort((a, b) => a.fullName.localeCompare(b.fullName, 'he')).map((u) => ({
  id: u.id, username: u.username, fullName: u.fullName, isAdmin: u.isAdmin, isActive: u.isActive, mustChangePassword: u.mustChangePassword, locked: false, createdAt: u.createdAt,
}))), { admin: true })

function temporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  return Array.from({ length: 6 }, () => pick(letters)).join('') + Array.from({ length: 3 }, () => pick(digits)).join('')
}

route('POST', '/api/users', (req) => {
  const username = str(req.body.username).trim().toLowerCase()
  const fullName = str(req.body.fullName).trim()
  if (username.length < 2 || !/^[a-z0-9._-]+$/.test(username)) return bad('שם משתמש: לפחות 2 תווים, אותיות באנגלית, ספרות, נקודה או קו.')
  if (!fullName) return bad('הזינו שם מלא.')
  if (db.users.some((u) => u.username === username)) return conflict(`שם המשתמש ${username} כבר קיים.`)
  const temp = temporaryPassword()
  const u = { id: nextId(), username, fullName, password: temp, isAdmin: req.body.isAdmin === true, isActive: true, mustChangePassword: true, createdAt: nowStamp() }
  db.users.push(u)
  log('user', `נוסף משתמש ${fullName} (${username})`)
  return json({ id: u.id, temporaryPassword: temp })
}, { admin: true })

route('PUT', '/api/users/:id', (req, [id]) => {
  const u = db.users.find((x) => x.id === Number(id))
  if (!u) return notFound()
  const isAdmin = req.body.isAdmin === true
  const isActive = req.body.isActive === true
  if (u.id === db.session && (!isActive || !isAdmin)) return bad('אי אפשר להשבית את עצמך או להסיר ממך הרשאת ניהול.')
  if (u.isAdmin && (!isAdmin || !isActive) && !db.users.some((x) => x.isAdmin && x.isActive && x.id !== u.id)) return bad('חייב להישאר לפחות מנהל פעיל אחד.')
  const fullName = str(req.body.fullName).trim()
  if (!fullName) return bad('הזינו שם מלא.')
  u.fullName = fullName
  u.isAdmin = isAdmin
  u.isActive = isActive
  log('user', `עודכן משתמש ${fullName}${isActive ? '' : ' (הושבת)'}`)
  return noContent()
}, { admin: true })

route('POST', '/api/users/:id/reset-password', (_req, [id]) => {
  const u = db.users.find((x) => x.id === Number(id))
  if (!u) return notFound()
  const temp = temporaryPassword()
  u.password = temp
  u.mustChangePassword = true
  log('user', `אופסה הסיסמה של ${u.fullName}`)
  return json({ temporaryPassword: temp })
}, { admin: true })

/* mail (admin) */

route('GET', '/api/mail', () => json({
  enabled: false,
  onlyTo: null,
  recipients: db.mailRecipients.slice().sort((a, b) => a.email.localeCompare(b.email)),
  log: db.mailLog.slice().sort((a, b) => b.id - a.id).slice(0, 50),
}), { admin: true })

function validateRecipient(body: Json): [Omit<MailRecipient, 'id'> | null, string | null] {
  const email = str(body.email).trim().toLowerCase()
  const name = str(body.name).trim() || null
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return [null, 'כתובת מייל לא תקינה.']
  if (name && name.length > 100) return [null, 'שם ארוך מדי.']
  if (body.onIntake !== true && body.onDisposal !== true) return [null, 'סמנו לפחות סוג מייל אחד.']
  const companyIds = [...new Set(((body.companyIds as number[]) ?? []).map(Number))]
  if (companyIds.some((id) => !db.companies.some((c) => c.id === id))) return [null, 'אחת החברות לא נמצאה.']
  return [{ email, name, onIntake: body.onIntake === true, onDisposal: body.onDisposal === true, companyIds }, null]
}

route('POST', '/api/mail/recipients', (req) => {
  const [r, err] = validateRecipient(req.body)
  if (!r) return bad(err!)
  if (db.mailRecipients.some((x) => x.email === r.email)) return conflict(`${r.email} כבר ברשימה.`)
  const created = { id: nextId(), ...r }
  db.mailRecipients.push(created)
  log('mail', `נוסף נמען מייל ${r.email}`)
  return json({ id: created.id })
}, { admin: true })

route('PUT', '/api/mail/recipients/:id', (req, [id]) => {
  const existing = db.mailRecipients.find((x) => x.id === Number(id))
  if (!existing) return notFound()
  const [r, err] = validateRecipient(req.body)
  if (!r) return bad(err!)
  if (r.email !== existing.email && db.mailRecipients.some((x) => x.email === r.email && x.id !== existing.id)) return conflict(`${r.email} כבר ברשימה.`)
  Object.assign(existing, r)
  log('mail', `עודכן נמען מייל ${r.email}`)
  return noContent()
}, { admin: true })

route('DELETE', '/api/mail/recipients/:id', (_req, [id]) => {
  const i = db.mailRecipients.findIndex((x) => x.id === Number(id))
  if (i < 0) return notFound()
  const [r] = db.mailRecipients.splice(i, 1)
  log('mail', `הוסר נמען מייל ${r.email}`)
  return noContent()
}, { admin: true })

route('POST', '/api/mail/test', (req) => {
  const email = str(req.body.email).trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('כתובת מייל לא תקינה.')
  const kind = req.body.kind === 'disposal' ? 'disposal' : 'intake'
  const entry = { id: nextId(), at: nowStamp(), kind: 'test' as const, subject: `מייל בדיקה: ${kind === 'intake' ? 'קליטת ציוד' : 'גריעת ציוד'}`, recipients: email, outcome: 'disabled' as const, error: 'גרסת הדגמה: מיילים לא יוצאים מהדפדפן.', durationMs: null }
  db.mailLog.push(entry)
  return json(entry)
}, { admin: true })

/* reports */

function disposalRows(month: string) {
  const from = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const to = dayKey(new Date(y, m, 1))
  return db.disposals.filter((d) => d.disposedAt >= from && d.disposedAt < to).sort((a, b) => b.disposedAt.localeCompare(a.disposedAt)).map((d) => {
    const a = db.assets.find((x) => x.id === d.assetId)!
    const p = db.purchases.find((x) => x.id === a.purchaseId)!
    return {
      assetId: a.id, disposedAt: d.disposedAt, assetTag: a.assetTag, serialNumber: a.serialNumber, model: a.model,
      subCategory: db.subCategories.find((s) => s.id === a.subCategoryId)!.name, reason: d.reason, description: d.description,
      invoiceNumber: p.invoiceNumber, supplierName: p.supplierName, purchaseDate: p.purchaseDate, price: p.unitPrice,
      returnedToWarehouse: d.returnedToWarehouse, previousEmployee: d.previousEmployeeId ? employee(d.previousEmployeeId).fullName : null,
      approver: db.users.find((u) => u.id === d.approvedBy)?.fullName ?? '', hasPhoto: !!d.photoFileId,
    }
  })
}

function monthOf(req: Req): string | null {
  const m = req.query.get('month')
  if (!m) { const t = today(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}` }
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null
}

route('GET', '/api/reports/disposals', (req) => {
  const month = monthOf(req)
  if (!month) return bad('חודש לא תקין (yyyy-MM).')
  const items = disposalRows(month)
  return json({ month, count: items.length, value: items.reduce((n, x) => n + x.price, 0), notReturned: items.filter((x) => !x.returnedToWarehouse).length, items })
})

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const fileResponse = (blob: Blob, type: string, name: string) =>
  new Response(blob, { headers: { 'content-type': type, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } })

route('GET', '/api/reports/disposals/export', async (req) => {
  const month = monthOf(req)
  if (!month) return bad('חודש לא תקין (yyyy-MM).')
  const { disposalsWorkbook } = await import('./reports')
  return fileResponse(await disposalsWorkbook(month, disposalRows(month)), XLSX, `disposals-${month}.xlsx`)
})

route('GET', '/api/subcategories/:id/export', async (_req, [id]) => {
  const sub = db.subCategories.find((s) => s.id === Number(id))
  if (!sub) return notFound()
  const cat = db.categories.find((c) => c.id === sub.categoryId)!
  const rows = db.assets.filter((a) => a.subCategoryId === sub.id).map(row)
    .sort((a, b) => Number(a.status === 'scrapped') - Number(b.status === 'scrapped') || (a.assetTag < b.assetTag ? -1 : 1))
  const { subCategoryWorkbook } = await import('./reports')
  return fileResponse(await subCategoryWorkbook(sub.name, cat.name, rows, counts(rows).active), XLSX, `${sub.prefix}-${todayKey()}.xlsx`)
})

function byCategoryRows() {
  const rows = db.assets.map(row)
  const out: { category: string; subCategory: string; counts: ReturnType<typeof counts>; kind: 'line' | 'subtotal' | 'grand' }[] = []
  for (const c of db.categories.slice().sort(byOrder)) {
    const subs = subsOf(c.id)
    for (const s of subs) out.push({ category: c.name, subCategory: s.name, counts: counts(rows.filter((r) => r.subCategoryId === s.id)), kind: 'line' })
    if (subs.length > 1) out.push({ category: `סה"כ ${c.name}`, subCategory: '', counts: counts(rows.filter((r) => subs.some((s) => s.id === r.subCategoryId))), kind: 'subtotal' })
  }
  const total = counts(rows)
  out.push({ category: 'סה"כ כל הקבוצה', subCategory: '', counts: total, kind: 'grand' })
  return { rows: out, active: total.active }
}

route('GET', '/api/reports/by-category/export', async () => {
  const { byCategoryWorkbook } = await import('./reports')
  const { rows, active } = byCategoryRows()
  return fileResponse(await byCategoryWorkbook(rows, active), XLSX, `inventory-by-category-${todayKey()}.xlsx`)
})

route('GET', '/api/reports/by-category/pdf', async () => {
  const { byCategoryPdf } = await import('./reports')
  const { rows, active } = byCategoryRows()
  return fileResponse(await byCategoryPdf(rows, active), 'application/pdf', `inventory-by-category-${todayKey()}.pdf`)
})

export type ByCategoryRow = ReturnType<typeof byCategoryRows>['rows'][number]
export type DisposalRow = ReturnType<typeof disposalRows>[number]
export type AssetRowData = Row

/* --------------------------------------------------------------- dispatch */

const fetchDataUrl = (url: string) => fetch(url)
function dataUrlResponse(dataUrl: string | undefined) {
  if (!dataUrl) return notFound()
  const [head, body] = dataUrl.split(',')
  const type = head.slice(5).split(';')[0]
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Response(bytes, { headers: { 'content-type': type } })
}

async function dispatch(method: string, url: URL, init?: RequestInit): Promise<Response> {
  const path = url.pathname.slice(url.pathname.indexOf('/api/'))
  let body: Json = {}
  let form: FormData | null = null
  if (init?.body instanceof FormData) form = init.body
  else if (typeof init?.body === 'string') { try { body = JSON.parse(init.body) } catch { body = {} } }

  for (const [m, re, handler, opts] of routes) {
    if (m !== method) continue
    const match = re.exec(path)
    if (!match) continue
    const user = me()
    if (!opts?.anon && !user) return json({ error: 'נדרשת התחברות.' }, 401)
    if (opts?.admin && !user?.isAdmin) return json({ error: 'אין לך הרשאה לפעולה הזו.' }, 403)
    const res = await handler({ method, path, query: url.searchParams, body, form }, match.slice(1))
    if (method !== 'GET') save(db)
    return res
  }
  return notFound()
}

/** Short pause per request, so loading states are seen as they would be against the real server. */
const latency = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 160))

/** The first home page after sign-in waits long enough for the loader to wind up and spin. */
let firstDashboard = true
const firstLoad = (path: string) => {
  if (!firstDashboard || !path.endsWith('/api/dashboard')) return null
  firstDashboard = false
  return new Promise((r) => setTimeout(r, 1600))
}

export function installMockServer() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.includes('/api/')) return realFetch(input, init)
    await (firstLoad(url.pathname) ?? latency())
    return dispatch((init?.method ?? 'GET').toUpperCase(), url, init)
  }
}

/**
 * For the few places the app points the browser straight at an API file (an `<img src>`, an
 * `<a href>`): the same file, read from the demo store.
 */
export async function demoFileUrl(path: string): Promise<string | null> {
  const res = await dispatch('GET', new URL(path, window.location.href))
  if (!res.ok) return null
  return URL.createObjectURL(await res.blob())
}
