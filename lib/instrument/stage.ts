// The ChainScore instrument: a dial gauge that reads a wallet's score.
//
// It renders only while something on it is moving (the needle settling, the
// flag dropping, the cutoff zone lighting) and then stops, so scrolling past
// it costs nothing. Lazy-loaded; three.js never reaches the first bundle.
//
// Units: dial radius ~1, dial face at z = 0 facing +z.

import * as THREE from 'three'
import {
  ScaleSpec,
  drawDial,
  drawFlag,
  drawNeedleShadow,
  drawSunray,
  restAngle,
  scoreToAngle,
  SWEEP,
  START,
} from './dial'

export type Reading =
  | { kind: 'score'; score: number }
  | { kind: 'none' } // never borrowed: needle on its stop, flag in view

export interface InstrumentState {
  reading: Reading
  /** Light the flagged zone (scores below the operating cutoff). */
  zone: boolean
  /** Small changes of view between sections, in radians. */
  tilt?: [number, number]
}

export interface InstrumentHandle {
  set: (s: InstrumentState, opts?: { instant?: boolean }) => void
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
    const col = i % (segs + 1)
    if (col % 2 === 1) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      const k = (r - depth) / r
      pos.setX(i, x * k)
      pos.setZ(i, z * k)
    }
  }
  g.computeVertexNormals()
  g.rotateX(Math.PI / 2) // cylinder axis Y -> Z
  g.translate(0, 0, (z0 + z1) / 2)
  return g.toNonIndexed()
}

function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  // A dark studio with soft boxes, prefiltered for image-based lighting.
  // Built here rather than downloaded: no HDR file, nothing for CSP.
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x060607)
  const panel = (w: number, h: number, intensity: number, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide })
    )
    m.position.set(...pos)
    m.lookAt(...look)
    scene.add(m)
  }
  panel(7, 2.6, 9, [0.5, 4.2, 2.6], [0, 0, 0]) // key softbox, above and in front
  panel(0.8, 6, 6, [-4.6, 0.5, 1.6], [0, 0, 0]) // left strip
  panel(0.6, 6, 3.5, [4.8, -0.2, 2.0], [0, 0, 0]) // right strip
  panel(5, 2, 0.6, [0, -4, 3], [0, 0, 0]) // low fill
  panel(2.4, 2.4, 1.2, [2.8, 2.6, -3.5], [0, 0, 0]) // kicker behind
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

