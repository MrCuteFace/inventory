import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FoundCode } from './barcodeReader'
import { Icon } from './Icon'

// מצלמה חיה בדפדפן קיימת רק ב-https (או localhost). אחרת נופלים לצילום תמונה.
const liveSupported = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

/**
 * כפתור מצלמה ליד שדה מספר. בטאבלט נפתחת המצלמה האחורית בשידור חי, וכל ברקוד שנקלט מופיע
 * ברשימה; לחיצה עליו מכניסה את המספר לשדה. בחירה בלחיצה ולא אוטומטית, כי במדבקה יש לרוב כמה
 * ברקודים (דגם, סנטרלי, EAN…). כשאין מצלמה חיה אפשר לצלם תמונה והיא נסרקת באותו אופן.
 */
export function CameraScan({ onValue, what = 'מספר', className = '' }: {
  onValue: (text: string) => void
  what?: string
  className?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<{ live: true } | { codes: FoundCode[] } | { error: string } | null>(null)

  const takePhoto = () => { setSheet(null); fileRef.current?.click() }
  const pick = (t: string) => { onValue(t); setSheet(null) }

  const read = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      const { readCodes } = await import('./barcodeReader')
      const codes = await readCodes(f)
      if (codes.length === 1) onValue(codes[0].text)
      else if (codes.length) setSheet({ codes })
      else setSheet({ error: 'לא נמצא ברקוד בתמונה. צלמו שוב מקרוב, ישר מול המדבקה ובתאורה טובה.' })
    } catch {
      setSheet({ error: 'לא הצלחנו לקרוא את התמונה. נסו לצלם שוב.' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <button type="button" className={`icon-btn cam-btn ${className}`} disabled={busy} aria-busy={busy}
        aria-label={`סריקת ברקוד במצלמה: ${what}`} title="סריקת ברקוד במצלמה"
        onClick={() => (liveSupported() ? setSheet({ live: true }) : fileRef.current?.click())}>
        <Icon name={busy ? 'clock' : 'camera'} />
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => read(e.target.files?.[0])} />
      {sheet && (
        <Sheet label="סריקת ברקוד" live={'live' in sheet} onClose={() => setSheet(null)}>
          {'live' in sheet ? <LiveScan what={what} onPick={pick} onPhoto={takePhoto} onFail={error => setSheet({ error })} />
            : 'codes' in sheet ? <>
              <div className="scan-sheet-title">נמצאו {sheet.codes.length} ברקודים. איזה מהם הוא ה{what}?</div>
              <CodeList codes={sheet.codes} onPick={pick} />
              <div className="actions"><button type="button" className="btn" onClick={() => setSheet(null)}>ביטול</button></div>
            </> : <>
              <div className="scan-sheet-title" role="alert">{sheet.error}</div>
              <div className="actions">
                <button type="button" className="btn" onClick={() => setSheet(null)}>ביטול</button>
                <button type="button" className="btn" onClick={takePhoto}><Icon name="camera" />צילום תמונה</button>
              </div>
            </>}
        </Sheet>
      )}
    </>
  )
}

/** שידור חי מהמצלמה האחורית. מפענח פריים כל ~150ms ואוסף את הברקודים שנמצאו לרשימה. */
function LiveScan({ what, onPick, onPhoto, onFail }: {
  what: string; onPick: (t: string) => void; onPhoto: () => void; onFail: (error: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLCanvasElement>(null)
  const [codes, setCodes] = useState<FoundCode[]>([])
  const [ready, setReady] = useState(false)
  const failRef = useRef(onFail)
  failRef.current = onFail

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const frame = document.createElement('canvas')

    const loop = async (readCodes: (img: ImageData) => Promise<FoundCode[]>) => {
      const v = videoRef.current
      if (stopped || !v) return
      if (v.videoWidth) {
        frame.width = v.videoWidth; frame.height = v.videoHeight
        const g = frame.getContext('2d', { willReadFrequently: true })!
        g.drawImage(v, 0, 0)
        try {
          const found = await readCodes(g.getImageData(0, 0, frame.width, frame.height))
          if (stopped) return
          drawBoxes(boxRef.current, v, found)
          if (found.length) setCodes(cs => [...cs, ...found.filter(f => !cs.some(c => c.text === f.text))])
        } catch { /* פריים שלא פוענח, ממשיכים */ }
      }
      timer = window.setTimeout(() => loop(readCodes), 150)
    }

    ;(async () => {
      try {
        const [{ readCodes }, s] = await Promise.all([
          import('./barcodeReader'),
          navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }),
        ])
        stream = s
        if (stopped) return
        const v = videoRef.current!
        v.srcObject = s
        await v.play()
        setReady(true)
        loop(readCodes)
      } catch (e) {
        if (stopped) return
        const name = (e as DOMException)?.name
        failRef.current(name === 'NotAllowedError'
          ? 'אין הרשאה למצלמה. אשרו גישה למצלמה בהגדרות הדפדפן, או צלמו תמונה של המדבקה.'
          : name === 'NotFoundError' ? 'לא נמצאה מצלמה במכשיר. אפשר לבחור תמונה של המדבקה.'
          : 'לא הצלחנו להפעיל את המצלמה. אפשר לצלם תמונה של המדבקה במקום.')
      }
    })()

    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  return <>
    <div className="scan-live">
      <video ref={videoRef} muted playsInline aria-label="תצוגת מצלמה" />
      <canvas ref={boxRef} aria-hidden="true" />
      {!ready && <div className="scan-live-wait">מפעילים מצלמה…</div>}
    </div>
    <div className="scan-sheet-title" aria-live="polite">
      {codes.length ? `לחצו על ה${what}:` : 'כוונו את המצלמה לברקוד שעל המדבקה'}
    </div>
    {codes.length > 0 && <CodeList codes={codes} onPick={onPick} />}
    <div className="actions">
      <button type="button" className="btn" onClick={onPhoto}><Icon name="image" />צילום תמונה במקום</button>
    </div>
  </>
}

/** מסגרת סביב כל ברקוד שזוהה בפריים, מעל הווידאו. */
function drawBoxes(cv: HTMLCanvasElement | null, v: HTMLVideoElement, found: FoundCode[]) {
  if (!cv) return
  cv.width = v.clientWidth; cv.height = v.clientHeight
  const g = cv.getContext('2d')!
  // הווידאו מוצג ב-object-fit:contain, כך שייתכנו פסים בצדדים (טאבלט לאורך)
  const k = Math.min(cv.width / v.videoWidth, cv.height / v.videoHeight)
  const dx = (cv.width - v.videoWidth * k) / 2, dy = (cv.height - v.videoHeight * k) / 2
  g.clearRect(0, 0, cv.width, cv.height)
  g.lineWidth = 3; g.strokeStyle = '#F2B230'
  for (const { corners } of found) {
    g.beginPath()
    corners.forEach(([x, y], i) => (i ? g.lineTo(dx + x * k, dy + y * k) : g.moveTo(dx + x * k, dy + y * k)))
    g.closePath(); g.stroke()
  }
}

function CodeList({ codes, onPick }: { codes: FoundCode[]; onPick: (t: string) => void }) {
  return (
    <div className="scan-sheet-list">
      {codes.map(c => (
        <button key={c.text} type="button" onClick={() => onPick(c.text)}>
          <span className="mono">{c.text}</span><span className="muted">{c.format}</span>
        </button>
      ))}
    </div>
  )
}

function Sheet({ label, live, onClose, children }: { label: string; live: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    // Escape סוגר רק את החלונית, לא את החלון שמתחתיה
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); closeRef.current() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  return createPortal(
    <div className="scan-sheet-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`scan-sheet ${live ? 'is-live' : ''}`} role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <button type="button" className="icon-btn scan-sheet-x" onClick={onClose} aria-label="סגירה"><Icon name="x" /></button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
