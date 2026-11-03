// The backtest as an object. One block per holdout borrower (7,720 of
// them), arranged by what actually happened in the published backtest:
// first an undifferentiated cloud, then the liquidated wallets light up,
// then the operating cutoff splits flagged from cleared, and finally the
// blocks settle into the confusion matrix as four stacked waffles whose
// block counts are the real cell counts. Nothing is illustrative: counts
// come from reports/backtest/latest.json via the caller.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export interface MatrixCounts {
  tp: number // liquidated, flagged (caught)
  fn: number // liquidated, cleared (missed)
  fp: number // not liquidated, flagged (false alarm)
  tn: number // not liquidated, cleared
}

export type Cell = 'tp' | 'fn' | 'fp' | 'tn'

export interface BacktestSculpture {
  group: THREE.Group
  mesh: THREE.InstancedMesh
  cutPlane: THREE.Mesh
  /** World-space label anchors for the HTML overlay. */
  anchors: Record<Cell | 'flagged' | 'cleared' | 'cut', THREE.Vector3>
  /**
   * Drive the whole sequence from one number:
   * 0..1 cloud, 1..2 outcome revealed, 2..3 split at the cutoff,
   * 3..4 confusion matrix.
   */
  update: (phase: number, time: number) => void
  setDark: (dark: boolean) => void
  count: number
}

