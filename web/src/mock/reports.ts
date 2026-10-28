/**
 * Report files for the static demo, made in the browser: the Excel exports (ExcelJS, styled like the
 * server's ExcelReport), the PDFs (an HTML page rendered to a PDF, so Hebrew right-to-left text
 * comes out as the browser draws it), and reading an employee list from Excel for the import.
 * Loaded only when one of them is asked for.
 */
import ExcelJS from 'exceljs'
import { STATUS_LABEL } from '../format'
import type { AssetRowData, ByCategoryRow, DisposalRow } from './server'
import { SPHERE_SVG } from '../ui/brand/Brand'

const SHELL = '0E3A38'
const INK2 = '465552'
const LINE = 'D3DBD8'
const STRIPE = 'F2F5F4'
const TOTAL = 'DCEFEA'
const MONEY = '#,##0.00'
const DATE = 'dd/mm/yyyy'
const HEAD_ROW = 4
const FIRST_ROW = HEAD_ROW + 1

const made = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `הופק ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const asDate = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } })

/** One sheet with the shared layout: title, subtitle, coloured header row, frozen header, landscape A4. */
function sheet(wb: ExcelJS.Workbook, name: string, title: string, subtitle: string, head: string[]) {
  const ws = wb.addWorksheet(name.replace(/[:\\/?*[\]]/g, '').slice(0, 31) || 'דו"ח', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: HEAD_ROW }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEAD_ROW}:${HEAD_ROW}` },
  })
  ws.properties.defaultRowHeight = 18
  const cols = head.length
  ws.mergeCells(1, 1, 1, cols)
  ws.getCell(1, 1).value = title
  ws.getCell(1, 1).font = { name: 'Arial', size: 18, bold: true, color: { argb: `FF${SHELL}` } }
  ws.getCell(1, 1).alignment = { horizontal: 'right' }
  ws.getRow(1).height = 30
  ws.mergeCells(2, 1, 2, cols)
  ws.getCell(2, 1).value = subtitle
  ws.getCell(2, 1).font = { name: 'Arial', size: 10, color: { argb: `FF${INK2}` } }
  ws.getCell(2, 1).alignment = { horizontal: 'right' }
  head.forEach((h, i) => {
    const c = ws.getCell(HEAD_ROW, i + 1)
    c.value = h
    c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = fill(SHELL)
    c.alignment = { vertical: 'middle' }
  })
  ws.getRow(HEAD_ROW).height = 24

  const totals = new Set<number>()
  return {
    ws,
    markTotal(row: number) {
      totals.add(row)
      for (let i = 1; i <= cols; i++) { const c = ws.getCell(row, i); c.font = { name: 'Arial', bold: true }; c.fill = fill(TOTAL) }
    },
    /** Stripes, borders, filter and column widths; lastRow is the table's last row. */
    finish(lastRow: number, filter = true) {
      if (lastRow < FIRST_ROW) {
        ws.mergeCells(FIRST_ROW, 1, FIRST_ROW, cols)
        ws.getCell(FIRST_ROW, 1).value = 'אין נתונים להצגה'
        ws.getCell(FIRST_ROW, 1).font = { name: 'Arial', color: { argb: `FF${INK2}` } }
        lastRow = FIRST_ROW
      } else {
        for (let r = FIRST_ROW; r <= lastRow; r++) {
          if ((r - FIRST_ROW) % 2 === 1 && !totals.has(r)) for (let i = 1; i <= cols; i++) ws.getCell(r, i).fill = fill(STRIPE)
        }
        if (filter) ws.autoFilter = { from: { row: HEAD_ROW, column: 1 }, to: { row: lastRow, column: cols } }
      }
      const border = { style: 'thin' as const, color: { argb: `FF${LINE}` } }
      for (let r = HEAD_ROW; r <= lastRow; r++) {
        for (let i = 1; i <= cols; i++) {
          const c = ws.getCell(r, i)
          c.border = { top: border, bottom: border, left: border, right: border }
        }
      }
      for (let i = 1; i <= cols; i++) {
        let width = 10
        for (let r = HEAD_ROW; r <= lastRow; r++) {
          const v = ws.getCell(r, i).value
          const text = v instanceof Date ? '00/00/0000' : v == null ? '' : String(v)
          width = Math.max(width, text.length + 3)
        }
        ws.getColumn(i).width = Math.min(50, width)
      }
    },
  }
}

