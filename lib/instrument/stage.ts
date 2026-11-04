// The ChainScore instrument: a dial gauge that reads a wallet's score, with
// two sub-dials (probability of default, data completeness) and, behind a
// sapphire caseback, a running mechanism whose four factor wheels are sized
// by the model's factor-group weights (lib/instrument/movement.ts).
//
// It is alive while on screen. On arrival the needle runs its full-scale
// self-test and settles on the reading; the case floats and leans toward
// the pointer; reflections drift across the crystal; a live reading
// trembles by a fraction of a point; behind the dial the balance swings and
// the escape wheel steps. The page drives its pose (setPose) and turns the
// gear train as it scrolls (setSpin). It stops rendering off screen and in
// background tabs, and lowers its resolution, then its frame rate, if frames
// run slow. Lazy-loaded; three.js never reaches the first bundle.
//
// Units: dial radius ~1, dial face at z = 0 facing +z.

import * as THREE from 'three'
import {
  FLAG_WINDOW,
  GRADE_ORDER,
  ScaleSpec,
  SUBDIALS,
  SUB_START,
  SUB_SWEEP,
  drawDial,
  drawFlag,
  drawGrades,
  drawNeedleShadow,
  drawSunray,
  gradeIndex,
  restAngle,
  scoreToAngle,
} from './dial'
import { FactorWeight, buildMovement, screwGeometries, stripToPNU } from './movement'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type { FactorWeight }

export type Reading =
  | { kind: 'score'; score: number; pd?: number; completeness?: number }
  | { kind: 'none' } // never borrowed: needle on its stop, flag in view

export interface InstrumentState {
  reading: Reading
  /** Light the flagged zone (scores below the operating cutoff). */
  zone: boolean
  /** Resting view, radians: [pitch, yaw]. A page can drive it with setPose. */
  tilt?: [number, number]
}

export interface Pose {
  pitch: number
  /** Past pi the caseback faces the viewer. */
  yaw: number
  /** Camera distance multiplier; below 1 is closer. */
  zoom?: number
}

export interface InstrumentSpec extends ScaleSpec {
  factors?: FactorWeight[]
  featureCount?: number
}

export interface ScreenAnchor {
  key: string
  label: string
  side: 'left' | 'right'
  /** CSS pixels from the canvas's top left. */
  x: number
  y: number
  /** 1 when the caseback faces the camera, below 0 when it faces away. */
  facing: number
}

export interface MountOptions {
  /** Reduced motion: no self-test, float, ticking or parallax; changes are instant. */
  still?: boolean
  /** Run the arrival: the case turns in and the needle sweeps full scale. */
  intro?: boolean
  /** Lean toward a mouse pointer. */
  parallax?: boolean
  /** Called after each rendered frame with the factor wheels' screen positions. */
  onFrame?: (anchors: ScreenAnchor[]) => void
}

export interface InstrumentHandle {
  set: (s: InstrumentState, opts?: { instant?: boolean }) => void
  setPose: (p: Pose, opts?: { instant?: boolean }) => void
  /** Scroll-driven turn of the gear train, radians of the centre wheel. */
  setSpin: (radians: number) => void
  resize: () => void
  destroy: () => void
  firstFrame: Promise<void>
}

function lathe(points: Array<[number, number]>, segments = 160): THREE.LatheGeometry {
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments)
  g.rotateX(Math.PI / 2) // lathe axis Y -> Z
  return g
}

/** Coin-edge knurling: an open band whose alternate columns stand proud. */
function knurl(radius: number, z0: number, z1: number, flutes: number, depth: number): THREE.BufferGeometry {
  const segs = flutes * 2
  const g = new THREE.CylinderGeometry(radius, radius, z1 - z0, segs, 1, true)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    if ((i % (segs + 1)) % 2 === 1) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      const k = (r - depth) / r
      pos.setX(i, x * k)
      pos.setZ(i, z * k)
    }
  }
  g.computeVertexNormals()
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, (z0 + z1) / 2)
  return g.toNonIndexed()
}

