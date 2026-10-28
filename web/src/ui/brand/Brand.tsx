import { useEffect, useId, useMemo, useRef } from 'react'
import { LOGO_POSE, drawLoaderFrame, drawSphere, sphereSvgBody } from './sphere'

/**
 * The demo mark: a purple puzzle sphere (see sphere.ts), drawn one twist away from solved. Its
 * own shading carries it on the petrol rail and on light pages alike, so there is one version.
 */
export function SphereMark({ size = 28 }: { size?: number }) {
  // Each copy gets its own gradient ids: the rail and the mobile top bar both render one.
  const id = `sphere${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const body = useMemo(() => sphereSvgBody(LOGO_POSE, 100, id), [id])
  return <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden focusable="false" dangerouslySetInnerHTML={{ __html: body }} />
}

/** Sphere and wordmark, for the rail and the login card. */
export function BrandLockup({ size = 44 }: { size?: number }) {
  return (
    <span className="brand-lockup">
      <SphereMark size={size} />
      <span className="brand-word" style={{ fontSize: size * 0.5 }}>קבוצת הדגמה</span>
    </span>
  )
}

/** The mark as a standalone SVG string, for generated PDFs. */
export const SPHERE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">${sphereSvgBody(LOGO_POSE, 100, 'pdfsphere')}</svg>`

/**
 * The loading indicator: the sphere winds up, spins hard the other way with motion blur and
 * settles. One still frame under reduced motion.
 */
export function LoadingSphere({ size = 88, label = 'טוען' }: { size?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawSphere(ctx, { ...LOGO_POSE, twists: [0, 0, 0] }, size)
      return
    }

    let frame = 0
    let prev = 0
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      drawLoaderFrame(ctx, elapsed, prev, size)
      prev = elapsed
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [size])

  return <canvas ref={ref} role="img" aria-label={label} style={{ width: size, height: size }} />
}
