// CS-1, the ChainScore instrument. A panel gauge modeled entirely in code:
// turned case, knurled bezel, domed crystal, printed dial with two
// sub-dials, a sprung needle, a three-drum odometer, and a gear-train
// movement whose four gears stand for the model's four factor groups.
//
// Local frame: dial face in the XY plane at z = 0, facing +Z, radius 1.
// Layers separate along local Z for the exploded view.

import * as THREE from 'three'
import { gearGeometry, pitchRadius } from './gear'
import {
  caseBackTexture,
  dialTexture,
  drumTexture,
  perlageTexture,
  scoreToAngle,
  SUBDIAL,
  SWEEP,
  SWEEP_START,
  WINDOW,
  type Fonts,
  type ScaleSpec,
} from './textures'

export interface Reading {
  score: number
  /** Calibrated probability of default, 0..1. */
  pd: number
  /** Data completeness, 0..1. */
  completeness: number
}

export interface GearInfo {
  mesh: THREE.Mesh
  /** Label anchor on the gear rim, for the HTML leader lines. */
  anchor: THREE.Object3D
  ratio: number
  baseSpin: number
}

export interface Instrument {
  root: THREE.Group
  gears: GearInfo[]
  /** Anchor on the crystal edge and on the dial, for annotations. */
  anchors: { dial: THREE.Object3D; crystal: THREE.Object3D; back: THREE.Object3D }
  radius: number
  setTarget: (r: Reading) => void
  /** Kick the needle as if the instrument just took a fresh measurement. */
  agitate: (amount: number) => void
  /**
   * No reading: the needle drops onto its stop pin below 300, the
   * sub-dials rest, and the counter rolls to 000. What the instrument shows
   * for a wallet that has never borrowed.
   */
  setIdle: (idle: boolean) => void
  update: (dt: number, state: { explode: number; spin: number }) => void
  displayedScore: () => number
}

interface Layer {
  object: THREE.Object3D
  offset: number
}

function lathe(points: Array<[number, number]>, segments: number): THREE.LatheGeometry {
  const g = new THREE.LatheGeometry(
    points.map(([r, z]) => new THREE.Vector2(r, z)),
    segments
  )
  g.rotateX(Math.PI / 2)
  return g
}

/** A straight-knurled band: alternate vertices pushed out, flat shaded. */
function knurlBand(radius: number, depth: number, height: number, ridges: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, height, ridges * 2, 1, true)
  const pos = g.attributes.position as THREE.BufferAttribute
  const segs = ridges * 2
  for (let i = 0; i < pos.count; i++) {
    const col = i % (segs + 1)
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const len = Math.hypot(x, z) || 1
    const r = radius + (col % 2 === 0 ? depth : 0)
    pos.setX(i, (x / len) * r)
    pos.setZ(i, (z / len) * r)
  }
  g.rotateX(Math.PI / 2)
  const flat = g.toNonIndexed()
  flat.computeVertexNormals()
  g.dispose()
  return flat
}

