// The mechanism behind the dial, seen through the sapphire caseback.
//
// One wheel for each of the model's four factor groups, sized by the
// group's weight in the score (a wheel's tooth count is its weight in
// percent: 30, 25, 23, 22), all meshing with a centre wheel. Around them,
// the parts that make a movement run: the barrel and its ratchet, the
// escape wheel, the pallet fork and a balance with a breathing hairspring.
// The balance swings at 3 Hz and the escape wheel steps half a tooth per
// beat; the train turns slowly on its own and further as the page scrolls.
//
// Built in movement space: x right and y up as seen from behind, +z toward
// that viewer. The stage turns the group to face the back of the case.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface FactorWeight {
  name: string
  weight: number
}

export interface MovementAnchor {
  key: string
  label: string
  /** Movement-space side, for placing a label away from the centre. */
  side: 'left' | 'right'
  object: THREE.Object3D
}

export interface Movement {
  group: THREE.Group
  anchors: MovementAnchor[]
  /** Unit normal of the movement face, in group space. */
  normal: THREE.Vector3
  update: (time: number, spin: number, still: boolean) => void
}

const TAU = Math.PI * 2
const MODULE = 0.014 // tooth size shared by every wheel that meshes

const PLATE_Z = -0.04
const WHEEL_Z = 0
const BRIDGE_Z = 0.055
const BRIDGE_T = 0.03
const TOP_Z = BRIDGE_Z + BRIDGE_T

type ToothStyle = 'gear' | 'escape' | 'ratchet'

/** Outline of a toothed wheel with spoke windows cut between rim and hub. */
function wheelShape(teeth: number, module: number, style: ToothStyle, spokes: number): THREE.Shape {
  const r = (teeth * module) / 2
  const tip = r + module * (style === 'ratchet' ? 0.75 : 0.95)
  const root = r - module * (style === 'ratchet' ? 0.85 : 1.2)
  const p = TAU / teeth
  const s = new THREE.Shape()
  let first = true
  const at = (a: number, rr: number) => {
    const x = Math.cos(a) * rr
    const y = Math.sin(a) * rr
    if (first) {
      s.moveTo(x, y)
      first = false
    } else s.lineTo(x, y)
  }
  for (let k = 0; k < teeth; k++) {
    const c = k * p
    if (style === 'gear') {
      // ogival watch teeth, centred on c
      at(c - 0.5 * p, root)
      at(c - 0.3 * p, root)
      at(c - 0.21 * p, r)
      at(c - 0.12 * p, r + (tip - r) * 0.82)
      at(c, tip)
      at(c + 0.12 * p, r + (tip - r) * 0.82)
      at(c + 0.21 * p, r)
      at(c + 0.3 * p, root)
    } else if (style === 'escape') {
      // club teeth: a long back rising to a point, then the impulse face
      at(c, root)
      at(c + 0.42 * p, r + (tip - r) * 0.4)
      at(c + 0.62 * p, tip)
      at(c + 0.72 * p, tip - module * 0.35)
      at(c + 0.74 * p, root)
    } else {
      at(c, root)
      at(c + 0.86 * p, tip)
      at(c + 0.88 * p, root)
    }
  }
  s.closePath()

  if (spokes > 0) {
    const rimIn = root - Math.max(module * 1.5, r * 0.13)
    const hubR = r * 0.27
    const w = Math.max(0.005, r * 0.055) // half the spoke width
    const dO = Math.asin(w / rimIn)
    const dI = Math.asin(Math.min(0.95, w / hubR))
    for (let k = 0; k < spokes; k++) {
      const b0 = (k / spokes) * TAU + Math.PI / 2
      const b1 = ((k + 1) / spokes) * TAU + Math.PI / 2
      const h = new THREE.Path()
      h.moveTo(Math.cos(b0 + dO) * rimIn, Math.sin(b0 + dO) * rimIn)
      h.absarc(0, 0, rimIn, b0 + dO, b1 - dO, false)
      h.lineTo(Math.cos(b1 - dI) * hubR, Math.sin(b1 - dI) * hubR)
      h.absarc(0, 0, hubR, b1 - dI, b0 + dI, true)
      h.closePath()
      s.holes.push(h)
    }
  }
  return s
}

