// Scroll choreography for CS-1. The stage section's progress (0..1) is the
// timeline: hero pose, a slow quarter-turn while the manifesto reads, then
// the exploded view with the four factor-group gears labelled. Poses are
// written in normalized screen space (centre offset and diameter as a
// fraction of viewport height) so the same timeline frames correctly on a
// 27-inch display and on a phone.

import * as THREE from 'three'
import { createStage, type Quality } from './stage'
import { buildInstrument, type Reading } from './instrument'
import { loadFonts, resolveFonts, type ScaleSpec } from './textures'
import { onTick, ease, range, lerp } from '@/lib/motion/engine'

export interface IllustrativeReading extends Reading {
  grade: string
}

export interface InstrumentSceneOptions {
  spec: ScaleSpec
  readings: IllustrativeReading[]
  /** Labels for the four gears, in factor-group order. */
  labels: HTMLElement[]
  /** Elbowed leader lines (SVG polylines), one per label. */
  leaders: SVGPolylineElement[]
  /** The "no borrow history" callout shown while the manifesto reads. */
  callout?: HTMLElement | null
  onReading?: (r: IllustrativeReading) => void
  quality?: Quality
}

/** Progress windows, measured from the page layout by the stage. */
export interface Timeline {
  turn: [number, number]
  explode: [number, number]
}

export interface InstrumentController {
  setProgress: (p: number) => void
  setTimeline: (t: Timeline) => void
  setPointer: (nx: number, ny: number) => void
  measure: () => void
  /** A small kick of the needle, e.g. while an address is being typed. */
  nudge: () => void
  setActive: (active: boolean) => void
  setDark: (dark: boolean) => void
  hitTest: (clientX: number, clientY: number) => boolean
  /** Resolves after the first frame has been drawn. */
  firstFrame: Promise<void>
  destroy: () => void
}

interface Pose {
  nx: number
  ny: number
  size: number
  yaw: number
  pitch: number
  roll: number
  explode: number
}

function poses(aspect: number): { hero: Pose; turn: Pose; exploded: Pose } {
  if (aspect < 0.85) {
    // Portrait phones: the instrument sits in the upper half, copy below.
    return {
      hero: { nx: 0, ny: 0.3, size: 0.4, yaw: -12, pitch: 6, roll: 0, explode: 0 },
      turn: { nx: 0.3, ny: 0.52, size: 0.3, yaw: -40, pitch: 16, roll: -8, explode: 0 },
      exploded: { nx: 0.02, ny: 0.4, size: 0.24, yaw: -62, pitch: 22, roll: -4, explode: 1 },
    }
  }
  if (aspect < 1.25) {
    return {
      hero: { nx: 0.4, ny: 0.06, size: 0.5, yaw: -16, pitch: 7, roll: 0, explode: 0 },
      turn: { nx: 0.5, ny: 0.0, size: 0.46, yaw: -40, pitch: 15, roll: -8, explode: 0 },
      exploded: { nx: 0.2, ny: 0.02, size: 0.36, yaw: -60, pitch: 21, roll: -4, explode: 1 },
    }
  }
  return {
    hero: { nx: 0.44, ny: -0.02, size: 0.68, yaw: -16, pitch: 7, roll: 0, explode: 0 },
    turn: { nx: 0.56, ny: -0.02, size: 0.58, yaw: -42, pitch: 15, roll: -8, explode: 0 },
    exploded: { nx: 0.36, ny: 0.02, size: 0.44, yaw: -60, pitch: 21, roll: -4, explode: 1 },
  }
}