function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function roundedRectPath(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Path {
  const s = roundedRectShape(w, h, r, cx, cy)
  const p = new THREE.Path()
  p.curves = s.curves
  return p
}

export function buildInstrument(
  renderer: THREE.WebGLRenderer,
  fonts: Fonts,
  spec: ScaleSpec,
  quality: 'high' | 'low'
): Instrument {
  const root = new THREE.Group()
  root.name = 'cs1'
  const hi = quality === 'high'
  const seg = hi ? 180 : 96

  // ---------- Materials ----------
  // Anodized titanium-grey case. Mid-dark rather than black so it reads as
  // metal on paper instead of a hole in the page.
  const graphite = new THREE.MeshPhysicalMaterial({
    color: 0x5b5a55,
    metalness: 0.55,
    roughness: 0.48,
    clearcoat: 0.3,
    clearcoatRoughness: 0.5,
  })
  // Bead-blasted aluminium. (Anisotropy on lathe UVs streaks; matte
  // blasting is also what a real panel bezel would carry.)
  const aluminium = new THREE.MeshPhysicalMaterial({
    color: 0xdedbd4,
    metalness: 1,
    roughness: 0.34,
  })
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xdfe1e4, metalness: 1, roughness: 0.27 })
  const blued = new THREE.MeshPhysicalMaterial({ color: 0x2b3fa6, metalness: 1, roughness: 0.28 })
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: 0x121211,
    metalness: 0.1,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  })
  const signal = new THREE.MeshPhysicalMaterial({
    color: 0x1a3cff,
    metalness: 0.15,
    roughness: 0.32,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
  })
  const ruby = new THREE.MeshPhysicalMaterial({
    color: 0x9c0f1c,
    metalness: 0,
    roughness: 0.08,
    clearcoat: 1,
    sheen: 0.2,
  })
  const perlage = perlageTexture(renderer)
  perlage.repeat.set(1.4, 1.4)
  // Frosted gilt plate and polished gilt wheels, as in a watch movement.
  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xe6d6ae,
    map: perlage,
    metalness: 0.85,
    roughness: 0.5,
  })
  const brassLight = new THREE.MeshPhysicalMaterial({ color: 0xead7a4, metalness: 1, roughness: 0.32 })
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9, side: THREE.BackSide })

  const dialTex = dialTexture(renderer, fonts, spec, hi ? 2048 : 1536)
  const dialMat = new THREE.MeshPhysicalMaterial({
    map: dialTex,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
    bumpMap: dialTex,
    bumpScale: 0.35,
  })

  // Crystal: reflection-only glass. A black, glossy, transparent shell whose
  // alpha is the brightness of its own reflections and whose colour is
  // un-premultiplied to match, so it only ever adds light: correct for
  // glass over paper, and it composites over the transparent canvas, which
  // a transmission material cannot do (it samples the empty background).
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.045,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    specularIntensity: 1,
    // Glass reflects ~4% head-on; boosted so the studio's softboxes read as
    // highlights on the dome, the way a product photograph lights glass.
    envMapIntensity: 5.5,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })
  crystalMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `float csGlassA = clamp(max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)) * 1.1, 0.0, 0.92);
       gl_FragColor.rgb = gl_FragColor.rgb / max(csGlassA, 0.0001);
       gl_FragColor.a = csGlassA;
       #include <dithering_fragment>`
    )
  }

  const shadowy = (m: THREE.Mesh) => {
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  const layers: Layer[] = []
  const layer = (name: string, offset: number) => {
    const g = new THREE.Group()
    g.name = name
    root.add(g)
    layers.push({ object: g, offset })
    return g
  }

  // ---------- Case (back body) ----------
  const caseLayer = layer('case', -1.25)
  caseLayer.add(
    shadowy(
      new THREE.Mesh(
        lathe(
          [
            [0.0, -0.36],
            [0.8, -0.36],
            [0.86, -0.356],
            [0.92, -0.346],
            [1.0, -0.326],
            [1.07, -0.294],
            [1.115, -0.255],
            [1.142, -0.212],
            [1.152, -0.165],
            [1.152, -0.035],
            [1.158, -0.015],
            [1.162, 0.012],
            [1.045, 0.012],
            // Hollow cup: the inner wall runs deep so the movement and the
            // odometer drums live inside the case, behind the dial.
            [1.045, -0.3],
            [1.0, -0.312],
            [0.0, -0.312],
          ],
          seg
        ),
        new THREE.MeshPhysicalMaterial({
          color: 0x5b5a55,
          metalness: 0.55,
          roughness: 0.48,
          clearcoat: 0.3,
          clearcoatRoughness: 0.5,
          side: THREE.DoubleSide,
        })
      )
    )
  )
  // Machined grip groove around the case wall.
  {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(1.153, 0.007, 8, seg), aluminium)
    groove.position.z = -0.1
    caseLayer.add(groove)
  }
  // Engraved case back, facing -Z.
  {
    const back = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 96),
      new THREE.MeshPhysicalMaterial({
        map: caseBackTexture(renderer, fonts, spec),
        metalness: 0.75,
        roughness: 0.42,
      })
    )
    back.rotation.y = Math.PI
    back.position.z = -0.362
    caseLayer.add(back)
  }
  // Rear connector: socket, knurled coupling nut, gold pins.
  {
    const socket = shadowy(new THREE.Mesh(lathe([[0.0, -0.47], [0.13, -0.47], [0.15, -0.46], [0.16, -0.37], [0.0, -0.37]], 64), graphite))
    caseLayer.add(socket)
    const nut = shadowy(new THREE.Mesh(knurlBand(0.19, 0.008, 0.05, hi ? 72 : 48), aluminium))
    nut.position.z = -0.405
    caseLayer.add(nut)
    const nutCap = new THREE.Mesh(lathe([[0.15, -0.43], [0.195, -0.43], [0.195, -0.38], [0.15, -0.38], [0.15, -0.43]], 64), aluminium)
    caseLayer.add(nutCap)
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.12, 48), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.8 }))
    face.rotation.y = Math.PI
    face.position.z = -0.471
    caseLayer.add(face)
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xe9c46a, metalness: 1, roughness: 0.18 })
    const pinGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 12)
    pinGeo.rotateX(Math.PI / 2)
    for (let i = 0; i < 6; i++) {
      const pin = new THREE.Mesh(pinGeo, gold)
      const a = (i / 6) * Math.PI * 2
      const r = i === 5 ? 0 : 0.062
      pin.position.set(i === 5 ? 0 : Math.cos(a) * r, i === 5 ? 0 : Math.sin(a) * r, -0.48)
      caseLayer.add(pin)
    }
  }

  // ---------- Movement: plate, four gears, jewels, blued screws ----------
  const movement = layer('movement', 0.0)
  const plateGeo = new THREE.CylinderGeometry(0.985, 0.985, 0.022, seg)
  plateGeo.rotateX(Math.PI / 2)
  const plate = shadowy(new THREE.Mesh(plateGeo, brass))
  plate.position.z = -0.245
  movement.add(plate)

  const m = 0.026
  const gearDefs = [
    { teeth: 30, mat: steel, pos: new THREE.Vector2(-0.3, 0.1) },
    { teeth: 22, mat: brassLight, pos: new THREE.Vector2(0, 0) },
    { teeth: 12, mat: steel, pos: new THREE.Vector2(0, 0) },
    { teeth: 16, mat: brassLight, pos: new THREE.Vector2(0, 0) },
  ]
  const rp = gearDefs.map((g) => pitchRadius(g.teeth, m))
  // Lay the train out so pitch circles touch: 0 drives 1 drives 2; 0 drives 3.
  const place = (from: number, to: number, angleDeg: number) => {
    const a = THREE.MathUtils.degToRad(angleDeg)
    const d = rp[from] + rp[to]
    gearDefs[to].pos.set(gearDefs[from].pos.x + Math.cos(a) * d, gearDefs[from].pos.y + Math.sin(a) * d)
  }
  place(0, 1, 20)
  place(1, 2, -70)
  place(0, 3, -120)

  const gears: GearInfo[] = gearDefs.map((def, i) => {
    const geo = gearGeometry({ teeth: def.teeth, module: m, thickness: 0.03 })
    const mesh = shadowy(new THREE.Mesh(geo, def.mat))
    mesh.position.set(def.pos.x, def.pos.y, -0.205)
    movement.add(mesh)
    // Ruby jewel bearing and a cap screw on each arbor.
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 12), ruby)
    jewel.position.set(0, 0, 0.022)
    mesh.add(jewel)
    // Label anchor rides with the gear but does not spin with it.
    const anchor = new THREE.Object3D()
    const ro = rp[i] + m
    anchor.userData.local = new THREE.Vector2(Math.cos(0.8) * ro, Math.sin(0.8) * ro)
    movement.add(anchor)
    // Gear ratio relative to gear 0 (sign alternates across each mesh).
    const ratio = i === 0 ? 1 : i === 1 ? -gearDefs[0].teeth / def.teeth : i === 2 ? gearDefs[0].teeth / def.teeth : -gearDefs[0].teeth / def.teeth
    return { mesh, anchor, ratio, baseSpin: i * 0.37 }
  })

  // Pillars and blued screws on the plate.
  {
    const pillarGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.23, 16)
    pillarGeo.rotateX(Math.PI / 2)
    const screwGeo = new THREE.CylinderGeometry(0.026, 0.028, 0.012, 20)
    screwGeo.rotateX(Math.PI / 2)
    const slotGeo = new THREE.BoxGeometry(0.04, 0.007, 0.006)
    ;[100, 215, 330].forEach((deg) => {
      const a = THREE.MathUtils.degToRad(deg)
      const p = new THREE.Mesh(pillarGeo, steel)
      p.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, -0.12)
      movement.add(p)
      const s = new THREE.Mesh(screwGeo, blued)
      s.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, -0.227)
      const slot = new THREE.Mesh(slotGeo, lacquer)
      slot.position.z = 0.005
      slot.rotation.z = a
      s.add(slot)
      movement.add(s)
    })
  }

  // ---------- Odometer drums (behind the dial window) ----------
  const drumLayer = layer('drums', 0.5)
  const drumTex = drumTexture(renderer, fonts)
  const drumMat = new THREE.MeshPhysicalMaterial({ map: drumTex, roughness: 0.45, metalness: 0.05, clearcoat: 0.3 })
  const drumEdge = new THREE.MeshPhysicalMaterial({ color: 0x1a1a19, roughness: 0.4, metalness: 0.6 })
  const drums: THREE.Mesh[] = []
  {
    const drumGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.09, 64, 1, true)
    drumGeo.rotateZ(Math.PI / 2)
    const capGeo = new THREE.CylinderGeometry(0.103, 0.103, 0.006, 64)
    capGeo.rotateZ(Math.PI / 2)
    const spacing = 0.104
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(drumGeo, drumMat)
      d.position.set(WINDOW.x + (i - 1) * spacing, WINDOW.y, -0.112)
      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(capGeo, drumEdge)
        cap.position.x = side * 0.048
        d.add(cap)
      }
      drumLayer.add(d)
      drums.push(d)
    }
  }

  // ---------- Dial ----------
  const dialLayer = layer('dial', 0.95)
  {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, 1.0, 0, Math.PI * 2, false)
    shape.holes.push(roundedRectPath(WINDOW.w, WINDOW.h, 0.018, WINDOW.x, WINDOW.y))
    const geo = new THREE.ShapeGeometry(shape, hi ? 128 : 72)
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + 1) / 2, (pos.getY(i) + 1) / 2)
    const dial = new THREE.Mesh(geo, dialMat)
    dial.receiveShadow = true
    dialLayer.add(dial)

    // Black cavity behind the window so it reads as depth, not a hole. It
    // travels with the dial, so in the exploded view it stays hidden.
    const cavity = new THREE.Mesh(new THREE.BoxGeometry(WINDOW.w + 0.02, WINDOW.h + 0.02, 0.2), black)
    cavity.position.set(WINDOW.x, WINDOW.y, -0.1)
    dialLayer.add(cavity)

    // Rehaut: the slanted inner ring between dial and bezel. It closes the
    // gap at the dial's edge (which otherwise shows the movement plate at
    // an angle) and gives the dial a sense of depth.
    const rehaut = new THREE.Mesh(
      lathe(
        [
          [1.044, 0.07],
          [0.997, 0.0005],
        ],
        seg
      ),
      new THREE.MeshPhysicalMaterial({ color: 0x1d1d1b, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide })
    )
    rehaut.receiveShadow = true
    dialLayer.add(rehaut)

    // Polished window frame.
    const frameShape = roundedRectShape(WINDOW.w + 0.036, WINDOW.h + 0.036, 0.03, WINDOW.x, WINDOW.y)
    frameShape.holes.push(roundedRectPath(WINDOW.w, WINDOW.h, 0.018, WINDOW.x, WINDOW.y))
    const frame = shadowy(
      new THREE.Mesh(
        new THREE.ExtrudeGeometry(frameShape, {
          depth: 0.008,
          bevelEnabled: true,
          bevelThickness: 0.003,
          bevelSize: 0.003,
          bevelSegments: 2,
          curveSegments: 6,
        }),
        steel
      )
    )
    dialLayer.add(frame)
  }

  // Sub-dial needles.
  const subNeedle = (len: number) => {
    const s = new THREE.Shape()
    s.moveTo(-0.006, -0.03)
    s.lineTo(-0.0035, len * 0.8)
    s.lineTo(0, len)
    s.lineTo(0.0035, len * 0.8)
    s.lineTo(0.006, -0.03)
    s.closePath()
    const g = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false }),
      lacquer
    )
    blade.castShadow = true
    g.add(blade)
    const hubGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.01, 20)
    hubGeo.rotateX(Math.PI / 2)
    const hub = new THREE.Mesh(hubGeo, steel)
    hub.position.z = 0.004
    g.add(hub)
    return g
  }
  const pdNeedle = subNeedle(SUBDIAL.pd.r * 0.86)
  pdNeedle.position.set(SUBDIAL.pd.x, SUBDIAL.pd.y, 0.004)
  dialLayer.add(pdNeedle)
  const dataNeedle = subNeedle(SUBDIAL.data.r * 0.86)
  dataNeedle.position.set(SUBDIAL.data.x, SUBDIAL.data.y, 0.004)
  dialLayer.add(dataNeedle)

  // ---------- Main needle ----------
  const needleLayer = layer('needle', 1.38)
  const needle = new THREE.Group()
  needle.position.z = 0.03
  needleLayer.add(needle)
  {
    const s = new THREE.Shape()
    s.moveTo(-0.017, 0.0)
    s.lineTo(-0.0085, 0.6)
    s.lineTo(-0.0032, 0.855)
    s.lineTo(0, 0.886)
    s.lineTo(0.0032, 0.855)
    s.lineTo(0.0085, 0.6)
    s.lineTo(0.017, 0.0)
    s.lineTo(0.011, -0.15)
    s.lineTo(-0.011, -0.15)
    s.closePath()
    const blade = shadowy(
      new THREE.Mesh(
        new THREE.ExtrudeGeometry(s, {
          depth: 0.006,
          bevelEnabled: true,
          bevelThickness: 0.0015,
          bevelSize: 0.0015,
          bevelSegments: 1,
        }),
        signal
      )
    )
    needle.add(blade)
    const cwGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.01, 32)
    cwGeo.rotateX(Math.PI / 2)
    const cw = shadowy(new THREE.Mesh(cwGeo, signal))
    cw.position.set(0, -0.185, 0.004)
    needle.add(cw)
    const washerGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.012, 48)
    washerGeo.rotateX(Math.PI / 2)
    const washer = shadowy(new THREE.Mesh(washerGeo, lacquer))
    washer.position.z = -0.006
    needle.add(washer)
    const cap = shadowy(
      new THREE.Mesh(new THREE.SphereGeometry(0.036, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel)
    )
    cap.rotation.x = Math.PI / 2
    cap.position.z = 0.008
    needle.add(cap)
  }

  // ---------- Bezel ----------
  const bezelLayer = layer('bezel', 1.78)
  bezelLayer.add(
    shadowy(
      new THREE.Mesh(
        // Counter-clockwise in (r, z): LatheGeometry's normal for a step
        // (dr, dz) is (dz, -dr), so this order makes every face point out.
        lathe(
          [
            [1.036, 0.084],
            [1.036, 0.012],
            [1.17, 0.012],
            [1.186, 0.02],
            [1.196, 0.035],
            [1.196, 0.093],
            [1.19, 0.11],
            [1.176, 0.127],
            [1.15, 0.134],
            [1.1, 0.134],
            [1.07, 0.127],
            [1.046, 0.111],
            [1.036, 0.084],
          ],
          seg
        ),
        aluminium
      )
    )
  )
  {
    const band = shadowy(new THREE.Mesh(knurlBand(1.196, 0.011, 0.052, hi ? 180 : 120), aluminium))
    band.position.z = 0.064
    bezelLayer.add(band)
    const headGeo = new THREE.CylinderGeometry(0.023, 0.025, 0.012, 24)
    headGeo.rotateX(Math.PI / 2)
    const slotGeo = new THREE.BoxGeometry(0.036, 0.006, 0.006)
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2
      const head = shadowy(new THREE.Mesh(headGeo, steel))
      head.position.set(Math.cos(a) * 1.124, Math.sin(a) * 1.124, 0.139)
      const slot = new THREE.Mesh(slotGeo, lacquer)
      slot.position.z = 0.005
      slot.rotation.z = a
      head.add(slot)
      bezelLayer.add(head)
    }
  }

  // ---------- Crystal ----------
  const crystalLayer = layer('crystal', 2.25)
  {
    const pts: Array<[number, number]> = []
    // Rim to centre, so the dome's normals face out (+z).
    for (let i = 28; i >= 0; i--) {
      const t = i / 28
      pts.push([1.05 * t, 0.124 + 0.05 * (1 - t * t)])
    }
    const crystal = new THREE.Mesh(lathe(pts, hi ? 128 : 64), crystalMat)
    crystal.renderOrder = 2
    crystalLayer.add(crystal)
  }

  // Annotation anchors.
  const anchors = {
    dial: new THREE.Object3D(),
    crystal: new THREE.Object3D(),
    back: new THREE.Object3D(),
  }
  // Where the needle rests on its stop pin (the "no reading" position).
  anchors.dial.position.set(-0.6, -0.64, 0.04)
  dialLayer.add(anchors.dial)
  anchors.crystal.position.set(0.74, 0.74, 0.16)
  crystalLayer.add(anchors.crystal)
  anchors.back.position.set(0, 0, -0.5)
  caseLayer.add(anchors.back)

  // ---------- Dynamics ----------
  const target: Reading = { score: spec.min, pd: 0.2, completeness: 0 }
  const needleState = { a: SWEEP_START, v: 0 }
  const pdState = { a: SWEEP_START, v: 0 }
  const dataState = { a: SWEEP_START, v: 0 }
  const counter = { a: spec.min, v: 0 }
  let kick = 0
  let idle = false
  // The stop pin sits a few degrees below 300; the needle rests on it.
  const REST = SWEEP_START + 0.075
  const END = SWEEP_START - SWEEP - 0.035

  const subAngle = (t: number) => SWEEP_START - Math.min(1, Math.max(0, t)) * SWEEP
  const pdT = (pd: number) => {
    const pct = Math.min(20, Math.max(0.1, pd * 100))
    return (Math.log10(pct) + 1) / (Math.log10(20) + 1)
  }

  function spring(s: { a: number; v: number }, goal: number, k: number, c: number, dt: number) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const acc = k * (goal - s.a) - c * s.v
      s.v += acc * h
      s.a += s.v * h
    }
  }

  function angleToScore(a: number): number {
    const t = (SWEEP_START - a) / SWEEP
    return spec.min + Math.min(1, Math.max(0, t)) * (spec.max - spec.min)
  }

  let time = 0

  function update(dt: number, state: { explode: number; spin: number }) {
    time += dt
    // Measurement jitter decays; a fresh reading arrives with a kick.
    kick *= Math.exp(-dt * 2.2)
    const jitter = idle ? 0 : kick * (Math.sin(time * 23) * 0.6 + Math.sin(time * 37.7) * 0.4) * 0.09
    const goal = idle ? REST : scoreToAngle(target.score, spec.min, spec.max) + jitter
    spring(needleState, goal, idle ? 30 : 48, idle ? 7.5 : 8.2, dt)
    // Hard stops at both ends of the scale, with a little bounce.
    if (needleState.a > REST) {
      needleState.a = REST
      needleState.v = -needleState.v * 0.35
    } else if (needleState.a < END) {
      needleState.a = END
      needleState.v = -needleState.v * 0.35
    }
    spring(pdState, idle ? REST : subAngle(pdT(target.pd)), 70, 11, dt)
    spring(dataState, idle ? REST : subAngle(target.completeness), 70, 11, dt)

    needle.rotation.z = needleState.a - Math.PI / 2
    pdNeedle.rotation.z = pdState.a - Math.PI / 2
    dataNeedle.rotation.z = dataState.a - Math.PI / 2

    // Odometer follows the needle (or rolls back to 000 with no reading):
    // ones roll continuously, tens and hundreds turn over during the last
    // unit, like a mechanical counter.
    spring(counter, idle ? 0 : angleToScore(needleState.a), idle ? 9 : 400, idle ? 6 : 40, dt)
    const s = Math.max(0, counter.a)
    const ones = s % 10
    const carry = Math.max(0, ones - 9)
    const tens = (Math.floor(s / 10) % 10) + carry
    const hundreds = Math.floor(s / 100) % 10 + (Math.floor(s / 10) % 10 === 9 ? carry : 0)
    const drumAngle = (v: number) => ((9.5 - v) / 10) * Math.PI * 2
    drums[0].rotation.x = drumAngle(hundreds)
    drums[1].rotation.x = drumAngle(tens)
    drums[2].rotation.x = drumAngle(ones)

    // Gear train turns with the needle and with the scroll-driven spin.
    const drive = (needleState.a - SWEEP_START) * 2.2 + state.spin + time * 0.05
    gears.forEach((g, i) => {
      g.mesh.rotation.z = g.baseSpin + drive * g.ratio
      g.mesh.position.z = -0.205 + state.explode * (0.2 + i * 0.12)
      const spread = 1 + state.explode * 0.16
      g.mesh.position.x = gearDefs[i].pos.x * spread
      g.mesh.position.y = gearDefs[i].pos.y * spread
      const local = g.anchor.userData.local as THREE.Vector2
      g.anchor.position.set(g.mesh.position.x + local.x, g.mesh.position.y + local.y, g.mesh.position.z + 0.02)
    })

    const e = state.explode
    layers.forEach((l) => {
      l.object.position.z = l.offset * e
    })
  }

  return {
    root,
    gears,
    anchors,
    radius: 1.22,
    setTarget: (r) => {
      target.score = r.score
      target.pd = r.pd
      target.completeness = r.completeness
    },
    agitate: (amount) => {
      if (!idle) kick = Math.min(1.5, kick + amount)
    },
    setIdle: (v) => {
      idle = v
    },
    update,
    displayedScore: () => angleToScore(needleState.a),
  }
}