function wheelGeometry(teeth: number, module: number, style: ToothStyle, spokes: number, thickness: number) {
  const g = new THREE.ExtrudeGeometry(wheelShape(teeth, module, style, spokes), {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.12,
    bevelSize: module * 0.14,
    bevelSegments: 1,
    curveSegments: 10,
  })
  g.translate(0, 0, -thickness / 2)
  return g
}

/**
 * Starting angle for a wheel meshing with another, so a tooth of one sits
 * in a gap of the other at the contact line (phases in units of pitch sum
 * to one half, and stay that way as the pair turns).
 */
function meshPhase(theta: number, phi1: number, teeth1: number, teeth2: number): number {
  const p1 = TAU / teeth1
  const p2 = TAU / teeth2
  const u1 = (theta - phi1) / p1
  return theta + Math.PI - p2 * (0.5 - u1)
}

/** A bar with round ends between two points (a bridge or a lever). */
function barShape(ax: number, ay: number, ar: number, bx: number, by: number, br: number): THREE.Shape {
  const a = Math.atan2(by - ay, bx - ax)
  const s = new THREE.Shape()
  s.absarc(ax, ay, ar, a + Math.PI / 2, a + (Math.PI * 3) / 2, false)
  s.absarc(bx, by, br, a - Math.PI / 2, a + Math.PI / 2, false)
  s.closePath()
  return s
}

function extrude(shape: THREE.Shape, depth: number, z: number, bevel = 0.004): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 24,
  })
  g.translate(0, 0, z)
  return g
}

export function screwGeometries(x: number, y: number, z: number, r: number, slotAngle: number) {
  const head = new THREE.CylinderGeometry(r, r * 1.04, r * 0.5, 28)
  head.rotateX(Math.PI / 2)
  head.translate(x, y, z + r * 0.25)
  const slot = new THREE.BoxGeometry(r * 2.02, r * 0.26, r * 0.2)
  slot.rotateZ(slotAngle)
  slot.translate(x, y, z + r * 0.46)
  return { head, slot }
}

// --- finishes, drawn once to canvases ----------------------------------------

/** Perlage: overlapping circular-grained spots, as anisotropy directions. */
function perlage(size: number, extent: number): { dir: HTMLCanvasElement; tone: HTMLCanvasElement } {
  const dir = document.createElement('canvas')
  const tone = document.createElement('canvas')
  dir.width = dir.height = tone.width = tone.height = size
  const dctx = dir.getContext('2d')!
  const tctx = tone.getContext('2d')!
  const di = dctx.createImageData(size, size)
  const ti = tctx.createImageData(size, size)
  // flat grey and neutral direction where no spot lands
  for (let i = 0; i < size * size; i++) {
    di.data[i * 4] = 128
    di.data[i * 4 + 1] = 128
    di.data[i * 4 + 2] = 0
    di.data[i * 4 + 3] = 255
    ti.data[i * 4] = ti.data[i * 4 + 1] = ti.data[i * 4 + 2] = 200
    ti.data[i * 4 + 3] = 255
  }
  const pxPerUnit = size / (extent * 2)
  const R = 0.042 * pxPerUnit
  const step = 0.05 * pxPerUnit
  // rows from the bottom up, each spot overlapping the last
  let row = 0
  for (let cy = size + R; cy > -R; cy -= step * 0.87, row++) {
    for (let cx = -R + (row % 2 ? step / 2 : 0); cx < size + R; cx += step) {
      const x0 = Math.max(0, Math.floor(cx - R))
      const x1 = Math.min(size - 1, Math.ceil(cx + R))
      const y0 = Math.max(0, Math.floor(cy - R))
      const y1 = Math.min(size - 1, Math.ceil(cy + R))
      const jitter = 0.94 + Math.random() * 0.1
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx
          const dy = cy - (y + 0.5) // up is +v
          const d = Math.hypot(dx, dy)
          if (d > R) continue
          const i = (y * size + x) * 4
          const n = d || 1
          // concentric grain: direction tangent to the spot's circles
          di.data[i] = Math.round((-dy / n) * 127.5 + 127.5)
          di.data[i + 1] = Math.round((dx / n) * 127.5 + 127.5)
          di.data[i + 2] = 255
          const k = d / R
          const v = Math.round((0.8 + 0.2 * (1 - k * k)) * jitter * 235)
          ti.data[i] = ti.data[i + 1] = ti.data[i + 2] = Math.min(255, v)
        }
      }
    }
  }
  dctx.putImageData(di, 0, 0)
  tctx.putImageData(ti, 0, 0)
  return { dir, tone }
}