function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  // A dark studio with soft boxes, prefiltered for image-based lighting.
  // Built here rather than downloaded: no HDR file, nothing for CSP.
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x060607)
  const panel = (w: number, h: number, intensity: number, pos: [number, number, number], tint = 1) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity * tint, intensity * tint * tint), side: THREE.DoubleSide })
    )
    m.position.set(...pos)
    m.lookAt(0, 0, 0)
    scene.add(m)
  }
  panel(7, 2.6, 9, [0.5, 4.2, 2.6]) // key softbox, above and in front
  panel(0.8, 6, 6, [-4.6, 0.5, 1.6]) // left strip
  panel(0.6, 6, 3.5, [4.8, -0.2, 2.0], 0.96) // right strip, a touch warm
  panel(5, 2, 0.6, [0, -4, 3]) // low fill
  panel(4, 3, 4.2, [1.5, 2.6, -4]) // behind: lights the caseback side
  panel(0.6, 6, 3, [-4, 0, -3]) // rear strip
  panel(3, 0.5, 5, [-1.5, 3.5, -2.5], 0.94) // rear top bar, warm
  panel(4.5, 2.2, 1.6, [0.3, 2.2, 6.5]) // soft front fill, just above the camera
  const pmrem = new THREE.PMREMGenerator(renderer)
  const tex = pmrem.fromScene(scene, 0.035).texture
  pmrem.dispose()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
  })
  return tex
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export async function mountInstrument(
  canvas: HTMLCanvasElement,
  spec: InstrumentSpec,
  initial: InstrumentState,
  opts: MountOptions = {}
): Promise<InstrumentHandle> {
  const still = Boolean(opts.still)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  let dpr = Math.min(window.devicePixelRatio || 1, 1.6)
  renderer.setPixelRatio(dpr)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.12

  const scene = new THREE.Scene()
  scene.environment = studioEnvironment(renderer)

  const DIST = 8.1
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 50)
  camera.position.set(0, 0, DIST)

  // rig: pose, float and parallax; root: the instrument itself
  const rig = new THREE.Group()
  scene.add(rig)
  const root = new THREE.Group()
  rig.add(root)

  await document.fonts?.ready
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'sans-serif'
  const maxAniso = renderer.capabilities.getMaxAnisotropy()

  // --- materials --------------------------------------------------------------
  // Turned parts are lathes whose winding varies by profile; both sides.
  const steelPolish = new THREE.MeshStandardMaterial({ color: 0xd9dade, metalness: 1, roughness: 0.14, side: THREE.DoubleSide })
  const steelBrushed = new THREE.MeshPhysicalMaterial({
    color: 0xcfd1d6,
    metalness: 1,
    roughness: 0.3,
    anisotropy: 0.75,
    side: THREE.DoubleSide,
  })

  // --- case: polished body, sapphire caseback window ------------------------
  root.add(
    new THREE.Mesh(
      lathe([
        [0.92, -0.36],
        [1.08, -0.36],
        [1.12, -0.33],
        [1.15, -0.27],
        [1.155, -0.04],
      ]),
      steelPolish
    )
  )
  root.add(
    new THREE.Mesh(
      lathe([
        [0.9, -0.33],
        [0.92, -0.37],
        [1.0, -0.385],
        [1.07, -0.37],
      ]),
      steelBrushed
    )
  )
  root.add(
    new THREE.Mesh(
      lathe([
        [0.975, -0.002],
        [0.985, 0.012],
        [1.035, 0.072],
      ]),
      steelPolish
    ),
    new THREE.Mesh(
      lathe([
        [1.035, 0.072],
        [1.06, 0.082],
        [1.12, 0.084],
        [1.15, 0.07],
        [1.165, 0.045],
      ]),
      steelBrushed
    )
  )
  root.add(new THREE.Mesh(knurl(1.168, -0.05, 0.045, 180, 0.008), steelPolish))
  root.add(
    new THREE.Mesh(
      lathe([
        [0.952, 0.0008],
        [0.978, 0.016],
      ]),
      new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide })
    )
  )
  // eight screws hold the bezel
  {
    const heads: THREE.BufferGeometry[] = []
    const slots: THREE.BufferGeometry[] = []
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4
      const { head, slot } = screwGeometries(Math.cos(a) * 1.092, Math.sin(a) * 1.092, 0.083, 0.021, a + 0.9)
      heads.push(stripToPNU(head))
      slots.push(stripToPNU(slot))
    }
    root.add(new THREE.Mesh(mergeGeometries(heads), steelPolish))
    root.add(new THREE.Mesh(mergeGeometries(slots), new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.7 })))
  }

  // --- dial: sunray metal, cut flag window ------------------------------------
  const winW = FLAG_WINDOW.w
  const winH = FLAG_WINDOW.h
  const winY = FLAG_WINDOW.y
  const face = new THREE.Shape()
  face.absarc(0, 0, 0.972, 0, Math.PI * 2, false)
  const win = new THREE.Path()
  win.moveTo(-winW / 2, winY - winH / 2)
  win.lineTo(-winW / 2, winY + winH / 2)
  win.lineTo(winW / 2, winY + winH / 2)
  win.lineTo(winW / 2, winY - winH / 2)
  win.closePath()
  face.holes.push(win)
  const faceGeo = new THREE.ShapeGeometry(face, 96)
  {
    const pos = faceGeo.attributes.position as THREE.BufferAttribute
    const uv = faceGeo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.944 + 0.5, pos.getY(i) / 1.944 + 0.5)
  }
  const sunray = new THREE.CanvasTexture(drawSunray(512))
  sunray.colorSpace = THREE.NoColorSpace
  // sunray centre, concentric grain on the scale track (from the numerals out)
  const dialGrain = new THREE.CanvasTexture(drawSunray(1024, 0.615 / 0.972))
  dialGrain.colorSpace = THREE.NoColorSpace
  root.add(
    new THREE.Mesh(
      faceGeo,
      new THREE.MeshPhysicalMaterial({ color: 0x1b1d21, metalness: 0.85, roughness: 0.34, anisotropy: 0.95, anisotropyMap: dialGrain })
    )
  )
  // sub-dials: concentric grain (azurage), so they catch the light apart
  // from the sunray face around them
  const azurage = new THREE.MeshPhysicalMaterial({
    color: 0x17191d,
    metalness: 0.9,
    roughness: 0.28,
    anisotropy: 1,
    anisotropyMap: sunray,
    anisotropyRotation: Math.PI / 2,
  })
  for (const sd of SUBDIALS) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(sd.r * 0.985, 72), azurage)
    disc.position.set(sd.x, sd.y, 0.0005)
    root.add(disc)
  }
  const print = new THREE.CanvasTexture(drawDial(spec, font))
  print.colorSpace = THREE.SRGBColorSpace
  print.anisotropy = maxAniso
  const printMesh = new THREE.Mesh(
    faceGeo,
    new THREE.MeshStandardMaterial({ map: print, transparent: true, roughness: 0.55, metalness: 0, depthWrite: false })
  )
  printMesh.position.z = 0.0012
  root.add(printMesh)

  const well = new THREE.Mesh(new THREE.PlaneGeometry(winW * 1.6, winH * 1.6), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8 }))
  well.position.set(0, winY, -0.03)
  root.add(well)
  // the grade wheel: a strip of grade cells that slides past the window
  const gradeTex = new THREE.CanvasTexture(drawGrades(font))
  gradeTex.colorSpace = THREE.SRGBColorSpace
  gradeTex.anisotropy = maxAniso
  gradeTex.repeat.set(1 / GRADE_ORDER.length, 1)
  const gradeStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(winW * 1.02, winH * 1.02),
    new THREE.MeshStandardMaterial({ map: gradeTex, roughness: 0.55, metalness: 0.1 })
  )
  gradeStrip.position.set(0, winY, -0.02)
  root.add(gradeStrip)
  const flagTex = new THREE.CanvasTexture(drawFlag(font))
  flagTex.colorSpace = THREE.SRGBColorSpace
  flagTex.anisotropy = maxAniso
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(winW * 1.02, winH * 1.02), new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.6 }))
  flag.position.set(0, winY, -0.012)
  root.add(flag)
  const FLAG_IN = 0
  const FLAG_OUT = -winW * 1.15

  // applied polished batons at the major marks
  {
    const batons: THREE.BufferGeometry[] = []
    for (let s = spec.min; s <= spec.max; s += 50) {
      const a = scoreToAngle(s, spec)
      const b = new THREE.BoxGeometry(0.075, 0.016, 0.012)
      b.rotateZ(a)
      b.translate(Math.cos(a) * 0.771, Math.sin(a) * 0.771, 0.007)
      batons.push(b)
    }
    root.add(new THREE.Mesh(mergeGeometries(batons), steelPolish))
  }

  // flagged zone, between the numerals and the ticks
  const a0 = scoreToAngle(spec.min, spec)
  const a1 = scoreToAngle(spec.cutoff, spec)
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xe95c68, transparent: true, opacity: 0, depthWrite: false })
  const zone = new THREE.Mesh(new THREE.RingGeometry(0.716, 0.742, 120, 1, a1, a0 - a1), zoneMat)
  zone.position.z = 0.002
  root.add(zone)

  // --- sub-dial hands: polished rings and thin lacquered hands ---------------
  const subHands: Record<'pd' | 'completeness', THREE.Group> = {} as Record<'pd' | 'completeness', THREE.Group>
  const handMat = new THREE.MeshStandardMaterial({ color: 0xf1eee7, roughness: 0.3 })
  for (const sd of SUBDIALS) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(sd.r, 0.006, 8, 96), steelPolish)
    ring.position.set(sd.x, sd.y, 0.004)
    root.add(ring)
    const hand = new THREE.Group()
    hand.position.set(sd.x, sd.y, 0.014)
    const blade = new THREE.Shape()
    blade.moveTo(-0.03, -0.006)
    blade.lineTo(sd.r * 0.86, -0.0015)
    blade.lineTo(sd.r * 0.86, 0.0015)
    blade.lineTo(-0.03, 0.006)
    blade.closePath()
    hand.add(new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.004, bevelEnabled: false }), handMat))
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.01, 32), steelPolish)
    cap.rotation.x = Math.PI / 2
    cap.position.z = 0.006
    hand.add(cap)
    root.add(hand)
    subHands[sd.key] = hand
  }
  const subAngle = (key: 'pd' | 'completeness', v: number | null) => {
    const sd = SUBDIALS.find((d) => d.key === key)!
    return v === null ? SUB_START + 0.06 : SUB_START - sd.toT(v) * SUB_SWEEP
  }

  // --- main needle -------------------------------------------------------------
  const needle = new THREE.Group()
  needle.position.z = 0.03
  root.add(needle)
  const shaft = new THREE.Shape()
  shaft.moveTo(-0.2, -0.016)
  shaft.lineTo(0.0, -0.022)
  shaft.lineTo(0.7, -0.006)
  shaft.lineTo(0.7, 0.006)
  shaft.lineTo(0.0, 0.022)
  shaft.lineTo(-0.2, 0.016)
  shaft.closePath()
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0xf1eee7, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 })
  needle.add(
    new THREE.Mesh(
      new THREE.ExtrudeGeometry(shaft, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 2 }),
      lacquer
    )
  )
  const tip = new THREE.Shape()
  tip.moveTo(0.7, -0.006)
  tip.lineTo(0.84, -0.0018)
  tip.lineTo(0.84, 0.0018)
  tip.lineTo(0.7, 0.006)
  tip.closePath()
  needle.add(new THREE.Mesh(new THREE.ExtrudeGeometry(tip, { depth: 0.008, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xe95c68, roughness: 0.3 })))
  const counter = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 48), lacquer)
  counter.rotation.x = Math.PI / 2
  counter.position.set(-0.17, 0, 0.004)
  needle.add(counter)
  const hub = new THREE.Mesh(
    lathe(
      [
        [0, 0.03],
        [0.03, 0.028],
        [0.055, 0.016],
        [0.062, 0.0],
        [0.062, -0.01],
      ],
      64
    ),
    steelPolish
  )
  hub.position.z = 0.012
  needle.add(hub)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 2.0),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(drawNeedleShadow(512)), transparent: true, opacity: 0.55, depthWrite: false })
  )
  shadow.position.set(0.02, -0.03, 0.0025)
  root.add(shadow)

  // --- crystal: reflections only (black dielectric, additive) ---------------
  const ca = 0.985
  const ch = 0.085
  const Rs = (ca * ca + ch * ch) / (2 * ch)
  const crystalGeo = new THREE.SphereGeometry(Rs, 96, 16, 0, Math.PI * 2, 0, Math.asin(ca / Rs))
  crystalGeo.rotateX(Math.PI / 2)
  const crystal = new THREE.Mesh(
    crystalGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      envMapIntensity: 0.32,
    })
  )
  crystal.position.z = 0.075 + ch - Rs
  root.add(crystal)

  // --- the mechanism, seen through the caseback --------------------------------
  const movement = buildMovement({
    factors: spec.factors ?? [],
    featureCount: spec.featureCount ?? 34,
    font,
    maxAniso,
    radialGrain: sunray,
  })
  const mech = movement.group
  mech.position.z = -0.2
  mech.rotation.y = Math.PI // built facing +z; turn it to face the back
  root.add(mech)
  const back = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      roughness: 0.05,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      envMapIntensity: 0.25,
      side: THREE.DoubleSide,
    })
  )
  back.position.z = -0.37
  root.add(back)

  // --- state -------------------------------------------------------------------
  const readingAngles = (r: Reading) => {
    if (r.kind === 'none') return { main: restAngle(), pd: subAngle('pd', null), data: subAngle('completeness', null) }
    return {
      main: scoreToAngle(r.score, spec),
      pd: subAngle('pd', r.pd ?? null),
      data: subAngle('completeness', r.completeness ?? null),
    }
  }
  const FULL = { main: scoreToAngle(spec.max, spec), pd: SUB_START - SUB_SWEEP, data: SUB_START - SUB_SWEEP }
  const REST = { main: restAngle(), pd: subAngle('pd', null), data: subAngle('completeness', null) }
  let targets = readingAngles(initial.reading)
  const intro = Boolean(opts.intro) && !still
  const cur = intro ? { ...REST } : { ...targets }
  const vel = { main: 0, pd: 0, data: 0 }
  let flagTarget = initial.reading.kind === 'none' ? FLAG_IN : FLAG_OUT
  let flagX = flagTarget
  let flagV = 0
  let zoneTarget = initial.zone ? 0.9 : 0
  let zoneOpacity = zoneTarget
  let live = initial.reading.kind === 'score'
  const LAST_GRADE = GRADE_ORDER.length - 1
  const gradeOf = (r: Reading) => (r.kind === 'score' ? gradeIndex(r.score, spec) : LAST_GRADE)
  let readingGrade = gradeOf(initial.reading)
  let gradeTarget = readingGrade
  let gradeX = intro ? LAST_GRADE : readingGrade // geared to the needle, which starts on its stop
  let gradeV = 0
  const angleMin = scoreToAngle(spec.min, spec)
  const angleSpan = angleMin - scoreToAngle(spec.max, spec)

  const t0 = initial.tilt ?? [-0.24, 0.32]
  const pose = { pitch: t0[0], yaw: t0[1], zoom: 1 }
  const poseTarget = { ...pose }
  const poseVel = { pitch: 0, yaw: 0, zoom: 0 }
  let spinTarget = 0
  let spin = 0
  const parallax = { x: 0, y: 0 }
  const parallaxTarget = { x: 0, y: 0 }

  let introT = intro ? 0 : 1 // arrival turn, 0 to 1
  let sweepT = intro ? -0.35 : Infinity // self-test clock, seconds

  let raf = 0
  let last = 0
  let elapsed = 0
  let resolveFirst: () => void = () => {}
  const firstFrame = new Promise<void>((r) => (resolveFirst = r))
  let rendered = false
  let visible = true
  let frozen = false // dev recordings step the clock by hand
  let width = 1
  let height = 1
  // adaptive quality
  let slowMs = 0
  let halfRate = false
  let skip = false
  let idleOff = false // last resort: draw only while something changes
  // how alive it is, 0 to 1: eases to 0 under reduced motion or idleOff, so
  // the float, tremor, drift and the running mechanism come to rest
  // smoothly instead of jumping
  let life = still ? 0 : 1
  let lifeT = 0 // the clock the life motions run on

  const step = (dt: number) => {
    elapsed += dt

    // self-test: sweep to full scale, hold, then let the springs settle on
    // the reading
    if (sweepT !== Infinity) {
      sweepT += dt
      const UP = 0.9
      const HOLD = 0.22
      if (sweepT < 0) {
        Object.assign(cur, REST)
      } else if (sweepT < UP) {
        const k = easeInOut(sweepT / UP)
        cur.main = REST.main + (FULL.main - REST.main) * k
        cur.pd = REST.pd + (FULL.pd - REST.pd) * k
        cur.data = REST.data + (FULL.data - REST.data) * k
      } else if (sweepT < UP + HOLD) {
        Object.assign(cur, FULL)
      } else {
        sweepT = Infinity
      }
      vel.main = vel.pd = vel.data = 0
    }
    if (sweepT === Infinity) {
      // main needle slightly underdamped, sub-hands stiffer
      vel.main += (110 * (targets.main - cur.main) - 13 * vel.main) * dt
      cur.main += vel.main * dt
      vel.pd += (170 * (targets.pd - cur.pd) - 20 * vel.pd) * dt
      cur.pd += vel.pd * dt
      vel.data += (170 * (targets.data - cur.data) - 20 * vel.data) * dt
      cur.data += vel.data * dt
    }
    // the flag drops in on a spring and settles with a small bounce; the
    // grade wheel turns to the reading's grade once the self-test is done
    flagV += (260 * (flagTarget - flagX) - 22 * flagV) * dt
    flagX += flagV * dt
    // the grade wheel is geared to the needle: it rolls through the grades
    // the needle passes and comes to rest on the reading's grade
    if (sweepT !== Infinity || Math.abs(targets.main - cur.main) > 0.05) {
      const s = spec.min + ((angleMin - cur.main) / angleSpan) * (spec.max - spec.min)
      gradeTarget = gradeIndex(Math.min(spec.max, Math.max(spec.min, s)), spec)
    } else gradeTarget = readingGrade
    gradeV += (90 * (gradeTarget - gradeX) - 16 * gradeV) * dt
    gradeX += gradeV * dt
    gradeTex.offset.x = Math.min(GRADE_ORDER.length - 1, Math.max(0, gradeX)) / GRADE_ORDER.length
    zoneOpacity += (zoneTarget - zoneOpacity) * Math.min(1, dt * 7)

    // pose: critically damped springs toward the page's target
    const w = 6.5
    for (const k of ['pitch', 'yaw', 'zoom'] as const) {
      poseVel[k] += (w * w * (poseTarget[k] - pose[k]) - 2 * w * poseVel[k]) * dt
      pose[k] += poseVel[k] * dt
    }
    parallax.x += (parallaxTarget.x - parallax.x) * Math.min(1, dt * 2.5)
    parallax.y += (parallaxTarget.y - parallax.y) * Math.min(1, dt * 2.5)
    spin += (spinTarget - spin) * Math.min(1, dt * 4)
    if (introT < 1) introT = Math.min(1, introT + dt / 1.9)
    const arrive = 1 - easeOut(introT)
    life += ((still || idleOff ? 0 : 1) - life) * Math.min(1, dt * 2)
    lifeT += dt * life
    const lt = lifeT

    // life: a live reading trembles by a fraction of a point; the body floats
    const reading = live && sweepT === Infinity ? life : 0
    const tremor = (Math.sin(lt * 7.1) * 0.6 + Math.sin(lt * 12.7) * 0.35 + Math.sin(lt * 2.3) * 0.5) * 0.0022 * reading
    needle.rotation.z = cur.main + tremor
    shadow.rotation.z = needle.rotation.z
    subHands.pd.rotation.z = cur.pd + Math.sin(lt * 3.3) * 0.006 * reading
    subHands.completeness.rotation.z = cur.data
    flag.position.x = flagX
    zoneMat.opacity = zoneOpacity * (zoneTarget > 0 ? 1 - 0.4 * life * (0.5 - 0.5 * Math.sin(lt * 2.4)) : 1)

    rig.rotation.x = pose.pitch + parallax.y * 0.07 + arrive * 0.32 + Math.sin(lt * 0.55) * 0.04 * life
    rig.rotation.y = pose.yaw + parallax.x * 0.11 - arrive * 0.95 + Math.sin(lt * 0.37 + 1.2) * 0.06 * life
    rig.rotation.z = arrive * 0.12 + Math.sin(lt * 0.29 + 0.4) * 0.014 * life
    rig.position.y = Math.sin(lt * 0.8) * 0.035 * life
    camera.position.z = DIST * (pose.zoom + arrive * 0.32)

    // reflections drift slowly across the case and crystal
    scene.environmentRotation.y = Math.sin(lt * 0.11) * 0.55 * life
    movement.update(lt, still ? 0 : spin, still)
  }

  const anchorsOut: ScreenAnchor[] = movement.anchors.map((a) => ({ key: a.key, label: a.label, side: a.side, x: 0, y: 0, facing: 0 }))
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const reportAnchors = () => {
    if (!opts.onFrame) return
    n.copy(movement.normal).transformDirection(mech.matrixWorld)
    movement.anchors.forEach((a, i) => {
      v.setFromMatrixPosition(a.object.matrixWorld)
      toCam.copy(camera.position).sub(v).normalize()
      const out = anchorsOut[i]
      out.facing = n.dot(toCam)
      v.project(camera)
      out.x = (v.x * 0.5 + 0.5) * width
      out.y = (-v.y * 0.5 + 0.5) * height
    })
    opts.onFrame(anchorsOut)
  }

  const settling = () =>
    sweepT !== Infinity ||
    introT < 1 ||
    Math.abs((still || idleOff ? 0 : 1) - life) > 0.001 ||
    (!still && Math.abs(spinTarget - spin) > 0.001) ||
    Math.abs(targets.main - cur.main) > 0.001 ||
    Math.abs(vel.main) > 0.002 ||
    Math.abs(flagTarget - flagX) > 0.001 ||
    Math.abs(gradeTarget - gradeX) > 0.002 ||
    Math.abs(zoneTarget - zoneOpacity) > 0.005 ||
    Math.abs(poseTarget.yaw - pose.yaw) + Math.abs(poseTarget.pitch - pose.pitch) + Math.abs(poseTarget.zoom - pose.zoom) > 0.001

  const frame = (now: number) => {
    raf = 0
    const ms = last ? now - last : 16.7
    const dt = Math.min(0.05, ms / 1000)
    last = now
    step(dt)
    skip = halfRate ? !skip : false
    if (!skip) {
      renderer.render(scene, camera)
      reportAnchors()
      if (!rendered) {
        rendered = true
        resolveFirst()
      }
    }
    // too slow for this device: lower the resolution, then the frame rate,
    // then stop the idle motion. Ignore the first seconds (page still
    // loading) and long stalls.
    if (elapsed > 2.5 && ms < 250 && !still && !idleOff) {
      if (ms > (halfRate ? 45 : 26)) slowMs += ms
      else slowMs = Math.max(0, slowMs - ms * 0.5)
      if (slowMs > 1500) {
        slowMs = 0
        if (dpr > 1) {
          dpr = Math.max(1, dpr - 0.3)
          renderer.setPixelRatio(dpr)
          resize()
        } else if (!halfRate) halfRate = true
        else idleOff = true
      }
    }
    if (visible && !frozen && ((!still && !idleOff) || settling())) raf = requestAnimationFrame(frame)
    else last = 0
  }
  const kick = () => {
    if (!raf && visible && !frozen) raf = requestAnimationFrame(frame)
  }

  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    width = w
    height = h
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    kick()
  }

  try {
    await renderer.compileAsync(scene, camera)
  } catch {
    // older drivers compile on first render instead
  }
  resize()

  // pause off screen and in background tabs
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting && document.visibilityState === 'visible'
    if (visible) kick()
  })
  io.observe(canvas)
  const onVis = () => {
    visible = document.visibilityState === 'visible'
    if (visible) kick()
  }
  document.addEventListener('visibilitychange', onVis)

  const fine = window.matchMedia('(pointer: fine)').matches
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    parallaxTarget.x = (e.clientX / window.innerWidth) * 2 - 1
    parallaxTarget.y = (e.clientY / window.innerHeight) * 2 - 1
  }
  const useParallax = Boolean(opts.parallax) && !still && fine
  if (useParallax) window.addEventListener('pointermove', onPointer, { passive: true })

  const set = (s: InstrumentState, o?: { instant?: boolean }) => {
    targets = readingAngles(s.reading)
    live = s.reading.kind === 'score'
    readingGrade = gradeOf(s.reading)
    flagTarget = s.reading.kind === 'none' ? FLAG_IN : FLAG_OUT
    zoneTarget = s.zone ? 0.9 : 0
    if (s.tilt) {
      poseTarget.pitch = s.tilt[0]
      poseTarget.yaw = s.tilt[1]
    }
    if (o?.instant || still) {
      if (sweepT === Infinity) {
        Object.assign(cur, targets)
        vel.main = vel.pd = vel.data = 0
      }
      flagX = flagTarget
      flagV = 0
      gradeTarget = gradeX = readingGrade
      gradeV = 0
      zoneOpacity = zoneTarget
      Object.assign(pose, poseTarget)
      poseVel.pitch = poseVel.yaw = poseVel.zoom = 0
    }
    kick()
  }
  const setPose = (p: Pose, o?: { instant?: boolean }) => {
    poseTarget.pitch = p.pitch
    poseTarget.yaw = p.yaw
    poseTarget.zoom = p.zoom ?? 1
    if (o?.instant || still) {
      Object.assign(pose, poseTarget)
      poseVel.pitch = poseVel.yaw = poseVel.zoom = 0
    }
    kick()
  }
  const setSpin = (radians: number) => {
    spinTarget = radians
    if (!still) kick()
  }

  const destroy = () => {
    if (raf) cancelAnimationFrame(raf)
    io.disconnect()
    document.removeEventListener('visibilitychange', onVis)
    if (useParallax) window.removeEventListener('pointermove', onPointer)
    const textures = new Set<THREE.Texture>()
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const m = mesh.material as THREE.Material
      for (const value of Object.values(m)) if ((value as THREE.Texture)?.isTexture) textures.add(value as THREE.Texture)
      m.dispose()
    })
    textures.forEach((t) => t.dispose())
    scene.environment?.dispose()
    renderer.dispose()
  }

  if (process.env.NODE_ENV !== 'production') {
    // dev hooks for screenshots and recordings: freeze the clock and step it
    ;(window as unknown as { __instrument?: unknown }).__instrument = {
      scene,
      set,
      setPose,
      setSpin,
      info: () => ({
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        frames: renderer.info.render.frame,
        dpr,
        halfRate,
        idleOff,
      }),
      freeze: () => {
        frozen = true
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        last = 0
      },
      advance: (dt: number) => {
        step(dt)
        renderer.render(scene, camera)
        reportAnchors()
      },
      replayIntro: () => {
        introT = 0
        sweepT = -0.35
        gradeX = LAST_GRADE
        Object.assign(cur, REST)
      },
    }
  }

  return { set, setPose, setSpin, resize, destroy, firstFrame }
}
