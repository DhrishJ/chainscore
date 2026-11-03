// Shared WebGL stage: renderer, camera, physically based lighting, and a
// shadow catcher. Everything is procedural, nothing is downloaded: the
// environment map is a small photo studio built from emissive panels and
// prefiltered through PMREM, so metals and glass get real reflections
// without an HDR file (and without widening the CSP).

import * as THREE from 'three'

/**
 * A product-photography studio as an environment map: a long softbox over
 * the camera (the highlight band across glass and polished steel), two
 * tall strip lights (the bright edges on the knurled bezel), a warm fill
 * low in front, and a soft grey cyclorama. Emissive colours above 1.0 are
 * HDR radiance, which PMREM keeps in its half-float target.
 */
function studioScene(): THREE.Scene {
  const scene = new THREE.Scene()
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(30, 18, 30),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.36, 0.355, 0.345), side: THREE.BackSide })
  )
  room.position.y = 4
  scene.add(room)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.54, 0.52) })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -5
  scene.add(floor)

  const panel = (w: number, h: number, radiance: number, tint: [number, number, number] = [1, 1, 1]) =>
    new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(tint[0] * radiance, tint[1] * radiance, tint[2] * radiance),
        side: THREE.DoubleSide,
      })
    )

  const softbox = panel(14, 3.2, 9, [1, 0.985, 0.96])
  softbox.position.set(0, 7.5, 7.5)
  softbox.lookAt(0, 0, 0)
  scene.add(softbox)

  const stripL = panel(1.4, 12, 6.5, [0.96, 0.98, 1])
  stripL.position.set(-11, 2, 1)
  stripL.lookAt(0, 0, 0)
  scene.add(stripL)

  const stripR = panel(1.4, 12, 5, [1, 0.97, 0.93])
  stripR.position.set(11, 2, -2)
  stripR.lookAt(0, 0, 0)
  scene.add(stripR)

  const fill = panel(10, 2.4, 1.8, [1, 0.95, 0.88])
  fill.position.set(0, -3.5, 9)
  fill.lookAt(0, 0, 0)
  scene.add(fill)
  return scene
}

export type Quality = 'high' | 'low'

export interface StageOptions {
  fov?: number
  shadows?: boolean
  quality?: Quality
}

export interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  quality: Quality
  key: THREE.DirectionalLight
  rim: THREE.DirectionalLight
  catcher: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>
  size: { width: number; height: number; aspect: number }
  resize: () => void
  render: () => void
  /** Half extents of the view at a given distance in front of the camera. */
  viewAt: (distance: number) => { halfW: number; halfH: number }
  setDark: (dark: boolean) => void
  dispose: () => void
}

/** Coarse device tier: phones and low-core machines get the cheap path. */
export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'low'
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const cores = navigator.hardwareConcurrency || 4
  return coarse || small || cores <= 4 ? 'low' : 'high'
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function createStage(canvas: HTMLCanvasElement, opts: StageOptions = {}): Stage {
  const quality = opts.quality ?? detectQuality()
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality === 'high',
    alpha: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Khronos PBR Neutral: keeps the brand ultramarine and the paper tones
  // honest instead of the filmic hue shift ACES applies.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  const shadows = opts.shadows ?? true
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const studio = studioScene()
  const envRT = pmrem.fromScene(studio, 0.02)
  scene.environment = envRT.texture
  scene.environmentIntensity = 0.9
  studio.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    ;(m.material as THREE.Material | undefined)?.dispose()
  })
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(opts.fov ?? 24, 1, 0.1, 100)
  camera.position.set(0, 0, 9)

  // Key light, high and to the right, like a softbox over a product table.
  const key = new THREE.DirectionalLight(0xfffaf2, 2.1)
  key.position.set(3.5, 5.5, 6)
  key.castShadow = shadows
  key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 30
  key.shadow.camera.left = -6
  key.shadow.camera.right = 6
  key.shadow.camera.top = 6
  key.shadow.camera.bottom = -6
  key.shadow.radius = 6
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key)

  // Cool rim from behind-left to draw the machined edges out of the paper.
  const rim = new THREE.DirectionalLight(0xdfe6ff, 1.1)
  rim.position.set(-5, 2.5, -4)
  scene.add(rim)

  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ color: 0x1a1712, opacity: 0.12 })
  )
  catcher.receiveShadow = shadows
  scene.add(catcher)

  const size = { width: 1, height: 1, aspect: 1 }
  const maxDpr = quality === 'high' ? 1.75 : 1.35

  function resize() {
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    if (w === size.width && h === size.height) return
    size.width = w
    size.height = h
    size.aspect = w / h
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr))
    renderer.setSize(w, h, false)
    camera.aspect = size.aspect
    camera.updateProjectionMatrix()
  }

  function viewAt(distance: number) {
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance
    return { halfW: halfH * camera.aspect, halfH }
  }

  function setDark(dark: boolean) {
    catcher.material.opacity = dark ? 0.42 : 0.12
    catcher.material.color.set(dark ? 0x000000 : 0x1a1712)
    scene.environmentIntensity = dark ? 0.8 : 0.9
  }

  resize()

  return {
    renderer,
    scene,
    camera,
    quality,
    key,
    rim,
    catcher,
    size,
    resize,
    render: () => renderer.render(scene, camera),
    viewAt,
    setDark,
    dispose: () => {
      envRT.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(disposeMaterial)
        else if (mat) disposeMaterial(mat)
      })
      renderer.dispose()
    },
  }
}

function disposeMaterial(m: THREE.Material) {
  for (const v of Object.values(m)) {
    if (v && typeof v === 'object' && 'isTexture' in v) (v as THREE.Texture).dispose()
  }
  m.dispose()
}