/**
 * Bridges: Cotes de Geneve stripes across the whole movement (so they run on
 * from one bridge to the next, as when the bridges are finished together),
 * with the maker's engraving filled in gold.
 */
function bridgeFinish(
  size: number,
  extent: number,
  font: string,
  engravings: Array<{ text: string; x: number; y: number; h: number; align: CanvasTextAlign }>
): { color: HTMLCanvasElement; rough: HTMLCanvasElement } {
  const color = document.createElement('canvas')
  const rough = document.createElement('canvas')
  color.width = color.height = rough.width = rough.height = size
  const cctx = color.getContext('2d')!
  const rctx = rough.getContext('2d')!
  const period = (0.068 / (extent * 2)) * size
  for (let y = 0; y < size; y++) {
    const s = (y % period) / period
    // each stripe: a bright crest a third of the way across, a fine
    // shadow where the next stripe was cut over it
    const crest = Math.exp(-Math.pow((s - 0.36) / 0.2, 2))
    const edge = s > 0.93 ? (s - 0.93) / 0.07 : 0
    const b = 0.8 + 0.2 * crest - 0.22 * edge
    const c = Math.round(255 * b)
    cctx.fillStyle = `rgb(${c},${c},${Math.min(255, c + 3)})`
    cctx.fillRect(0, y, size, 1)
    const r = Math.round(255 * (0.16 + 0.16 * (1 - crest) + 0.2 * edge))
    rctx.fillStyle = `rgb(0,${r},0)`
    rctx.fillRect(0, y, size, 1)
  }
  const toPx = (x: number, y: number): [number, number] => [
    ((x + extent) / (extent * 2)) * size,
    ((extent - y) / (extent * 2)) * size,
  ]
  for (const e of engravings) {
    const [x, y] = toPx(e.x, e.y)
    const h = (e.h / (extent * 2)) * size
    for (const [ctx, fill] of [
      [cctx, '#d9b36c'],
      [rctx, 'rgb(0,120,0)'],
    ] as const) {
      ctx.font = `600 ${Math.round(h)}px ${font}`
      ctx.textAlign = e.align
      ctx.textBaseline = 'middle'
      ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(h * 0.18)}px`
      if (ctx === cctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillText(e.text, x + h * 0.04, y + h * 0.05)
      }
      ctx.fillStyle = fill
      ctx.fillText(e.text, x, y)
    }
  }
  return { color, rough }
}

// --- the movement ----------------------------------------------------------------

export function buildMovement(opts: {
  factors: FactorWeight[]
  featureCount: number
  font: string
  maxAniso: number
  radialGrain: THREE.Texture // radial anisotropy directions (the dial's sunray map)
}): Movement {
  const group = new THREE.Group()
  const EXT = 0.95 // plate radius; textures span [-EXT, EXT]

  // materials
  const grain = opts.radialGrain.clone() // circular graining on the wheels
  grain.repeat.set(2, 2)
  grain.offset.set(0.5, 0.5)
  grain.needsUpdate = true
  const goldWheel = new THREE.MeshPhysicalMaterial({
    color: 0xe0b46a,
    metalness: 1,
    roughness: 0.3,
    anisotropy: 0.7,
    anisotropyMap: grain,
    anisotropyRotation: Math.PI / 2,
  })
  const goldPolish = new THREE.MeshStandardMaterial({ color: 0xf2cd8c, metalness: 1, roughness: 0.14 })
  const steelPolish = new THREE.MeshStandardMaterial({ color: 0xdcdee2, metalness: 1, roughness: 0.1 })
  const steelGrained = new THREE.MeshPhysicalMaterial({
    color: 0xd6d8dc,
    metalness: 1,
    roughness: 0.26,
    anisotropy: 0.8,
    anisotropyMap: grain,
    anisotropyRotation: Math.PI / 2,
  })
  const blued = new THREE.MeshStandardMaterial({ color: 0x1d3f9e, metalness: 1, roughness: 0.2 })
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x07080b, metalness: 0.5, roughness: 0.6 })
  const ruby = new THREE.MeshPhysicalMaterial({
    color: 0xb3122a,
    metalness: 0,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    emissive: 0x2a0006,
  })
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x9db0dc, metalness: 1, roughness: 0.22 })

  // plate: anthracite with perlage
  const pl = perlage(1024, EXT)
  const perlDir = new THREE.CanvasTexture(pl.dir)
  perlDir.colorSpace = THREE.NoColorSpace
  const perlTone = new THREE.CanvasTexture(pl.tone)
  perlTone.colorSpace = THREE.SRGBColorSpace
  perlTone.anisotropy = opts.maxAniso
  const plate = new THREE.Mesh(
    new THREE.CircleGeometry(EXT, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x6c7078,
      map: perlTone,
      metalness: 1,
      roughness: 0.36,
      anisotropy: 0.85,
      anisotropyMap: perlDir,
    })
  )
  plate.position.z = PLATE_Z
  group.add(plate)

  // --- the factor wheels around the centre wheel ------------------------------
  const factors = (
    opts.factors.length
      ? opts.factors
      : [
          { name: 'Lending History', weight: 0.3 },
          { name: 'Wallet History', weight: 0.25 },
          { name: 'DeFi Activity', weight: 0.23 },
          { name: 'Portfolio & Identity', weight: 0.22 },
        ]
  ).slice(0, 4)
  const centreTeeth = Math.min(40, Math.max(28, opts.featureCount))
  const centre = new THREE.Mesh(wheelGeometry(centreTeeth, MODULE, 'gear', 5, 0.026), goldWheel)
  centre.position.z = WHEEL_Z
  group.add(centre)

  // top-left, top-right, bottom-right, bottom-left, read clockwise
  const angles = [(Math.PI * 3) / 4, Math.PI / 4, -Math.PI / 4, (-Math.PI * 3) / 4]
  const rc = (centreTeeth * MODULE) / 2
  const factorWheels: Array<{ mesh: THREE.Mesh; teeth: number; phase0: number }> = []
  const anchors: MovementAnchor[] = []
  const bridgeGeos: THREE.BufferGeometry[] = []
  const screwHeads: THREE.BufferGeometry[] = []
  const screwSlots: THREE.BufferGeometry[] = []
  const jewelGeos: THREE.BufferGeometry[] = []
  const chatonGeos: THREE.BufferGeometry[] = []
  const addScrew = (x: number, y: number, z: number, r = 0.021) => {
    const { head, slot } = screwGeometries(x, y, z, r, Math.atan2(y, x) + 0.6 + x * 3)
    screwHeads.push(head)
    screwSlots.push(slot)
  }
  const addJewel = (x: number, y: number, z: number, r = 0.015) => {
    const chaton = new THREE.CylinderGeometry(r * 2.1, r * 2.2, 0.01, 32)
    chaton.rotateX(Math.PI / 2)
    chaton.translate(x, y, z + 0.005)
    chatonGeos.push(chaton)
    const jewel = new THREE.SphereGeometry(r, 24, 10, 0, TAU, 0, Math.PI / 2)
    jewel.rotateX(Math.PI / 2)
    jewel.scale(1, 1, 0.55)
    jewel.translate(x, y, z + 0.009)
    jewelGeos.push(jewel)
  }

  factors.forEach((f, i) => {
    const teeth = Math.max(12, Math.round(f.weight * 100))
    const r = (teeth * MODULE) / 2
    const a = angles[i]
    const d = rc + r
    const x = Math.cos(a) * d
    const y = Math.sin(a) * d
    const mesh = new THREE.Mesh(wheelGeometry(teeth, MODULE, 'gear', 4, 0.026), goldWheel)
    const phase0 = meshPhase(a, 0, centreTeeth, teeth)
    mesh.position.set(x, y, WHEEL_Z)
    mesh.rotation.z = phase0
    group.add(mesh)
    factorWheels.push({ mesh, teeth, phase0 })
    // a cock from the rim to the arbor, its jewel and screw
    const ex = Math.cos(a) * 0.79
    const ey = Math.sin(a) * 0.79
    bridgeGeos.push(extrude(barShape(ex, ey, 0.05, x, y, 0.042), BRIDGE_T, BRIDGE_Z))
    addScrew(ex, ey, TOP_Z + 0.004)
    addJewel(x, y, TOP_Z + 0.002)
    const anchor = new THREE.Object3D()
    anchor.position.set(x, y, TOP_Z + 0.02)
    group.add(anchor)
    anchors.push({ key: f.name, label: `${f.name} ${Math.round(f.weight * 100)}%`, side: x < 0 ? 'left' : 'right', object: anchor })
  })

  // the centre bridge, across the movement between the factor wheels
  {
    const s = new THREE.Shape()
    const L = 0.86
    const w = 0.048
    s.moveTo(-L, -w)
    s.lineTo(-0.16, -w)
    s.absarc(0, 0, 0.082, -Math.PI + Math.asin(w / 0.082), -Math.asin(w / 0.082), false)
    s.lineTo(L, -w)
    s.lineTo(L, w)
    s.lineTo(0.16, w)
    s.absarc(0, 0, 0.082, Math.asin(w / 0.082), Math.PI - Math.asin(w / 0.082), false)
    s.lineTo(-L, w)
    s.closePath()
    bridgeGeos.push(extrude(s, BRIDGE_T, BRIDGE_Z))
    addJewel(0, 0, TOP_Z + 0.002, 0.018)
    addScrew(-0.74, 0, TOP_Z + 0.004)
    addScrew(0.74, 0, TOP_Z + 0.004)
  }

  // --- barrel and ratchet, at twelve o'clock (seen from behind) -----------
  const BX = 0
  const BY = 0.625
  const barrel = new THREE.Mesh(wheelGeometry(27, MODULE, 'gear', 0, 0.05), goldWheel)
  barrel.position.set(BX, BY, WHEEL_Z - 0.005)
  group.add(barrel)
  const ratchetTeeth = 54
  const ratchet = new THREE.Mesh(wheelGeometry(ratchetTeeth, 0.0052, 'ratchet', 0, 0.016), steelGrained)
  ratchet.position.set(BX, BY, 0.04)
  group.add(ratchet)
  addScrew(BX, BY, 0.048, 0.032)
  // the click that holds the ratchet
  const clickPivot = new THREE.Vector2(0.215, 0.5)
  const click = new THREE.Group()
  click.position.set(clickPivot.x, clickPivot.y, 0.04)
  group.add(click)
  {
    const tipA = Math.atan2(0.565 - clickPivot.y, 0.13 - clickPivot.x)
    const len = Math.hypot(0.565 - clickPivot.y, 0.13 - clickPivot.x)
    const s = barShape(0, 0, 0.022, Math.cos(tipA) * len, Math.sin(tipA) * len, 0.008)
    click.add(new THREE.Mesh(extrude(s, 0.012, -0.006, 0.002), steelPolish))
  }
  addScrew(clickPivot.x, clickPivot.y, 0.052, 0.016)

  // --- escapement, between the centre wheel and the balance ------------------
  const EX = 0
  const EY = -0.37
  const escapeTeeth = 15
  const escape = new THREE.Mesh(wheelGeometry(escapeTeeth, 0.0087, 'escape', 5, 0.016), goldPolish)
  escape.position.set(EX, EY, WHEEL_Z)
  group.add(escape)
  addJewel(EX, EY, 0.02, 0.012)

  const fork = new THREE.Group()
  const FY = -0.47
  fork.position.set(0, FY, 0.012)
  group.add(fork)
  {
    const body = new THREE.Shape()
    // lever down to the horns, arms up to the pallet stones
    body.moveTo(-0.008, -0.1)
    body.lineTo(-0.016, -0.118)
    body.lineTo(-0.006, -0.118)
    body.lineTo(0, -0.108)
    body.lineTo(0.006, -0.118)
    body.lineTo(0.016, -0.118)
    body.lineTo(0.008, -0.1)
    body.lineTo(0.007, -0.02)
    body.lineTo(0.05, 0.024)
    body.lineTo(0.05, 0.04)
    body.lineTo(0.036, 0.04)
    body.lineTo(0.0, 0.012)
    body.lineTo(-0.036, 0.04)
    body.lineTo(-0.05, 0.04)
    body.lineTo(-0.05, 0.024)
    body.lineTo(-0.007, -0.02)
    body.closePath()
    fork.add(new THREE.Mesh(extrude(body, 0.008, -0.004, 0.0015), steelPolish))
    const pallets = [-1, 1].map((sx) => {
      const g = new THREE.BoxGeometry(0.009, 0.026, 0.012)
      g.rotateZ(sx * 0.35)
      g.translate(sx * 0.043, 0.05, -0.006)
      return g
    })
    fork.add(new THREE.Mesh(mergeGeometries(pallets), ruby))
  }
  addJewel(0, FY, 0.022, 0.01)

  // --- balance and hairspring, at six o'clock -----------------------------
  const balance = new THREE.Group()
  const BAL = new THREE.Vector2(0, -0.645)
  balance.position.set(BAL.x, BAL.y, 0.032)
  group.add(balance)
  {
    const rim = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.142, -0.008),
        new THREE.Vector2(0.158, -0.008),
        new THREE.Vector2(0.158, 0.008),
        new THREE.Vector2(0.142, 0.008),
        new THREE.Vector2(0.142, -0.008),
      ],
      96
    )
    rim.rotateX(Math.PI / 2)
    const parts: THREE.BufferGeometry[] = [rim.toNonIndexed()]
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.BoxGeometry(0.15, 0.014, 0.008)
      arm.translate(0.075, 0, 0)
      arm.rotateZ((k / 3) * TAU + 0.3)
      parts.push(arm.toNonIndexed())
    }
    // timing screws around the rim
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU
      const sc = new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 12)
      sc.rotateZ(Math.PI / 2)
      sc.rotateZ(a)
      sc.translate(Math.cos(a) * 0.163, Math.sin(a) * 0.163, 0)
      parts.push(sc.toNonIndexed())
    }
    const roller = new THREE.CylinderGeometry(0.026, 0.026, 0.01, 32)
    roller.rotateX(Math.PI / 2)
    roller.translate(0, 0, -0.012)
    parts.push(roller.toNonIndexed())
    balance.add(new THREE.Mesh(mergeGeometries(parts.map(stripToPNU)), goldPolish))
    const pin = new THREE.CylinderGeometry(0.004, 0.004, 0.016, 12)
    pin.rotateX(Math.PI / 2)
    pin.translate(0, 0.02, -0.016)
    balance.add(new THREE.Mesh(pin, ruby))
  }
  const hairspring = new THREE.Group()
  hairspring.position.set(BAL.x, BAL.y, 0.046)
  group.add(hairspring)
  {
    const pts: THREE.Vector3[] = []
    const turns = 11
    for (let t = 0; t <= 1; t += 1 / 900) {
      const a = t * TAU * turns
      const r = 0.016 + t * 0.098
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0))
    }
    hairspring.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 1400, 0.0016, 4, false), hairMat))
  }
  // the balance cock, from the rim to the balance staff, with its regulator
  {
    const foot = new THREE.Vector2(-0.4, -0.665)
    bridgeGeos.push(extrude(barShape(foot.x, foot.y, 0.058, BAL.x, BAL.y, 0.05), BRIDGE_T, 0.064))
    addScrew(foot.x, foot.y, 0.064 + BRIDGE_T + 0.004, 0.022)
    addJewel(BAL.x, BAL.y, 0.064 + BRIDGE_T + 0.002, 0.016)
  }
  const index = new THREE.Mesh(
    extrude(barShape(BAL.x, BAL.y, 0.03, BAL.x + 0.15, BAL.y - 0.06, 0.006), 0.006, 0.064 + BRIDGE_T + 0.004, 0.0015),
    steelPolish
  )
  group.add(index)

  // --- bridges, screws and jewels, merged per material -------------------------
  const ENGRAVE_H = 0.036
  const fin = bridgeFinish(1024, EXT, opts.font, [
    { text: 'CHAINSCORE', x: -0.13, y: 0, h: ENGRAVE_H, align: 'right' },
    { text: `${opts.featureCount} FEATURES`, x: 0.13, y: 0, h: ENGRAVE_H, align: 'left' },
  ])
  const finColor = new THREE.CanvasTexture(fin.color)
  finColor.colorSpace = THREE.SRGBColorSpace
  finColor.anisotropy = opts.maxAniso
  const finRough = new THREE.CanvasTexture(fin.rough)
  finRough.colorSpace = THREE.NoColorSpace
  for (const t of [finColor, finRough]) {
    // extrude caps carry movement-space x/y as uv
    t.repeat.set(1 / (EXT * 2), 1 / (EXT * 2))
    t.offset.set(0.5, 0.5)
  }
  const bridgeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf0f2f5,
    map: finColor,
    roughnessMap: finRough,
    roughness: 1,
    metalness: 1,
  })
  group.add(new THREE.Mesh(mergeGeometries(bridgeGeos.map(stripToPNU)), bridgeMat))
  group.add(new THREE.Mesh(mergeGeometries(screwHeads.map((g) => stripToPNU(g.toNonIndexed()))), blued))
  group.add(new THREE.Mesh(mergeGeometries(screwSlots.map((g) => stripToPNU(g.toNonIndexed()))), slotMat))
  group.add(new THREE.Mesh(mergeGeometries(jewelGeos.map((g) => stripToPNU(g.toNonIndexed()))), ruby))
  group.add(new THREE.Mesh(mergeGeometries(chatonGeos.map((g) => stripToPNU(g.toNonIndexed()))), goldPolish))

  // --- motion ----------------------------------------------------------------
  const ratchetPitch = TAU / ratchetTeeth
  const BEATS = 6 // per second: 21,600 vibrations an hour
  const update = (time: number, spin: number, still: boolean) => {
    const t = still ? 0 : time
    const ph = t * Math.PI * BEATS // balance phase, 3 Hz
    const swing = Math.sin(ph)
    balance.rotation.z = still ? 0.4 : swing * 2.3
    hairspring.rotation.z = balance.rotation.z * 0.5
    const breathe = 1 + 0.07 * swing
    hairspring.scale.set(breathe, breathe, 1)
    // the fork flips as the balance passes its dead point
    fork.rotation.z = 0.12 * Math.max(-1, Math.min(1, Math.cos(ph) * 7))
    // the escape wheel steps half a tooth per beat, quickly, then locks
    const beats = t * BEATS
    const n = Math.floor(beats)
    const f = Math.min(1, (beats - n) / 0.14)
    const eased = 1 - Math.pow(1 - f, 3)
    escape.rotation.z = -(n + eased) * (Math.PI / escapeTeeth)
    // the train: slow on its own, more as the page scrolls
    const train = t * 0.045 + spin
    centre.rotation.z = train
    for (const w of factorWheels) w.mesh.rotation.z = w.phase0 - train * (centreTeeth / w.teeth)
    barrel.rotation.z = t * 0.012 + spin * 0.18
    // winding: the ratchet turns with the scroll and the click rides its teeth
    const wind = spin * 0.55
    ratchet.rotation.z = wind
    const ride = ((wind % ratchetPitch) + ratchetPitch) % ratchetPitch
    click.rotation.z = 0.05 * (ride / ratchetPitch)
  }
  update(0, 0, false)

  return { group, anchors, normal: new THREE.Vector3(0, 0, 1), update }
}

/** Keep the attributes every merged geometry shares. */
export function stripToPNU(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name)
  }
  out.morphAttributes = {}
  return out
}