const toBlob = async (wb: ExcelJS.Workbook) =>
  new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

export async function disposalsWorkbook(month: string, list: DisposalRow[]) {
  const [y, m] = month.split('-')
  const wb = new ExcelJS.Workbook()
  const head = ['תאריך גריעה', 'מספר נכס', 'מספר סנטרלי', 'פריט', 'קטגוריה', 'סיבה', 'פירוט', 'חשבונית מקורית', 'ספק', 'תאריך רכישה', 'שווי (₪, ללא מע"מ)', 'הוחזר למחסן', 'עובד קודם', 'אושר ע"י']
  // The line starts with a word, not a number: otherwise right-to-left Excel moves the number to the end.
  const x = sheet(wb, `גריעות ${m}-${y}`, `דו"ח גריעות ${m}/${y}`,
    `נגרעו ${list.length} פריטים, מהם ${list.filter((i) => !i.returnedToWarehouse).length} לא הוחזרו למחסן · ${made()}`, head)
  let r = FIRST_ROW
  for (const d of list) {
    const values = [asDate(d.disposedAt), d.assetTag, d.serialNumber, d.model, d.subCategory, d.reason, d.description ?? '', d.invoiceNumber, d.supplierName,
      asDate(d.purchaseDate), d.price, d.returnedToWarehouse ? 'כן' : 'לא - חסר במלאי', d.previousEmployee ?? '', d.approver]
    values.forEach((v, i) => { x.ws.getCell(r, i + 1).value = v })
    x.ws.getCell(r, 1).numFmt = DATE
    x.ws.getCell(r, 10).numFmt = DATE
    x.ws.getCell(r, 11).numFmt = MONEY
    r++
  }
  if (list.length) {
    x.ws.getCell(r, 10).value = 'סה"כ'
    x.ws.getCell(r, 11).value = list.reduce((n, d) => n + d.price, 0)
    x.ws.getCell(r, 11).numFmt = MONEY
    x.markTotal(r)
    r++
  }
  x.finish(r - 1, false)
  return toBlob(wb)
}

export async function subCategoryWorkbook(name: string, category: string, rows: AssetRowData[], active: number) {
  const wb = new ExcelJS.Workbook()
  const head = ['מספר נכס', 'מספר סנטרלי', 'דגם', 'סטטוס', 'משויך ל', 'תאריך מסירה', 'חתימה', 'ספק', 'חשבונית', 'תאריך רכישה', 'תום אחריות', 'מחיר (₪, ללא מע"מ)', 'עבור חברה']
  const x = sheet(wb, name, name, `${category} · ${active} פריטים פעילים · ${made()}`, head)
  let r = FIRST_ROW
  for (const a of rows) {
    const values = [a.assetTag, a.serialNumber, a.model, STATUS_LABEL[a.status as keyof typeof STATUS_LABEL], a.employeeName ?? '',
      a.deliveredAt ? asDate(a.deliveredAt) : '', a.employeeId === null ? '' : a.signed ? 'חתום' : 'ממתין', a.supplierName, a.invoiceNumber,
      asDate(a.purchaseDate), asDate(a.warrantyEnd), a.price, a.companyName ?? '']
    values.forEach((v, i) => { x.ws.getCell(r, i + 1).value = v })
    for (const c of [6, 10, 11]) x.ws.getCell(r, c).numFmt = DATE
    x.ws.getCell(r, 12).numFmt = MONEY
    if (a.status === 'scrapped') for (let i = 1; i <= head.length; i++) x.ws.getCell(r, i).font = { name: 'Arial', color: { argb: 'FF8A9592' } }
    r++
  }
  x.finish(r - 1)
  return toBlob(wb)
}

const BY_CATEGORY_HEAD = ['קטגוריה', 'תת קטגוריה', 'כמות', 'במלאי', 'בשימוש', 'ממתין לחתימה', 'בתיקון', 'נגרעו', 'שווי (₪, ללא מע"מ)']