function mix(a: Pose, b: Pose, t: number): Pose {
  return {
    nx: lerp(a.nx, b.nx, t),
    ny: lerp(a.ny, b.ny, t),
    size: lerp(a.size, b.size, t),
    yaw: lerp(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    roll: lerp(a.roll, b.roll, t),
    explode: lerp(a.explode, b.explode, t),
  }
}

const D2R = Math.PI / 180

export async function mountInstrument(
  canvas: HTMLCanvasElement,
  opts: InstrumentSceneOptions
): Promise<InstrumentController> {
  const fonts = resolveFonts()
  await loadFonts(fonts)
  const stage = createStage(canvas, { quality: opts.quality, fov: 24 })
  const inst = buildInstrument(stage.renderer, fonts, opts.spec, stage.quality)
  stage.scene.add(inst.root)

  const CAM_D = 9
  stage.camera.position.set(0, 0, CAM_D)
  stage.camera.lookAt(0, 0, 0)
  // The paper wall the instrument hangs in front of.
  stage.catcher.position.z = -2.6
  stage.key.position.set(1.6, 4.8, 9)

  let progress = 0
  let timeline: Timeline = { turn: [0.1, 0.36], explode: [0.44, 0.7] }
  let active = true
  let dark = false
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
  let readingIndex = -1
  let idle = false
  let calloutAlpha = 0
  let nextReadingAt = 0
  let clock = 0
  let selfTest = 0.9 // seconds of power-on sweep to full scale

  // Power-on self-test: sweep to 850, then settle on the first reading.
  inst.setTarget({ score: opts.spec.max, pd: 0.001, completeness: 1 })

  function measure() {
    readingIndex = (readingIndex + 1) % opts.readings.length
    const r = opts.readings[readingIndex]
    inst.setTarget(r)
    inst.agitate(1)
    opts.onReading?.(r)
    nextReadingAt = clock + 6.5
  }

  const project = new THREE.Vector3()
  const box = new THREE.Box3()
  const sphere = new THREE.Sphere()

  function applyPose(dt: number) {
    const ps = poses(stage.size.aspect)
    // Timeline: hero hold, turn while the manifesto reads, explode.
    const tTurn = ease.inOutCubic(range(progress, timeline.turn[0], timeline.turn[1]))
    const tExplode = ease.inOutCubic(range(progress, timeline.explode[0], timeline.explode[1]))
    let pose = mix(ps.hero, ps.turn, tTurn)
    pose = mix(pose, ps.exploded, tExplode)

    // Cursor parallax, strongest in the hero.
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 4)
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 4)
    const par = 1 - tExplode * 0.6

    const { halfW, halfH } = stage.viewAt(CAM_D)
    const scale = (pose.size * 2 * halfH) / (2 * inst.radius)
    inst.root.position.set(pose.nx * halfW, pose.ny * halfH, 0)
    inst.root.scale.setScalar(scale)
    inst.root.rotation.set(
      (pose.pitch - pointer.sy * 5 * par) * D2R,
      (pose.yaw + pointer.sx * 7 * par) * D2R,
      pose.roll * D2R
    )

    // A soft shadow grounds the hero; it leaves once the instrument turns.
    stage.catcher.material.opacity = (dark ? 0.3 : 0.075) * (1 - tTurn)

    // No reading while the manifesto makes its point: needle on the pin,
    // counter at 000. Back to measuring when the reader returns.
    const manifesto = progress > timeline.turn[0] + (timeline.turn[1] - timeline.turn[0]) * 0.4 && progress < timeline.explode[0]
    if (manifesto !== idle) {
      idle = manifesto
      inst.setIdle(idle)
      if (!idle && progress < timeline.turn[0]) measure()
    }
    if (opts.callout) {
      const a = manifesto ? 1 : 0
      calloutAlpha += (a - calloutAlpha) * Math.min(1, dt * 6)
      inst.anchors.dial.getWorldPosition(project)
      project.project(stage.camera)
      const cx = (project.x * 0.5 + 0.5) * stage.size.width
      const cy = (-project.y * 0.5 + 0.5) * stage.size.height
      opts.callout.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`
      opts.callout.style.opacity = calloutAlpha.toFixed(3)
      opts.callout.style.visibility = calloutAlpha > 0.01 ? 'visible' : 'hidden'
    }

    // Gears turn with scroll through the exploded section.
    const spin = range(progress, timeline.explode[0], 1) * 16
    inst.update(dt, { explode: pose.explode, spin })

    // Labels: the technical-drawing convention. Labels stand in an
    // aligned column right of the movement; an elbowed leader runs from
    // each gear to its label, sorted by height so leaders never cross.
    const e1 = timeline.explode[1]
    const labelAlpha = range(progress, e1 - 0.05, e1)
    const w = stage.size.width
    const h = stage.size.height
    inst.root.updateMatrixWorld()
    const pts = inst.gears.map((g, i) => {
      g.anchor.getWorldPosition(project)
      project.project(stage.camera)
      return { i, x: (project.x * 0.5 + 0.5) * w, y: (-project.y * 0.5 + 0.5) * h }
    })
    const colX = Math.min(w - 300, Math.max(...pts.map((p) => p.x)) + w * 0.06)
    const order = [...pts].sort((a, b) => a.y - b.y)
    const gap = Math.max(46, h * 0.07)
    const midY = order.reduce((acc, p) => acc + p.y, 0) / order.length
    const top = midY - (gap * (order.length - 1)) / 2
    order.forEach((p, k) => {
      const el = opts.labels[p.i]
      const line = opts.leaders[p.i]
      const ly = top + k * gap
      if (el) {
        el.style.transform = `translate3d(${colX.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`
        el.style.opacity = String(labelAlpha)
        el.style.visibility = labelAlpha > 0.01 ? 'visible' : 'hidden'
      }
      if (line) {
        const elbow = colX - 22
        line.setAttribute(
          'points',
          `${p.x.toFixed(1)},${p.y.toFixed(1)} ${elbow.toFixed(1)},${ly.toFixed(1)} ${(colX - 4).toFixed(1)},${ly.toFixed(1)}`
        )
        line.style.opacity = String(labelAlpha)
      }
    })
  }

  let resolveFirst: () => void = () => {}
  const firstFrame = new Promise<void>((r) => (resolveFirst = r))
  let framesDrawn = 0

  const stop = onTick((_t, dt) => {
    if (!active) return
    clock += dt
    stage.resize()
    if (selfTest > 0) {
      selfTest -= dt
      if (selfTest <= 0) measure()
    } else if (progress < timeline.turn[0] && clock > nextReadingAt) {
      measure()
    }
    applyPose(dt)
    stage.render()
    if (++framesDrawn === 2) resolveFirst()
  })

  return {
    setProgress: (p) => {
      progress = p
    },
    setTimeline: (t) => {
      timeline = t
    },
    setPointer: (nx, ny) => {
      pointer.x = nx
      pointer.y = ny
    },
    measure,
    nudge: () => inst.agitate(0.3),
    setActive: (a) => {
      active = a
    },
    setDark: (d) => {
      dark = d
      stage.setDark(d)
    },
    hitTest: (cx, cy) => {
      const rect = canvas.getBoundingClientRect()
      box.setFromObject(inst.root)
      box.getBoundingSphere(sphere)
      project.copy(sphere.center).project(stage.camera)
      const x = rect.left + (project.x * 0.5 + 0.5) * rect.width
      const y = rect.top + (-project.y * 0.5 + 0.5) * rect.height
      const r = (inst.radius * inst.root.scale.x * rect.height) / (2 * stage.viewAt(CAM_D).halfH)
      return Math.hypot(cx - x, cy - y) < r * 0.95
    },
    firstFrame,
    destroy: () => {
      stop()
      stage.dispose()
    },
  }
}