const PITCH = 0.058
const SIZE = 0.045
// Blocks per row in a waffle layer. A 12 x 12 footprint stacks the cells
// into towers, so the matrix reads from its silhouette: two tall grey
// towers, a red one, and a red stub for the misses.
const FOOT = 12

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smooth(t: number) {
  t = Math.min(1, Math.max(0, t))
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function buildBacktest(counts: MatrixCounts, quality: 'high' | 'low'): BacktestSculpture {
  const n = counts.tp + counts.fn + counts.fp + counts.tn
  const rand = mulberry32(7720)
  const group = new THREE.Group()

  const geo =
    quality === 'high'
      ? new RoundedBoxGeometry(SIZE, SIZE, SIZE, 2, SIZE * 0.16)
      : new THREE.BoxGeometry(SIZE, SIZE, SIZE)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.46, metalness: 0.0 })
  const mesh = new THREE.InstancedMesh(geo, mat, n)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.castShadow = quality === 'high'
  mesh.receiveShadow = quality === 'high'
  mesh.frustumCulled = false
  group.add(mesh)

  // Category per instance, in cell order.
  const cell: Cell[] = new Array(n)
  let k = 0
  ;(['tp', 'fn', 'fp', 'tn'] as Cell[]).forEach((c) => {
    for (let i = 0; i < counts[c]; i++) cell[k++] = c
  })
  const liquidated = (c: Cell) => c === 'tp' || c === 'fn'
  const flagged = (c: Cell) => c === 'tp' || c === 'fp'

  // ---------- Layouts ----------
  const cloud = new Float32Array(n * 3)
  const split = new Float32Array(n * 3)
  const matrix = new Float32Array(n * 3)
  const spin = new Float32Array(n * 3)
  const delay = new Float32Array(n)
  const lift = new Float32Array(n)

  // Cloud: a soft, slightly flattened galaxy of wallets.
  for (let i = 0; i < n; i++) {
    const u = rand()
    const v = rand()
    const theta = u * Math.PI * 2
    const phi = Math.acos(2 * v - 1)
    const r = Math.pow(rand(), 0.6) * 1.55
    cloud[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.2
    cloud[i * 3 + 1] = 1.0 + r * Math.cos(phi) * 0.7
    cloud[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    spin[i * 3] = (rand() - 0.5) * Math.PI * 2
    spin[i * 3 + 1] = (rand() - 0.5) * Math.PI * 2
    spin[i * 3 + 2] = (rand() - 0.5) * Math.PI * 2
    delay[i] = rand()
    lift[i] = 0.25 + rand() * 0.55
  }

  // Split: flagged gather left of the cutoff, cleared to the right.
  const flaggedN = counts.tp + counts.fp
  const clearedN = counts.fn + counts.tn
  const rF = 0.82 * Math.cbrt(flaggedN / 4000)
  const rC = 0.82 * Math.cbrt(clearedN / 4000)
  for (let i = 0; i < n; i++) {
    const isF = flagged(cell[i])
    const cx = isF ? -1.15 : 1.15
    const rad = isF ? rF : rC
    const u = rand()
    const v = rand()
    const theta = u * Math.PI * 2
    const phi = Math.acos(2 * v - 1)
    const r = Math.pow(rand(), 0.55) * rad
    split[i * 3] = cx + r * Math.sin(phi) * Math.cos(theta)
    split[i * 3 + 1] = 0.95 + r * Math.cos(phi) * 0.85
    split[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }

  // Matrix: four waffles. Columns: flagged (left) / cleared (right).
  // Rows: liquidated (front) / not liquidated (back).
  const half = (FOOT * PITCH) / 2
  const gapX = 0.7
  const gapZ = 0.5
  const origin: Record<Cell, THREE.Vector3> = {
    tp: new THREE.Vector3(-(half + gapX / 2), 0, half + gapZ / 2),
    fn: new THREE.Vector3(half + gapX / 2, 0, half + gapZ / 2),
    fp: new THREE.Vector3(-(half + gapX / 2), 0, -(half + gapZ / 2)),
    tn: new THREE.Vector3(half + gapX / 2, 0, -(half + gapZ / 2)),
  }
  const filled: Record<Cell, number> = { tp: 0, fn: 0, fp: 0, tn: 0 }
  const heights: Record<Cell, number> = { tp: 0, fn: 0, fp: 0, tn: 0 }
  for (let i = 0; i < n; i++) {
    const c = cell[i]
    const j = filled[c]++
    const layerN = FOOT * FOOT
    const layer = Math.floor(j / layerN)
    const inLayer = j % layerN
    const row = Math.floor(inLayer / FOOT)
    const col = inLayer % FOOT
    const o = origin[c]
    matrix[i * 3] = o.x - half + PITCH * (col + 0.5)
    matrix[i * 3 + 1] = SIZE / 2 + layer * PITCH
    matrix[i * 3 + 2] = o.z - half + PITCH * (row + 0.5)
    heights[c] = Math.max(heights[c], (layer + 1) * PITCH)
  }
  // Tallest stack, so the settle wave can be normalised to finish on time.
  const maxH = Math.max(heights.tp, heights.fn, heights.fp, heights.tn)

  // Cutoff: a translucent ultramarine pane with a crisp top edge during the
  // split, lowering into a thin line on the floor once the matrix forms.
  const cutPlane = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x1a3cff, transparent: true, opacity: 0.12, depthWrite: false })
  )
  cutPlane.scale.set(1, 0.001, 0.001)
  cutPlane.renderOrder = 3
  group.add(cutPlane)
  const cutEdge = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.012, 1),
    new THREE.MeshBasicMaterial({ color: 0x1a3cff })
  )
  cutEdge.scale.set(1, 1, 0.001)
  group.add(cutEdge)

  const anchors = {
    tp: new THREE.Vector3(origin.tp.x, heights.tp + 0.14, origin.tp.z),
    fn: new THREE.Vector3(origin.fn.x, heights.fn + 0.14, origin.fn.z),
    fp: new THREE.Vector3(origin.fp.x, heights.fp + 0.14, origin.fp.z),
    tn: new THREE.Vector3(origin.tn.x, heights.tn + 0.14, origin.tn.z),
    flagged: new THREE.Vector3(-1.15, 0.95 + rF + 0.22, 0),
    cleared: new THREE.Vector3(1.15, 0.95 + rC + 0.22, 0),
    cut: new THREE.Vector3(0, 2.0, 0),
  }

  // ---------- Colour ----------
  const ink = new THREE.Color()
  const signal = new THREE.Color()
  const tmpC = new THREE.Color()
  let dark = false
  function setPalette(isDark: boolean) {
    dark = isDark
    // Fine wallets recede in warm grey; liquidated ones carry the story.
    ink.set(isDark ? 0x8d8980 : 0x9b978d).convertSRGBToLinear()
    signal.set(isDark ? 0xff5a3c : 0xd0371f).convertSRGBToLinear()
  }
  setPalette(false)
  for (let i = 0; i < n; i++) mesh.setColorAt(i, ink)

  // ---------- Animation ----------
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3(1, 1, 1)
  let lastPhase = -1
  let lastColorPhase = -1
  let lastDark = false
  let lastTime = -1
  // Cloud drift accumulates only while the cloud is on stage, so blocks
  // paused mid-flight never jump when scrolling resumes.
  let drift = 0

  function update(phase: number, time: number) {
    const dt = lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, time - lastTime))
    lastTime = time
    const cloudLive = phase < 2
    if (cloudLive) drift += dt
    const cloudSpin = drift * 0.06
    const cs = Math.cos(cloudSpin)
    const sn = Math.sin(cloudSpin)
    const moving = cloudLive || Math.abs(phase - lastPhase) > 1e-4
    if (moving) {
      for (let i = 0; i < n; i++) {
        const i3 = i * 3
        // Cloud position, slowly turning about the vertical axis.
        const cx = cloud[i3]
        const cz = cloud[i3 + 2]
        let x = cx * cs - cz * sn
        let y = cloud[i3 + 1]
        let z = cx * sn + cz * cs
        let rx = spin[i3] + drift * 0.15
        let ry = spin[i3 + 1]
        let rz = spin[i3 + 2]
        let sc = 1

        if (phase > 1 && phase <= 2) {
          // Outcome: liquidated blocks swell briefly as they light up.
          const t = smooth((phase - 1 - delay[i] * 0.5) / 0.5)
          if (liquidated(cell[i])) sc = 1 + Math.sin(t * Math.PI) * 0.45
        }
        if (phase > 2) {
          const t = smooth((Math.min(phase, 3) - 2 - delay[i] * 0.45) / 0.55)
          const ax = x
          const ay = y
          const az = z
          x = ax + (split[i3] - ax) * t
          y = ay + (split[i3 + 1] - ay) * t + Math.sin(t * Math.PI) * lift[i]
          z = az + (split[i3 + 2] - az) * t
          rx *= 1 - t * 0.6
          ry *= 1 - t * 0.6
          rz *= 1 - t * 0.6
        }
        if (phase > 3) {
          // Settle into the waffles in a wave that runs bottom-up, finishing
          // exactly at phase 4 even for the top layer of the tallest stack.
          const order = matrix[i3 + 1] / maxH
          const t = smooth((phase - 3 - (order * 0.35 + delay[i] * 0.15)) / 0.5)
          const ax = x
          const ay = y
          const az = z
          x = ax + (matrix[i3] - ax) * t
          y = ay + (matrix[i3 + 1] - ay) * t + Math.sin(t * Math.PI) * lift[i] * 0.6
          z = az + (matrix[i3 + 2] - az) * t
          rx *= 1 - t
          ry *= 1 - t
          rz *= 1 - t
        }
        p.set(x, y, z)
        e.set(rx, ry, rz)
        q.setFromEuler(e)
        s.setScalar(sc)
        m4.compose(p, q, s)
        mesh.setMatrixAt(i, m4)
      }
      mesh.instanceMatrix.needsUpdate = true
    }

    // Colour only changes during the outcome reveal (or on theme change).
    const colorPhase = Math.min(2, Math.max(1, phase))
    if (colorPhase !== lastColorPhase || dark !== lastDark) {
      for (let i = 0; i < n; i++) {
        if (!liquidated(cell[i])) {
          mesh.setColorAt(i, ink)
          continue
        }
        const t = smooth((colorPhase - 1 - delay[i] * 0.5) / 0.5)
        tmpC.copy(ink).lerp(signal, t)
        mesh.setColorAt(i, tmpC)
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      lastColorPhase = colorPhase
      lastDark = dark
    }

    // The cutoff grows in during the split; when the matrix forms it lowers
    // to a line on the floor between the flagged and cleared columns.
    const blade = smooth((phase - 2.05) / 0.5)
    const settle = smooth((phase - 3.2) / 0.6)
    const height = (2.0 * (1 - settle) + 0.004 * settle) * blade
    const depth = (1.9 + settle * 1.5) * blade
    cutPlane.scale.set(1, Math.max(0.001, height), Math.max(0.001, depth))
    cutPlane.position.set(0, height / 2, 0)
    cutPlane.visible = blade > 0.001
    cutEdge.scale.set(1, 1, Math.max(0.001, depth))
    cutEdge.position.set(0, Math.max(0.006, height), 0)
    cutEdge.visible = blade > 0.001
    // Its label rides the top edge, then the near end of the floor line.
    anchors.cut.set(0, Math.max(0.02, height) + 0.08 * (1 - settle), (depth / 2 + 0.12) * settle)

    lastPhase = phase
  }

  return {
    group,
    mesh,
    cutPlane,
    anchors,
    update,
    setDark: (d) => setPalette(d),
    count: n,
  }
}