export async function byCategoryWorkbook(rows: ByCategoryRow[], active: number) {
  const wb = new ExcelJS.Workbook()
  const x = sheet(wb, 'ציוד לפי קטגוריה', 'ציוד לפי קטגוריה', `פריטים פעילים בכל הקבוצה: ${active} · ${made()}`, BY_CATEGORY_HEAD)
  let r = FIRST_ROW
  for (const row of rows) {
    const k = row.counts
    ;[row.category, row.subCategory, k.active, k.available, k.inUse, k.pending, k.repair, k.scrapped, k.value]
      .forEach((v, i) => { x.ws.getCell(r, i + 1).value = v })
    x.ws.getCell(r, 9).numFmt = MONEY
    if (row.kind !== 'line') x.markTotal(r)
    if (row.kind === 'grand') for (let i = 1; i <= 9; i++) x.ws.getCell(r, i).border = { top: { style: 'medium', color: { argb: `FF${LINE}` } } }
    r++
  }
  x.finish(r - 1, false)
  return toBlob(wb)
}

/* ------------------------------------------------------------------- PDFs */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Renders an HTML page off screen and returns it as a one-page PDF. */
async function htmlToPdf(html: string, landscape: boolean): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const width = landscape ? 1123 : 794
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;background:#fff`
  host.innerHTML = html
  document.body.appendChild(host)
  try {
    await document.fonts?.ready
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: '#ffffff', width, windowWidth: width })
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
    const pw = pdf.internal.pageSize.getWidth()
    const ph = (canvas.height * pw) / canvas.width
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph)
    return pdf.output('blob')
  } finally {
    host.remove()
  }
}

const PDF_STYLE = `
  <style>
    .pdf{direction:rtl;font-family:Assistant,Arial,sans-serif;color:#1d2a28;padding:36px 40px;font-size:13px}
    .pdf header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #${SHELL};padding-bottom:12px;margin-bottom:16px}
    .pdf h1{margin:0;font-size:24px;color:#${SHELL}}
    .pdf .sub{color:#${INK2};font-size:11px;margin-top:2px}
    .pdf table{width:100%;border-collapse:collapse}
    .pdf th{background:#${SHELL};color:#fff;padding:8px 6px;font-weight:700}
    .pdf td{padding:6px;border-bottom:1px solid #${LINE}}
    .pdf td.n,.pdf th.n{text-align:center}
    .pdf tr.stripe td{background:#${STRIPE}}
    .pdf tr.total td{background:#${TOTAL};font-weight:700}
    .pdf tr.grand td{border-top:2px solid #${LINE}}
    .pdf footer{display:flex;justify-content:space-between;color:#${INK2};font-size:10px;margin-top:18px}
  </style>`

const mark = `<span style="display:inline-block;width:46px;height:46px">${SPHERE_SVG}</span>`

