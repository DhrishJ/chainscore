// Canvas-drawn surfaces for the instrument. Every printed mark on the dial
// is computed from the model's real parameters (score band 300 to 850, grade
// cutoffs from ml/model_meta.json, the backtest operating cutoff), so the
// object is a faithful drawing of the score scale, not a decoration.

import * as THREE from 'three'

export interface Fonts {
  sans: string
  mono: string
}

export interface ScaleSpec {
  min: number
  max: number
  /** Grade cutoffs: score >= cutoff earns the grade. */
  grades: { A: number; B: number; C: number; D: number }
  /** Operating cutoff used in the published backtest. */
  cutoff: number
  modelVersion: string
  featureCount: number
  groupCount: number
}

// Instrument sweep: 270 degrees, from bottom-left (300) clockwise over the
// top to bottom-right (850), like a panel gauge. Math angles, y up.
export const SWEEP_START = (225 * Math.PI) / 180
export const SWEEP = (270 * Math.PI) / 180

export function scoreToAngle(score: number, min: number, max: number): number {
  const t = Math.min(1, Math.max(0, (score - min) / (max - min)))
  return SWEEP_START - t * SWEEP
}

export const DIAL = {
  paper: '#F4F1EA',
  ink: '#161513',
  inkSoft: 'rgba(22,21,19,0.55)',
  accent: '#1A3CFF',
  accentSoft: '#7C90FF',
  danger: '#C2361F',
  ochre: '#A86F08',
  ochreSoft: '#D8A43C',
  // Grade B is the product's `success` tier (lib/site/scoreTier.ts).
  good: '#2F7D50',
}

export const SUBDIAL = {
  pd: { x: -0.4, y: -0.02, r: 0.155 },
  data: { x: 0.4, y: -0.02, r: 0.155 },
}

export const WINDOW = { x: 0, y: -0.455, w: 0.34, h: 0.14 }

/** Read the next/font family stacks from the CSS variables. */
export function resolveFonts(): Fonts {
  const cs = getComputedStyle(document.documentElement)
  return {
    sans: cs.getPropertyValue('--font-archivo').trim() || 'Arial, sans-serif',
    mono: cs.getPropertyValue('--font-plex-mono').trim() || 'ui-monospace, monospace',
  }
}

export async function loadFonts(f: Fonts): Promise<void> {
  if (!('fonts' in document)) return
  try {
    await Promise.all([
      document.fonts.load(`600 64px ${f.sans}`),
      document.fonts.load(`500 32px ${f.mono}`),
    ])
  } catch {
    // Fall back to whatever is available; the dial still draws.
  }
}

type Ctx = CanvasRenderingContext2D & { fontStretch?: string; letterSpacing?: string }

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d') as Ctx
  return [c, ctx]
}

/** Set a font with an optional width; returns a horizontal scale fallback. */
function setFont(ctx: Ctx, font: string, stretch: 'normal' | 'condensed' | 'expanded' = 'normal'): number {
  ctx.font = font
  if ('fontStretch' in ctx) {
    ctx.fontStretch = stretch === 'expanded' ? 'expanded' : stretch === 'condensed' ? 'condensed' : 'normal'
    return 1
  }
  return stretch === 'expanded' ? 1.18 : stretch === 'condensed' ? 0.86 : 1
}

/** Draw text with manual tracking (portable letter-spacing), centered. */
function tracked(ctx: Ctx, text: string, x: number, y: number, tracking: number, sx = 1) {
  const chars = [...text]
  const widths = chars.map((ch) => ctx.measureText(ch).width * sx)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1)
  let cx = x - total / 2
  ctx.save()
  ctx.textAlign = 'left'
  chars.forEach((ch, i) => {
    ctx.save()
    ctx.translate(cx, y)
    ctx.scale(sx, 1)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
    cx += widths[i] + tracking
  })
  ctx.restore()
}

function grain(ctx: Ctx, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  let seed = 1337
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 16807) % 2147483647
    const n = ((seed / 2147483647) - 0.5) * amount
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

