import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// קובץ ה-wasm נארז עם האתר ונטען ממנו (ברירת המחדל של הספרייה היא CDN, והשרת ברשת הפנימית).
prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })

export type FoundCode = { text: string; format: string; corners: [number, number][] }

/** כל הברקודים בתמונה או בפריים, בלי כפילויות, לפי סדר הופעתם מלמעלה למטה. */
export async function readCodes(image: Blob | ImageData): Promise<FoundCode[]> {
  const results = await readBarcodes(image, { tryHarder: true, maxNumberOfSymbols: 20 })
  const seen = new Set<string>()
  return results
    .filter(r => r.isValid && r.text.trim())
    .sort((a, b) => a.position.topLeft.y - b.position.topLeft.y || a.position.topLeft.x - b.position.topLeft.x)
    .filter(r => !seen.has(r.text) && !!seen.add(r.text))
    .map(({ text, format, position: p }) => ({
      text: text.trim(), format,
      corners: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map(c => [c.x, c.y] as [number, number]),
    }))
}
