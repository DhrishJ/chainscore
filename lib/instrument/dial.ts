// The printed parts of the instrument: the dial face (scale, grade bands,
// cutoff mark, maker's name) and the NO HISTORY flag. Drawn to canvases at
// runtime from the model's real score band and grade cutoffs, so the dial
// can never disagree with ml/model_meta.json.

export interface ScaleSpec {
  min: number
  max: number
  grades: { A: number; B: number; C: number; D: number }
  cutoff: number
  modelVersion: string
}

// The scale sweeps 270 degrees clockwise, from 7:30 (min) to 4:30 (max).
export const SWEEP = (Math.PI * 3) / 2
export const START = (Math.PI * 5) / 4

/** Dial-space angle (radians, CCW from +x) for a score. */
export function scoreToAngle(score: number, spec: ScaleSpec): number {
  const t = (score - spec.min) / (spec.max - spec.min)
  return START - t * SWEEP
}

/** Where the needle rests with no reading: on its stop, below the minimum. */
export function restAngle(): number {
  return START + 0.045 * SWEEP
}

export const TEX = 2048
// Texture radius in pixels that maps to the dial edge (dial radius 0.97).
const R = TEX * 0.5

export interface Palette {
  print: string
  muted: string
  ruby: string
  amber: string
  green: string
}

export const PALETTE: Palette = {
  print: '#ECEAE5',
  muted: 'rgba(236,234,229,0.55)',
  ruby: '#E95C68',
  amber: '#E2B460',
  green: '#7EC89C',
}

function polar(r: number, a: number): [number, number] {
  // canvas y grows downward; dial angles are CCW with y up
  return [R + r * Math.cos(a), R - r * Math.sin(a)]
}

function arc(ctx: CanvasRenderingContext2D, r: number, a0: number, a1: number) {
  // a0 > a1 for clockwise sweeps in dial space; canvas arc takes angles
  // measured clockwise from +x, i.e. the negation of ours.
  ctx.beginPath()
  ctx.arc(R, R, r, -a0, -a1, false)
}

