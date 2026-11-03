// Scroll choreography for the backtest sculpture. The stage is five
// viewport-tall steps; step i is centred when progress = i / 4, and the
// sculpture's phase is keyed to those centres so each caption arrives with
// the state it describes.

import * as THREE from 'three'
import { createStage, type Quality } from './stage'
import { buildBacktest, type MatrixCounts } from './backtest'
import { onTick, ease, range, lerp } from '@/lib/motion/engine'

export type BacktestLabelKey = 'tp' | 'fn' | 'fp' | 'tn' | 'flagged' | 'cleared' | 'cut'

export interface BacktestSceneOptions {
  counts: MatrixCounts
  labels: Partial<Record<BacktestLabelKey, HTMLElement>>
  quality?: Quality
}

export interface BacktestController {
  setProgress: (p: number) => void
  setActive: (a: boolean) => void
  setDark: (d: boolean) => void
  firstFrame: Promise<void>
  destroy: () => void
}

/** Stage progress to sculpture phase (0 cloud .. 4 matrix). */
export function phaseFor(p: number): number {
  return (
    0.6 +
    0.4 * ease.outCubic(range(p, 0, 0.06)) +
    ease.inOutCubic(range(p, 0.1, 0.24)) +
    ease.inOutCubic(range(p, 0.34, 0.48)) +
    ease.inOutCubic(range(p, 0.58, 0.73))
  )
}

export async function mountBacktest(
  canvas: HTMLCanvasElement,
  opts: BacktestSceneOptions
): Promise<BacktestController> {
  const stage = createStage(canvas, { quality: opts.quality, fov: 26 })
  const sculpt = buildBacktest(opts.counts, stage.quality)
  stage.scene.add(sculpt.group)

  // The paper becomes a floor here.
  stage.catcher.rotation.x = -Math.PI / 2
  stage.catcher.position.y = -0.001
  stage.key.position.set(3.5, 9, 4.5)
  stage.key.shadow.camera.left = -4
  stage.key.shadow.camera.right = 4
  stage.key.shadow.camera.top = 4
  stage.key.shadow.camera.bottom = -4
  stage.key.shadow.camera.updateProjectionMatrix()

  const camFrom = new THREE.Vector3()
  const camTo = new THREE.Vector3()
  const look = new THREE.Vector3()
  const v = new THREE.Vector3()

  let progress = 0
  let active = true
  let dark = false
  let clock = 0

  const vis = (key: BacktestLabelKey, alpha: number) => {
    const el = opts.labels[key]
    if (!el) return
    el.style.opacity = String(alpha)
    el.style.visibility = alpha > 0.01 ? 'visible' : 'hidden'
  }

  function frame(dt: number) {
    clock += dt
    const phase = phaseFor(progress)
    sculpt.update(phase, clock)

    // Camera: front-on for the cloud, elevated three-quarter for the matrix.
    const portrait = stage.size.aspect < 0.85
    const tm = ease.inOutCubic(range(phase, 3, 4))
    const ts = ease.inOutCubic(range(phase, 2, 3))
    camFrom.set(0, 1.15, portrait ? 14 : 8.9)
    camTo.set(portrait ? 3.2 : 3.7, portrait ? 7.4 : 4.7, portrait ? 11 : 7.6)
    stage.camera.position.copy(camFrom).lerp(camTo, tm)
    stage.camera.position.z += ts * (1 - tm) * 0.4
    look.set(0, lerp(0.95, 0.42, tm), 0)
    stage.camera.lookAt(look)

    // Desktop: frame the sculpture right of the captions.
    const w = stage.size.width
    const h = stage.size.height
    if (!portrait) {
      stage.camera.setViewOffset(w, h, -w * 0.17, 0, w, h)
    } else {
      stage.camera.setViewOffset(w, h, 0, h * 0.25, w, h)
    }

    // Labels.
    const place = (key: BacktestLabelKey, p: THREE.Vector3) => {
      const el = opts.labels[key]
      if (!el) return
      v.copy(p).project(stage.camera)
      const x = (v.x * 0.5 + 0.5) * w
      const y = (-v.y * 0.5 + 0.5) * h
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    }
    ;(['tp', 'fn', 'fp', 'tn', 'flagged', 'cleared', 'cut'] as BacktestLabelKey[]).forEach((k) =>
      place(k, sculpt.anchors[k])
    )
    const split = range(phase, 2.55, 2.85) * (1 - range(phase, 3.15, 3.4))
    vis('flagged', split)
    vis('cleared', split)
    vis('cut', range(phase, 2.45, 2.7))
    const cells = range(phase, 3.7, 3.95)
    vis('tp', cells)
    vis('fn', cells)
    vis('fp', cells)
    vis('tn', cells)

    stage.render()
  }

  let resolveFirst: () => void = () => {}
  const firstFrame = new Promise<void>((r) => (resolveFirst = r))
  let drawn = 0

  const stop = onTick((_t, dt) => {
    if (!active) return
    stage.resize()
    frame(dt)
    if (++drawn === 2) resolveFirst()
  })

  return {
    setProgress: (p) => {
      progress = p
    },
    setActive: (a) => {
      active = a
    },
    setDark: (d) => {
      dark = d
      stage.setDark(d)
      sculpt.setDark(d)
      stage.catcher.material.opacity = d ? 0.5 : 0.2
    },
    firstFrame,
    destroy: () => {
      stop()
      stage.dispose()
    },
  }
}
