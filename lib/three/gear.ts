// Procedural spur gear: teeth on a true pitch circle (module m, N teeth),
// a spoked web, and a bored hub, extruded with a small bevel. Gears that
// share a module mesh when their centres sit rp1 + rp2 apart.

import * as THREE from 'three'

export interface GearSpec {
  teeth: number
  module: number
  thickness: number
  spokes?: number
  bore?: number
}

export function pitchRadius(teeth: number, module: number): number {
  return (teeth * module) / 2
}

export function gearGeometry(spec: GearSpec): THREE.ExtrudeGeometry {
  const { teeth: N, module: m, thickness } = spec
  const rp = pitchRadius(N, m)
  const ro = rp + m
  const rr = rp - 1.25 * m
  const P = (Math.PI * 2) / N
  const shape = new THREE.Shape()

  const pt = (r: number, a: number) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)
  for (let i = 0; i < N; i++) {
    const a0 = i * P
    const steps: Array<[number, number]> = [
      [rr, a0],
      [rr, a0 + 0.12 * P],
      [rp * 0.995, a0 + 0.22 * P],
      [ro, a0 + 0.31 * P],
      [ro, a0 + 0.4 * P],
      [ro, a0 + 0.49 * P],
      [rp * 0.995, a0 + 0.58 * P],
      [rr, a0 + 0.68 * P],
      [rr, a0 + 0.84 * P],
    ]
    steps.forEach(([r, a], k) => {
      const v = pt(r, a)
      if (i === 0 && k === 0) shape.moveTo(v.x, v.y)
      else shape.lineTo(v.x, v.y)
    })
  }
  shape.closePath()

  const bore = spec.bore ?? Math.max(m * 1.2, rr * 0.09)
  const hole = new THREE.Path()
  hole.absarc(0, 0, bore, 0, Math.PI * 2, true)
  shape.holes.push(hole)

  // Spoked web: annular windows between hub and rim.
  const spokes = spec.spokes ?? (rr > 0.18 ? 5 : rr > 0.1 ? 4 : 0)
  if (spokes > 0) {
    const rimInner = rr - Math.max(m * 1.6, rr * 0.16)
    const hubOuter = Math.max(bore * 2.4, rr * 0.3)
    if (rimInner - hubOuter > m) {
      const seg = (Math.PI * 2) / spokes
      const spokeHalf = Math.max(0.12, (m * 1.1) / hubOuter) * 0.5
      for (let k = 0; k < spokes; k++) {
        const a = k * seg + spokeHalf * 1.6
        const b = (k + 1) * seg - spokeHalf * 1.6
        const w = new THREE.Path()
        w.absarc(0, 0, rimInner, a, b, false)
        w.absarc(0, 0, hubOuter, b - spokeHalf * 0.4, a + spokeHalf * 0.4, true)
        w.closePath()
        shape.holes.push(w)
      }
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.12,
    bevelSize: m * 0.12,
    bevelSegments: 2,
    curveSegments: 10,
    steps: 1,
  })
  geo.translate(0, 0, -thickness / 2)
  geo.computeVertexNormals()
  return geo
}