/** The print layer (transparent background), for the face mesh. */
export function drawDial(spec: ScaleSpec, font: string, palette: Palette = PALETTE): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  const ctx = c.getContext('2d')!
  ctx.lineCap = 'butt'

  const rTickOut = R * 0.86
  const rMinorIn = R * 0.815
  const rMajorIn = R * 0.775
  const rNum = R * 0.685
  const rBand = R * 0.9
  const rBandLetters = R * 0.945

  // minor ticks every 10 points, major every 50
  for (let s = spec.min; s <= spec.max; s += 10) {
    const a = scoreToAngle(s, spec)
    const major = s % 50 === 0
    const [x0, y0] = polar(major ? rMajorIn : rMinorIn, a)
    const [x1, y1] = polar(rTickOut, a)
    ctx.strokeStyle = major ? palette.print : palette.muted
    ctx.lineWidth = major ? 8 : 3.2
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }

  // numerals, upright
  ctx.fillStyle = palette.print
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 ${Math.round(R * 0.088)}px ${font}`
  for (let s = spec.min; s <= spec.max; s += 50) {
    const [x, y] = polar(rNum, scoreToAngle(s, spec))
    ctx.fillText(String(s), x, y + R * 0.004)
  }

  // grade bands just outside the ticks, from the model's cutoffs
  const bands: Array<{ g: string; from: number; to: number; color: string }> = [
    { g: 'F', from: spec.min, to: spec.grades.D, color: palette.ruby },
    { g: 'D', from: spec.grades.D, to: spec.grades.C, color: palette.amber },
    { g: 'C', from: spec.grades.C, to: spec.grades.B, color: palette.amber },
    { g: 'B', from: spec.grades.B, to: spec.grades.A, color: palette.green },
    { g: 'A', from: spec.grades.A, to: spec.max, color: palette.print },
  ]
  const gap = 0.006
  ctx.lineWidth = R * 0.016
  ctx.font = `600 ${Math.round(R * 0.042)}px ${font}`
  for (const b of bands) {
    const a0 = scoreToAngle(b.from, spec) - gap
    const a1 = scoreToAngle(b.to, spec) + gap
    ctx.strokeStyle = b.color
    ctx.globalAlpha = b.g === 'C' ? 0.75 : b.g === 'D' ? 0.55 : 0.9
    arc(ctx, rBand, a0, a1)
    ctx.stroke()
    ctx.globalAlpha = 1
    const [x, y] = polar(rBandLetters, (a0 + a1) / 2)
    ctx.fillStyle = palette.muted
    ctx.fillText(b.g, x, y)
  }

  // the operating cutoff: a small ruby wedge pointing in, and its value
  {
    const a = scoreToAngle(spec.cutoff, spec)
    const [tx, ty] = polar(R * 0.87, a)
    const [lx, ly] = polar(R * 0.925, a + 0.03)
    const [rx, ry] = polar(R * 0.925, a - 0.03)
    ctx.fillStyle = palette.ruby
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(lx, ly)
    ctx.lineTo(rx, ry)
    ctx.closePath()
    ctx.fill()
  }

  // maker's name and the reading's units
  ctx.fillStyle = palette.print
  ctx.font = `600 ${Math.round(R * 0.078)}px ${font}`
  ctx.fillText('ChainScore', R, R - R * 0.33)
  ctx.fillStyle = palette.muted
  ctx.font = `400 ${Math.round(R * 0.042)}px ${font}`
  ctx.fillText(`Credit score  ${spec.min} to ${spec.max}`, R, R - R * 0.235)
  ctx.fillText(`Model ${spec.modelVersion}`, R, R + R * 0.62)

  // the flag window frame at six o'clock (the aperture itself is cut in
  // the dial mesh; this is its printed surround)
  const w = R * 0.36
  const h = R * 0.115
  ctx.strokeStyle = palette.muted
  ctx.lineWidth = 3
  ctx.strokeRect(R - w / 2 - 6, R + R * 0.36 - h / 2 - 6, w + 12, h + 12)

  return c
}

/** Radial brushing directions for the sunray dial (anisotropyMap). */
export function drawSunray(size = 512): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = 0.5 - (y + 0.5) / size
      const len = Math.hypot(dx, dy) || 1
      // tangent-space direction of the brushing: radial
      const i = (y * size + x) * 4
      img.data[i] = Math.round((dx / len) * 127.5 + 127.5)
      img.data[i + 1] = Math.round((dy / len) * 127.5 + 127.5)
      img.data[i + 2] = 255 // full strength
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** The NO HISTORY flag: diagonal ruby and dark stripes behind the label. */
export function drawFlag(font: string, palette: Palette = PALETTE): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 320
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1a1a1c'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, c.width, c.height)
  ctx.clip()
  ctx.fillStyle = palette.ruby
  for (let x = -c.height; x < c.width + c.height; x += 120) {
    ctx.beginPath()
    ctx.moveTo(x, c.height)
    ctx.lineTo(x + 60, c.height)
    ctx.lineTo(x + 60 + c.height, 0)
    ctx.lineTo(x + c.height, 0)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  // label plate
  ctx.fillStyle = '#ECEAE5'
  ctx.fillRect(c.width * 0.14, c.height * 0.2, c.width * 0.72, c.height * 0.6)
  ctx.fillStyle = '#111112'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.round(c.height * 0.3)}px ${font}`
  ctx.fillText('NO HISTORY', c.width / 2, c.height / 2 + 4)
  return c
}

/** A soft needle shadow, drawn once and rotated with the needle. */
export function drawNeedleShadow(size = 512): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.filter = `blur(${Math.round(size * 0.012)}px)`
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  const cx = size * 0.5
  const cy = size * 0.5
  const L = size * 0.41
  ctx.beginPath()
  ctx.moveTo(cx - size * 0.1, cy - size * 0.012)
  ctx.lineTo(cx + L, cy - size * 0.003)
  ctx.lineTo(cx + L, cy + size * 0.003)
  ctx.lineTo(cx - size * 0.1, cy + size * 0.012)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.04, 0, Math.PI * 2)
  ctx.fill()
  return c
}