export async function byCategoryPdf(rows: ByCategoryRow[], active: number) {
  let n = 0
  const body = rows.map((r) => {
    const total = r.kind !== 'line'
    const cls = total ? `total${r.kind === 'grand' ? ' grand' : ''}` : n++ % 2 === 1 ? 'stripe' : ''
    if (total) n = 0
    const k = r.counts
    return `<tr class="${cls}"><td>${esc(r.category)}</td><td>${esc(r.subCategory)}</td>${[k.active, k.available, k.inUse, k.pending, k.repair, k.scrapped].map((v) => `<td class="n">${v}</td>`).join('')}<td class="n">${money(k.value)}</td></tr>`
  }).join('')
  const html = `${PDF_STYLE}<div class="pdf">
    <header>${mark}<div><h1>ציוד לפי קטגוריה</h1><div class="sub">פריטים פעילים בכל הקבוצה: ${active} · ${made()}</div></div></header>
    <table><thead><tr>${BY_CATEGORY_HEAD.map((h, i) => `<th class="${i < 2 ? '' : 'n'}" style="text-align:${i < 2 ? 'right' : 'center'}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
    <footer><span>מערכת ניהול מלאי ורכוש קבוע · קבוצת הדגמה</span><span>עמוד 1 מתוך 1</span></footer></div>`
  return htmlToPdf(html, true)
}

/** A stand-in supplier invoice for purchases seeded with a file: the demo has no real ones to show. */
export async function sampleInvoicePdf(d: { invoiceNumber: string; supplier: string; date: string; company: string; item: string; count: number; unitPrice: number }) {
  const [y, m, day] = d.date.split('-')
  const total = d.unitPrice * d.count
  const html = `${PDF_STYLE}<div class="pdf" style="padding:56px 60px">
    <header style="justify-content:space-between"><div><h1>${esc(d.supplier)}</h1><div class="sub">חשבונית מס לדוגמה · מסמך הדגמה, לא מסמך אמיתי</div></div>
      <div style="text-align:left"><div style="font-size:20px;font-weight:700">חשבונית ${esc(d.invoiceNumber)}</div><div class="sub">${day}/${m}/${y}</div></div></header>
    <p style="margin:0 0 18px">לכבוד: <b>${esc(d.company)}</b></p>
    <table><thead><tr><th style="text-align:right">פריט</th><th class="n">כמות</th><th class="n">מחיר ליחידה</th><th class="n">סה"כ</th></tr></thead>
      <tbody><tr><td>${esc(d.item)}</td><td class="n">${d.count}</td><td class="n">₪ ${money(d.unitPrice)}</td><td class="n">₪ ${money(total)}</td></tr>
      <tr class="stripe"><td colspan="3">מע"מ 18%</td><td class="n">₪ ${money(total * 0.18)}</td></tr>
      <tr class="total grand"><td colspan="3">סה"כ לתשלום</td><td class="n">₪ ${money(total * 1.18)}</td></tr></tbody></table>
    <p class="sub" style="margin-top:40px">כל הפרטים במסמך זה מומצאים לצורך הדגמה.</p></div>`
  return htmlToPdf(html, false)
}

/* ------------------------------------------------------- employee import */

export type ImportRow = { number: number | null; fullName: string; department: string | null }

/**
 * Reads an employee list: finds a header row (within the first ten) that has a name column, then reads
 * only employee number, name and department. Every other column is ignored.
 */
export async function readEmployeeSheet(file: Blob): Promise<[ImportRow[], string | null]> {
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(await file.arrayBuffer()) } catch { return [[], 'הקובץ אינו קובץ Excel תקין (xlsx).'] }
  const norm = (s: string) => s.replace(/["״]/g, '').trim()
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
  const text = (c: ExcelJS.Cell) => (c.value == null ? '' : typeof c.value === 'object' && 'text' in c.value ? String(c.value.text) : String(c.text ?? c.value))

  for (const ws of wb.worksheets) {
    for (let h = 1; h <= Math.min(10, ws.rowCount); h++) {
      const cols = new Map<string, number>()
      ws.getRow(h).eachCell((c, i) => { const k = norm(text(c)); if (k && !cols.has(k)) cols.set(k, i) })
      const col = (...names: string[]) => names.map(norm).map((n) => cols.get(n)).find((v) => v !== undefined)
      const first = col('שם פרטי')
      const last = col('שם משפחה')
      const full = col('שם מלא', 'שם העובד', 'שם')
      if (first === undefined && full === undefined) continue
      const number = col('מספר עובד', "מס' עובד", 'מס עובד', 'קוד עובד')
      const dept = col('מחלקה', 'שם מחלקה')

      const rows: ImportRow[] = []
      for (let r = h + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r)
        const name = clean(full !== undefined && first === undefined
          ? text(row.getCell(full))
          : `${text(row.getCell(first!))} ${last === undefined ? '' : text(row.getCell(last))}`)
        if (!name) continue
        const n = number === undefined ? NaN : parseInt(text(row.getCell(number)).trim(), 10)
        const d = dept === undefined ? '' : clean(text(row.getCell(dept)))
        rows.push({ number: n > 0 ? n : null, fullName: name.slice(0, 100), department: d ? d.slice(0, 100) : null })
      }
      return rows.length ? [rows, null] : [[], 'לא נמצאו עובדים מתחת לשורת הכותרות.']
    }
  }
  return [[], 'לא נמצאה עמודת שם. צריך כותרות כמו "שם פרטי" ו"שם משפחה" (או "שם מלא"), ורצוי גם "מספר עובד" ו"מחלקה".']
}