function finishTexture(c: HTMLCanvasElement, renderer: THREE.WebGLRenderer, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * The main dial: chapter ring, 5-point minor ticks, numerals every 100,
 * the grade band at the real cutoffs, the operating-cutoff pip, two
 * sub-dials (log-scale probability of default, data completeness), the
 * odometer window surround, and the maker's marks.
 */
export function dialTexture(
  renderer: THREE.WebGLRenderer,
  fonts: Fonts,
  spec: ScaleSpec,
  size = 2048
): THREE.CanvasTexture {
  const [c, ctx] = canvas(size)
  const R = size / 2
  const P = (x: number, y: number): [number, number] => [R + x * R, R - y * R]
  const A = (s: number) => scoreToAngle(s, spec.min, spec.max)

  // Enamel ground with a faint centre-weighted falloff.
  const g = ctx.createRadialGradient(R, R * 0.92, R * 0.1, R, R, R)
  g.addColorStop(0, '#F7F5EF')
  g.addColorStop(0.75, DIAL.paper)
  g.addColorStop(1, '#E9E5DB')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  ctx.lineCap = 'butt'

  // Chapter ring.
  ctx.strokeStyle = DIAL.ink
  ctx.lineWidth = size * 0.0028
  ctx.beginPath()
  ctx.arc(R, R, R * 0.975, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = size * 0.0009
  ctx.beginPath()
  ctx.arc(R, R, R * 0.952, -A(spec.min), -A(spec.max))
  ctx.stroke()

  // Ticks: every 5 points minor, 25 medium, 50 major.
  for (let s = spec.min; s <= spec.max; s += 5) {
    const a = A(s)
    const major = s % 50 === 0 || s === spec.max
    const mid = !major && s % 25 === 0
    const r1 = major ? 0.858 : mid ? 0.885 : 0.905
    const r2 = 0.952
    ctx.lineWidth = size * (major ? 0.0052 : mid ? 0.003 : 0.0018)
    ctx.strokeStyle = DIAL.ink
    ctx.beginPath()
    ctx.moveTo(...P(Math.cos(a) * r1, Math.sin(a) * r1))
    ctx.lineTo(...P(Math.cos(a) * r2, Math.sin(a) * r2))
    ctx.stroke()
  }

  // Grade band, segmented at the real cutoffs.
  const bands: Array<[number, number, string, string]> = [
    [spec.min, spec.grades.D, DIAL.danger, 'F'],
    [spec.grades.D, spec.grades.C, DIAL.ochre, 'D'],
    [spec.grades.C, spec.grades.B, DIAL.ochreSoft, 'C'],
    [spec.grades.B, spec.grades.A, DIAL.good, 'B'],
    [spec.grades.A, spec.max, DIAL.accent, 'A'],
  ]
  const gap = 0.006
  ctx.lineWidth = R * 0.03
  bands.forEach(([a, b, color]) => {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(R, R, R * 0.825, -A(a) + gap, -A(b) - gap)
    ctx.stroke()
  })

  // Operating cutoff pip (the backtest threshold), ultramarine.
  {
    const a = A(spec.cutoff)
    const tip = P(Math.cos(a) * 0.848, Math.sin(a) * 0.848)
    const l = P(Math.cos(a + 0.022) * 0.792, Math.sin(a + 0.022) * 0.792)
    const r = P(Math.cos(a - 0.022) * 0.792, Math.sin(a - 0.022) * 0.792)
    ctx.fillStyle = DIAL.ink
    ctx.beginPath()
    ctx.moveTo(...tip)
    ctx.lineTo(...l)
    ctx.lineTo(...r)
    ctx.closePath()
    ctx.fill()
  }

  // Numerals, upright, every 100 plus the 850 end stop.
  ctx.fillStyle = DIAL.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const sxNum = setFont(ctx, `600 ${Math.round(R * 0.092)}px ${fonts.sans}`, 'condensed')
  const numerals = [300, 400, 500, 600, 700, 800, 850]
  numerals.forEach((s) => {
    const a = A(s)
    const rr = s === 850 ? 0.715 : 0.722
    const [x, y] = P(Math.cos(a) * rr, Math.sin(a) * rr)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(sxNum, 1)
    ctx.fillText(String(s), 0, 0)
    ctx.restore()
  })

  // Grade letters just inside the band.
  const sxG = setFont(ctx, `600 ${Math.round(R * 0.04)}px ${fonts.sans}`, 'expanded')
  bands.forEach(([a, b, color, letter]) => {
    const mid = A((a + b) / 2)
    const [x, y] = P(Math.cos(mid) * 0.625, Math.sin(mid) * 0.625)
    ctx.fillStyle = letter === 'C' ? DIAL.ochre : color
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(sxG, 1)
    ctx.fillText(letter, 0, 0)
    ctx.restore()
  })

  // Maker's marks.
  ctx.fillStyle = DIAL.ink
  setFont(ctx, `600 ${Math.round(R * 0.074)}px ${fonts.sans}`, 'normal')
  {
    const [x, y] = P(0, 0.395)
    tracked(ctx, 'ChainScore', x, y, -R * 0.002)
  }
  const sxE = setFont(ctx, `600 ${Math.round(R * 0.027)}px ${fonts.sans}`, 'expanded')
  {
    const [x, y] = P(0, 0.305)
    ctx.fillStyle = DIAL.inkSoft
    tracked(ctx, 'ONCHAIN CREDIT INSTRUMENT', x, y, R * 0.0075, sxE)
  }

  // Sub-dials.
  subDial(ctx, R, P, fonts, SUBDIAL.pd, {
    title: 'PD %',
    ticks: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20].map((v) => ({
      t: (Math.log10(v) + 1) / (Math.log10(20) + 1),
      major: v === 0.1 || v === 1 || v === 10,
      label: v === 0.1 ? '.1' : v === 1 ? '1' : v === 10 ? '10' : v === 20 ? '20' : null,
    })),
  })
  subDial(ctx, R, P, fonts, SUBDIAL.data, {
    title: 'DATA %',
    ticks: Array.from({ length: 11 }, (_, i) => ({
      t: i / 10,
      major: i % 5 === 0,
      label: i === 0 ? '0' : i === 5 ? '50' : i === 10 ? '100' : null,
    })),
  })

  // Odometer window surround and its plate label.
  {
    const [x0, y0] = P(WINDOW.x - WINDOW.w / 2 - 0.022, WINDOW.y + WINDOW.h / 2 + 0.022)
    const w = (WINDOW.w + 0.044) * R
    const h = (WINDOW.h + 0.044) * R
    ctx.strokeStyle = DIAL.ink
    ctx.lineWidth = size * 0.0012
    roundRect(ctx, x0, y0, w, h, R * 0.03)
    ctx.stroke()
    ctx.fillStyle = DIAL.inkSoft
    setFont(ctx, `600 ${Math.round(R * 0.024)}px ${fonts.sans}`, 'expanded')
    const [lx, ly] = P(0, WINDOW.y - WINDOW.h / 2 - 0.07)
    tracked(ctx, 'SCORE', lx, ly, R * 0.012, sxE)
  }

  // Fine print at six o'clock.
  ctx.fillStyle = DIAL.ink
  setFont(ctx, `500 ${Math.round(R * 0.026)}px ${fonts.mono}`)
  {
    const [x, y] = P(0, -0.705)
    tracked(ctx, `MODEL ${spec.modelVersion.toUpperCase()}`, x, y, R * 0.004)
  }
  ctx.fillStyle = DIAL.inkSoft
  setFont(ctx, `400 ${Math.round(R * 0.021)}px ${fonts.mono}`)
  {
    const [x, y] = P(0, -0.765)
    tracked(ctx, `${spec.featureCount} FEATURES / ${spec.groupCount} GROUPS`, x, y, R * 0.004)
  }

  grain(ctx, size, size, 7)
  return finishTexture(c, renderer)
}

function subDial(
  ctx: Ctx,
  R: number,
  P: (x: number, y: number) => [number, number],
  fonts: Fonts,
  at: { x: number; y: number; r: number },
  spec: { title: string; ticks: Array<{ t: number; major: boolean; label: string | null }> }
) {
  const [cx, cy] = P(at.x, at.y)
  const rr = at.r * R

  // Snailed finish: fine concentric grooves, the watchmaker's sub-dial.
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, rr, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#ECE8DE'
  ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
  for (let r = 2; r < rr; r += 3.2) {
    ctx.strokeStyle = (r / 3.2) % 2 < 1 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()

  ctx.strokeStyle = DIAL.ink
  ctx.lineWidth = R * 0.003
  ctx.beginPath()
  ctx.arc(cx, cy, rr, 0, Math.PI * 2)
  ctx.stroke()

  // Same 270 degree sweep as the main scale.
  const ang = (t: number) => SWEEP_START - t * SWEEP
  spec.ticks.forEach(({ t, major, label }) => {
    const a = ang(t)
    const r1 = major ? 0.74 : 0.82
    ctx.lineWidth = R * (major ? 0.0034 : 0.0018)
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * rr * r1, cy - Math.sin(a) * rr * r1)
    ctx.lineTo(cx + Math.cos(a) * rr * 0.95, cy - Math.sin(a) * rr * 0.95)
    ctx.stroke()
    if (label) {
      ctx.fillStyle = DIAL.ink
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      setFont(ctx, `500 ${Math.round(R * 0.025)}px ${fonts.mono}`)
      ctx.fillText(label, cx + Math.cos(a) * rr * 0.55, cy - Math.sin(a) * rr * 0.55)
    }
  })
  ctx.fillStyle = DIAL.inkSoft
  const sx = setFont(ctx, `600 ${Math.round(R * 0.019)}px ${fonts.sans}`, 'expanded')
  tracked(ctx, spec.title, cx, cy + rr * 0.5, R * 0.005, sx)
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/**
 * Odometer drum strip: ten digits around the circumference. The canvas x
 * axis wraps the drum (CylinderGeometry u), so each glyph is drawn rotated
 * to read upright once the drum's axis lies horizontal.
 */
export function drumTexture(renderer: THREE.WebGLRenderer, fonts: Fonts): THREE.CanvasTexture {
  const W = 1280
  const H = 160
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = '#131312'
  ctx.fillRect(0, 0, W, H)
  const cell = W / 10
  ctx.fillStyle = '#F2EFE8'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 ${Math.round(cell * 0.9)}px ${fonts.mono}`
  // Digit d lives in cell 9 - d so that increasing values roll upward,
  // the next digit arriving from below as on a mechanical counter.
  for (let d = 0; d < 10; d++) {
    ctx.save()
    ctx.translate(cell * (9 - d) + cell / 2, H / 2)
    ctx.rotate(Math.PI / 2)
    ctx.fillText(String(d), 0, cell * 0.04)
    ctx.restore()
  }
  // Hairlines between digits, like printed drum stock.
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  for (let d = 0; d <= 10; d++) {
    ctx.beginPath()
    ctx.moveTo(cell * d, 0)
    ctx.lineTo(cell * d, H)
    ctx.stroke()
  }
  return finishTexture(c, renderer)
}

/** Engraved case back: the maker's plate you only see when it turns. */
export function caseBackTexture(
  renderer: THREE.WebGLRenderer,
  fonts: Fonts,
  spec: ScaleSpec,
  size = 1024
): THREE.CanvasTexture {
  const [c, ctx] = canvas(size)
  const R = size / 2
  const g = ctx.createRadialGradient(R, R, 0, R, R, R)
  g.addColorStop(0, '#3a3936')
  g.addColorStop(1, '#2a2927')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // Turned finish: dense concentric rings.
  for (let r = 4; r < R; r += 2.2) {
    ctx.strokeStyle = (r / 2.2) % 2 < 1 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.arc(R, R, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(232,228,218,0.82)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const ring = `CHAINSCORE  ·  CS-1  ·  ONCHAIN CREDIT INSTRUMENT  ·  MODEL ${spec.modelVersion.toUpperCase()}  ·  ${spec.min} TO ${spec.max}  ·  `
  ctx.font = `500 ${Math.round(R * 0.05)}px ${fonts.mono}`
  const chars = [...ring]
  const step = (Math.PI * 2) / chars.length
  chars.forEach((ch, i) => {
    const a = -Math.PI / 2 + i * step
    ctx.save()
    ctx.translate(R + Math.cos(a) * R * 0.78, R + Math.sin(a) * R * 0.78)
    ctx.rotate(a + Math.PI / 2)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
  })

  const sx = setFont(ctx, `600 ${Math.round(R * 0.07)}px ${fonts.sans}`, 'expanded')
  tracked(ctx, 'CALIBRATED', R, R - R * 0.09, R * 0.02, sx)
  tracked(ctx, 'IN THE OPEN', R, R + R * 0.02, R * 0.02, sx)
  ctx.font = `400 ${Math.round(R * 0.042)}px ${fonts.mono}`
  ctx.fillStyle = 'rgba(232,228,218,0.6)'
  tracked(ctx, `${spec.featureCount} FEATURES / ${spec.groupCount} FACTOR GROUPS`, R, R + R * 0.16, R * 0.006)
  tracked(ctx, 'CHAINSCORE.DEV', R, R + R * 0.26, R * 0.012)
  return finishTexture(c, renderer)
}

/** Perlage: the overlapping circular graining on a watch movement plate. */
export function perlageTexture(renderer: THREE.WebGLRenderer, size = 1024): THREE.CanvasTexture {
  const [c, ctx] = canvas(size)
  ctx.fillStyle = '#b9975a'
  ctx.fillRect(0, 0, size, size)
  const step = size / 46
  const rad = step * 0.86
  const hasConic = typeof ctx.createConicGradient === 'function'
  for (let row = -1; row < 54; row++) {
    for (let col = -1; col < 48; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0)
      const y = row * step * 0.88
      let fill: CanvasGradient
      if (hasConic) {
        fill = ctx.createConicGradient((row * 7 + col * 3) % 6, x, y)
        for (let k = 0; k <= 8; k++) {
          fill.addColorStop(k / 8, k % 2 ? 'rgba(255,242,212,0.16)' : 'rgba(92,66,22,0.12)')
        }
      } else {
        fill = ctx.createRadialGradient(x, y, 0, x, y, rad)
        fill.addColorStop(0, 'rgba(255,240,205,0.3)')
        fill.addColorStop(1, 'rgba(80,58,20,0.2)')
      }
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const tex = finishTexture(c, renderer)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}