export async function mountInstrument(canvas: HTMLCanvasElement, spec: ScaleSpec, initial: InstrumentState): Promise<InstrumentHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.12

  const scene = new THREE.Scene()
  scene.environment = studioEnvironment(renderer)

  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 50)
  camera.position.set(0, 0, 8.1)

  const root = new THREE.Group()
  scene.add(root)

  await document.fonts?.ready
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() || 'sans-serif'
  const maxAniso = renderer.capabilities.getMaxAnisotropy()

  // --- case, bezel, rehaut -------------------------------------------------
  // Turned parts are lathes whose winding varies by profile; render both
  // sides rather than depend on it.
  const steelPolish = new THREE.MeshPhysicalMaterial({ color: 0xd9dade, metalness: 1, roughness: 0.14, side: THREE.DoubleSide })
  const steelBrushed = new THREE.MeshPhysicalMaterial({
    color: 0xcfd1d6,
    metalness: 1,
    roughness: 0.3,
    anisotropy: 0.75,
    anisotropyRotation: 0,
    side: THREE.DoubleSide,
  })
  const caseBody = new THREE.Mesh(
    lathe([
      [0, -0.34],
      [1.08, -0.34],
      [1.12, -0.32],
      [1.15, -0.27],
      [1.155, -0.04],
    ]),
    steelPolish
  )
  root.add(caseBody)
  // bezel: polished inner chamfer down to the dial, brushed flat top
  const bezelChamfer = new THREE.Mesh(
    lathe([
      [0.975, -0.002],
      [0.985, 0.012],
      [1.035, 0.072],
    ]),
    steelPolish
  )
  const bezelTop = new THREE.Mesh(
    lathe([
      [1.035, 0.072],
      [1.06, 0.082],
      [1.12, 0.084],
      [1.15, 0.07],
      [1.165, 0.045],
    ]),
    steelBrushed
  )
  root.add(bezelChamfer, bezelTop)
  const knurled = new THREE.Mesh(knurl(1.168, -0.05, 0.045, 180, 0.008), steelPolish)
  root.add(knurled)
  // the dark rehaut ring between dial and bezel
  const rehaut = new THREE.Mesh(
    lathe([
      [0.952, 0.0008],
      [0.978, 0.016],
    ]),
    new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide })
  )
  root.add(rehaut)

  // --- dial: sunray-brushed dark metal with a cut flag window --------------
  const winW = 0.36 * 0.97
  const winH = 0.115 * 0.97
  const winY = -0.36 * 0.97
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
  // UVs from position so the textures map across the disc
  {
    const pos = faceGeo.attributes.position as THREE.BufferAttribute
    const uv = faceGeo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.944 + 0.5, pos.getY(i) / 1.944 + 0.5)
  }
  const sunray = new THREE.CanvasTexture(drawSunray(512))
  sunray.colorSpace = THREE.NoColorSpace
  const dialBase = new THREE.MeshPhysicalMaterial({
    color: 0x1b1d21,
    metalness: 0.85,
    roughness: 0.34,
    anisotropy: 0.95,
    anisotropyMap: sunray,
  })
  root.add(new THREE.Mesh(faceGeo, dialBase))

  const print = new THREE.CanvasTexture(drawDial(spec, font))
  print.colorSpace = THREE.SRGBColorSpace
  print.anisotropy = maxAniso
  const printMat = new THREE.MeshPhysicalMaterial({
    map: print,
    transparent: true,
    roughness: 0.55,
    metalness: 0,
    depthWrite: false,
  })
  const printMesh = new THREE.Mesh(faceGeo, printMat)
  printMesh.position.z = 0.0012
  root.add(printMesh)

  // window: dark well behind the aperture, and the flag that slides in
  const well = new THREE.Mesh(
    new THREE.PlaneGeometry(winW * 1.6, winH * 1.6),
    new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.8 })
  )
  well.position.set(0, winY, -0.03)
  root.add(well)
  const flagTex = new THREE.CanvasTexture(drawFlag(font))
  flagTex.colorSpace = THREE.SRGBColorSpace
  flagTex.anisotropy = maxAniso
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(winW * 1.02, winH * 1.02),
    new THREE.MeshPhysicalMaterial({ map: flagTex, roughness: 0.6, metalness: 0 })
  )
  flag.position.set(0, winY, -0.012)
  root.add(flag)
  const FLAG_IN = 0
  const FLAG_OUT = -winW * 1.15

  // applied polished batons at the major marks
  const batonGeo = new THREE.BoxGeometry(0.075, 0.016, 0.01)
  for (let s = spec.min; s <= spec.max; s += 50) {
    const a = scoreToAngle(s, spec)
    const b = new THREE.Mesh(batonGeo, steelPolish)
    const r = 0.97 * 0.5 * 0.795 * 2
    b.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.006)
    b.rotation.z = a
    root.add(b)
  }

  // flagged zone: a ruby arc from the minimum to the cutoff, faded in on cue
  const a0 = scoreToAngle(spec.min, spec)
  const a1 = scoreToAngle(spec.cutoff, spec)
  // between the numerals and the ticks
  const zoneGeo = new THREE.RingGeometry(0.716, 0.742, 120, 1, a1, a0 - a1)
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xe95c68, transparent: true, opacity: 0, depthWrite: false })
  const zone = new THREE.Mesh(zoneGeo, zoneMat)
  zone.position.z = 0.002
  root.add(zone)

  // --- needle ---------------------------------------------------------------
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
  const shaftGeo = new THREE.ExtrudeGeometry(shaft, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.002,
    bevelSegments: 2,
    curveSegments: 4,
  })
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0xf1eee7, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 })
  needle.add(new THREE.Mesh(shaftGeo, lacquer))
  const tip = new THREE.Shape()
  tip.moveTo(0.7, -0.006)
  tip.lineTo(0.84, -0.0018)
  tip.lineTo(0.84, 0.0018)
  tip.lineTo(0.7, 0.006)
  tip.closePath()
  const tipMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(tip, { depth: 0.008, bevelEnabled: false }),
    new THREE.MeshPhysicalMaterial({ color: 0xe95c68, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 })
  )
  needle.add(tipMesh)
  const counter = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 48), lacquer)
  counter.rotation.x = Math.PI / 2
  counter.position.set(-0.17, 0, 0.004)
  needle.add(counter)
  const hub = new THREE.Mesh(
    lathe([
      [0, 0.03],
      [0.03, 0.028],
      [0.055, 0.016],
      [0.062, 0.0],
      [0.062, -0.01],
    ], 64),
    steelPolish
  )
  hub.position.z = 0.012
  needle.add(hub)

  // soft shadow on the dial, offset as if lit from the upper left
  const shadowTex = new THREE.CanvasTexture(drawNeedleShadow(512))
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 2.0),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false })
  )
  shadow.position.set(0.02, -0.03, 0.0025)
  root.add(shadow)

  // --- crystal: reflections only (black dielectric, additive) -------------
  const a = 0.985
  const h = 0.085
  const Rs = (a * a + h * h) / (2 * h)
  const crystalGeo = new THREE.SphereGeometry(Rs, 96, 16, 0, Math.PI * 2, 0, Math.asin(a / Rs))
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
      side: THREE.FrontSide,
    })
  )
  crystal.position.z = 0.075 + h - Rs
  root.add(crystal)

  // --- state and the render-on-demand loop ----------------------------------
  const needleRest = restAngle()
  let angle = initial.reading.kind === 'score' ? scoreToAngle(initial.reading.score, spec) : needleRest
  let velocity = 0
  let target = angle
  let flagX = initial.reading.kind === 'none' ? FLAG_IN : FLAG_OUT
  let flagTarget = flagX
  let zoneOpacity = initial.zone ? 0.9 : 0
  let zoneTarget = zoneOpacity
  const tilt = new THREE.Vector2(...(initial.tilt ?? [-0.28, 0.32]))
  const tiltTarget = tilt.clone()

  const apply = () => {
    needle.rotation.z = angle
    shadow.rotation.z = angle
    flag.position.x = flagX
    zoneMat.opacity = zoneOpacity
    root.rotation.x = tilt.x
    root.rotation.y = tilt.y
  }
  apply()

  let raf = 0
  let last = 0
  let resolveFirst: () => void = () => {}
  const firstFrame = new Promise<void>((r) => (resolveFirst = r))
  let rendered = false

  const frame = (t: number) => {
    raf = 0
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60
    last = t
    // needle: a damped spring, slightly underdamped like a real movement
    const k = 120
    const c = 16
    velocity += (k * (target - angle) - c * velocity) * dt
    angle += velocity * dt
    flagX += (flagTarget - flagX) * Math.min(1, dt * 12)
    zoneOpacity += (zoneTarget - zoneOpacity) * Math.min(1, dt * 9)
    tilt.lerp(tiltTarget, Math.min(1, dt * 7))
    apply()
    renderer.render(scene, camera)
    if (!rendered) {
      rendered = true
      resolveFirst()
    }
    const moving =
      Math.abs(target - angle) > 0.001 ||
      Math.abs(velocity) > 0.002 ||
      Math.abs(flagTarget - flagX) > 0.001 ||
      Math.abs(zoneTarget - zoneOpacity) > 0.005 ||
      tilt.distanceTo(tiltTarget) > 0.001
    if (moving) raf = requestAnimationFrame(frame)
    else last = 0
  }
  const invalidate = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  // Compile shaders off the main thread where the driver allows it, so the
  // first frame cannot stall the page.
  try {
    await renderer.compileAsync(scene, camera)
  } catch {
    // older drivers: compile happens on first render instead
  }

  const resize = () => {
    const w = canvas.clientWidth
    const hgt = canvas.clientHeight
    if (!w || !hgt) return
    renderer.setSize(w, hgt, false)
    camera.aspect = w / hgt
    camera.updateProjectionMatrix()
    invalidate()
  }
  resize()

  const set = (s: InstrumentState, opts?: { instant?: boolean }) => {
    target = s.reading.kind === 'score' ? scoreToAngle(s.reading.score, spec) : needleRest
    flagTarget = s.reading.kind === 'none' ? FLAG_IN : FLAG_OUT
    zoneTarget = s.zone ? 0.9 : 0
    if (s.tilt) tiltTarget.set(...s.tilt)
    if (opts?.instant) {
      angle = target
      velocity = 0
      flagX = flagTarget
      zoneOpacity = zoneTarget
      tilt.copy(tiltTarget)
    }
    invalidate()
  }

  const destroy = () => {
    if (raf) cancelAnimationFrame(raf)
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry.dispose()
        const m = mesh.material as THREE.Material & { map?: THREE.Texture }
        m.map?.dispose()
        m.dispose()
      }
    })
    scene.environment?.dispose()
    renderer.dispose()
  }

  // keep linters honest about the exported constants we rely on
  void SWEEP
  void START

  // Development aid: inspect the scene from the console.
  if (process.env.NODE_ENV !== 'production') {
    ;(window as unknown as { __instrument?: unknown }).__instrument = {
      scene,
      crystal,
      parts: { caseBody, bezelChamfer, bezelTop, knurled, rehaut, well, flag, zone, shadow, needle },
      render: () => renderer.render(scene, camera),
      set,
    }
  }

  return { set, resize, destroy, firstFrame }
}
