"""2D profiles for the ChainScore calibre (pure shapely, no bpy).

Units are millimetres. Layout follows the architecture of a Lepine
pocket calibre of the Unitas 6497 family seen from the caseback:
crown at 9 o'clock, small seconds (fourth wheel) at 3 o'clock, barrel
upper left, balance lower right, straight-line Swiss lever escapement.

Train (18,000 vph):
  barrel 84 -> centre pinion 12   (m 0.1603)
  centre 80 -> third pinion 10    (m 0.13)
  third 75  -> fourth pinion 10   (m 0.11)
  fourth 70 -> escape pinion 7    (m 0.10)
  escape wheel 15 club teeth, pallets embrace 2.5 teeth (arbor at R/cos30)
Centre distances below are the sums of pitch radii, so every pair meshes.
"""
import math
from shapely.geometry import Point, Polygon, LineString, MultiPolygon
from shapely.ops import unary_union
from shapely import affinity

TAU = math.tau


def pol(r, a, c=(0.0, 0.0)):
    return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))


def circle(c, r, res=96):
    return Point(c).buffer(r, quad_segs=max(16, res // 4))


def ring(c, r_out, r_in, res=96):
    return circle(c, r_out, res).difference(circle(c, r_in, res))


# ----------------------------------------------------------------- layout --

PLATE_R = 18.3
C = (0.0, 0.0)
T3 = (5.728, -1.188)
T4 = (10.25, 0.0)
E = (11.57, -3.62)
P = (9.69, -5.65)
B = (6.39, -9.20)
R = (-3.6, 6.8)
K = (-10.8, 1.2)
STEM_Y = 1.2

M_BARREL, Z_BARREL, Z_CPIN = 0.1603, 84, 12
M_CENTRE, Z_CENTRE, Z_3PIN = 0.13, 80, 10
M_THIRD, Z_THIRD, Z_4PIN = 0.11, 75, 10
M_FOURTH, Z_FOURTH, Z_EPIN = 0.10, 70, 7
ESC_R = 2.4
M_RATCHET, Z_RATCHET, Z_CROWN = 0.19, 56, 40

BAL_RIM_OUT = 5.55
BAL_RIM_IN = 5.07
BAL_SCREWS = 18
HS_IN, HS_OUT, HS_TURNS = 0.62, 3.25, 11.5


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def ang(a, b):
    return math.atan2(b[1] - a[1], b[0] - a[0])


# ------------------------------------------------------------------ teeth --

def wheel_outline(z, m, add=1.35, ded=1.75, tf=0.47, n_og=7, n_root=6, phase=0.0):
    """Ogival (watch) wheel teeth: radial flanks, pointed-arch addendum."""
    rp = m * z / 2
    ra = rp + add * m
    rr = rp - ded * m
    pa = TAU / z
    hw = tf * math.pi * m / 2
    h = ra - rp
    rho = (hw * hw + h * h) / (2 * hw)
    phi0, phi1 = math.pi, math.atan2(h, hw - rho)
    pts = []
    for i in range(z):
        a0 = phase + i * pa
        er = (math.cos(a0), math.sin(a0))
        et = (-math.sin(a0), math.cos(a0))

        def Pt(u, r):
            return (r * er[0] + u * et[0], r * er[1] + u * et[1])

        pts.append(Pt(-hw * rr / rp, rr))
        pts.append(Pt(-hw * (rr + rp) / 2 / rp, (rr + rp) / 2))
        for k in range(n_og + 1):
            ph = phi0 + (phi1 - phi0) * k / n_og
            pts.append(Pt((-hw + rho) + rho * math.cos(ph), rp + rho * math.sin(ph)))
        for k in range(1, n_og + 1):
            ph = phi1 + (phi0 - phi1) * k / n_og
            pts.append(Pt(-((-hw + rho) + rho * math.cos(ph)), rp + rho * math.sin(ph)))
        pts.append(Pt(hw * (rr + rp) / 2 / rp, (rr + rp) / 2))
        pts.append(Pt(hw * rr / rp, rr))
        a_s = a0 + math.atan2(hw * rr / rp, rr)
        a_e = a0 + pa - math.atan2(hw * rr / rp, rr)
        for k in range(1, n_root):
            t = k / n_root
            pts.append(pol(rr - 0.3 * m * math.sin(math.pi * t), a_s + (a_e - a_s) * t))
    return Polygon(pts).buffer(0)


def pinion_outline(z, m, add=1.05, ded=1.55, tf=0.40, n_tip=8, n_root=5, phase=0.0):
    """Pinion leaves with parallel flanks and semicircular tips."""
    rp = m * z / 2
    ra = rp + add * m
    rr = rp - ded * m
    pa = TAU / z
    hw = tf * math.pi * m / 2
    rc = ra - hw
    pts = []
    for i in range(z):
        a0 = phase + i * pa
        er = (math.cos(a0), math.sin(a0))
        et = (-math.sin(a0), math.cos(a0))

        def Pt(u, r):
            return (r * er[0] + u * et[0], r * er[1] + u * et[1])

        rb = math.sqrt(max(rr * rr - hw * hw, 1e-6))
        pts.append(Pt(-hw, rb))
        for k in range(n_tip + 1):
            ph = math.pi - math.pi * k / n_tip
            pts.append(Pt(hw * math.cos(ph), rc + hw * math.sin(ph)))
        pts.append(Pt(hw, rb))
        a_s = a0 + math.atan2(hw, rb)
        a_e = a0 + pa - math.atan2(hw, rb)
        for k in range(1, n_root):
            t = k / n_root
            pts.append(pol(rr - 0.12 * m * math.sin(math.pi * t), a_s + (a_e - a_s) * t))
    return Polygon(pts).buffer(0)


def escape_outline(R=ESC_R, z=15, phase=0.0):
    """Swiss club-tooth escape wheel. Teeth lean forward (CCW)."""
    pa = TAU / z
    prof = [(-12.5, 0.600), (-9.2, 0.690), (-5.2, 0.800), (-1.8, 0.905), (0.4, 0.955),
            (5.0, 1.000), (4.55, 0.940), (3.2, 0.800), (2.0, 0.640), (1.7, 0.600)]
    pts = []
    for i in range(z):
        a0 = phase + i * pa
        for d, rr in prof:
            pts.append(pol(rr * R, a0 + math.radians(d)))
        for k in range(1, 4):
            a = a0 + math.radians(1.7 + (24 - 12.5 - 1.7) * k / 4)
            pts.append(pol(0.585 * R, a))
    return Polygon(pts).buffer(0)


# ---------------------------------------------------------------- strokes --

def stroke(pts, w0, w1=None, cap=True):
    """Tapered stroke along a polyline: width w0 at start, w1 at end."""
    if w1 is None:
        w1 = w0
    n = len(pts)
    seglen = [dist(pts[i], pts[i + 1]) for i in range(n - 1)]
    total = sum(seglen) or 1.0
    acc = [0.0]
    for s in seglen:
        acc.append(acc[-1] + s)
    left, right = [], []
    for i, p in enumerate(pts):
        if i == 0:
            d = (pts[1][0] - p[0], pts[1][1] - p[1])
        elif i == n - 1:
            d = (p[0] - pts[i - 1][0], p[1] - pts[i - 1][1])
        else:
            d = (pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1])
        L = math.hypot(*d) or 1.0
        nx, ny = -d[1] / L, d[0] / L
        w = (w0 + (w1 - w0) * acc[i] / total) / 2
        left.append((p[0] + nx * w, p[1] + ny * w))
        right.append((p[0] - nx * w, p[1] - ny * w))
    poly = Polygon(left + right[::-1]).buffer(0)
    if cap:
        poly = unary_union([poly, circle(pts[0], w0 / 2), circle(pts[-1], w1 / 2)])
    return poly


def arc_pts(c, r, a0, a1, n=24):
    return [pol(r, a0 + (a1 - a0) * k / n, c) for k in range(n + 1)]


def bezier(p0, p1, p2, p3, n=32):
    out = []
    for k in range(n + 1):
        t = k / n
        u = 1 - t
        out.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return out


def smooth(poly, fill=0.9, round_=0.35):
    """Fillet concave corners (fill) then round convex corners (round_)."""
    p = poly.buffer(fill, quad_segs=24).buffer(-fill, quad_segs=24)
    if round_:
        p = p.buffer(-round_, quad_segs=24).buffer(round_, quad_segs=24)
    return p


def blob(nodes, edges, fill=0.9, round_=0.35):
    parts = [circle(c, r) for c, r in nodes]
    for e in edges:
        parts.append(stroke(*e))
    return smooth(unary_union(parts), fill, round_)


def crossings(outline, r_rim_in, r_hub, n, w_hub, w_rim, curve=0.0, fillet=0.18, phase=0.0, c=(0, 0)):
    """Cut the windows between spokes (crossings) of a wheel."""
    ann = ring(c, r_rim_in, r_hub)
    spokes = []
    for k in range(n):
        a = phase + k * TAU / n
        pts = []
        for j in range(13):
            t = j / 12
            r = r_hub * 0.6 + (r_rim_in * 1.04 - r_hub * 0.6) * t
            pts.append(pol(r, a + curve * math.sin(math.pi * t * 0.5) * t, c))
        spokes.append(stroke(pts, w_hub, w_rim, cap=False))
    win = ann.difference(unary_union(spokes))
    win = win.buffer(-fillet, quad_segs=16).buffer(fillet, quad_segs=16)
    return outline.difference(win)


def at(poly, c, rot=0.0):
    p = affinity.rotate(poly, rot, origin=(0, 0), use_radians=True)
    return affinity.translate(p, c[0], c[1])


# ------------------------------------------------------------- components --

def centre_wheel():
    o = wheel_outline(Z_CENTRE, M_CENTRE)
    rr = M_CENTRE * Z_CENTRE / 2 - 1.75 * M_CENTRE
    o = crossings(o, rr - 0.42, 0.95, 4, 0.62, 0.42, curve=0.0, phase=0.3)
    return o.difference(circle((0, 0), 0.32))


def third_wheel():
    o = wheel_outline(Z_THIRD, M_THIRD)
    rr = M_THIRD * Z_THIRD / 2 - 1.75 * M_THIRD
    o = crossings(o, rr - 0.36, 0.72, 4, 0.52, 0.36, phase=0.15)
    return o.difference(circle((0, 0), 0.22))


def fourth_wheel():
    o = wheel_outline(Z_FOURTH, M_FOURTH)
    rr = M_FOURTH * Z_FOURTH / 2 - 1.75 * M_FOURTH
    o = crossings(o, rr - 0.32, 0.62, 4, 0.46, 0.32, phase=0.6)
    return o.difference(circle((0, 0), 0.2))


def escape_wheel():
    o = escape_outline()
    o = crossings(o, 0.585 * ESC_R - 0.22, 0.42, 5, 0.2, 0.13, fillet=0.06, phase=0.2)
    return o.difference(circle((0, 0), 0.12))


def barrel_teeth():
    return wheel_outline(Z_BARREL, M_BARREL)


def ratchet_wheel():
    o = wheel_outline(Z_RATCHET, M_RATCHET, add=1.15, ded=1.55, tf=0.5)
    sq = Polygon([(-0.75, -0.75), (0.75, -0.75), (0.75, 0.75), (-0.75, 0.75)])
    return o.difference(sq)


def crown_wheel():
    o = wheel_outline(Z_CROWN, M_RATCHET, add=1.15, ded=1.55, tf=0.5, phase=math.pi / Z_CROWN)
    return o.difference(circle((0, 0), 0.5))


def pallet_fork_local():
    """Pallet fork in local coords: arbor at origin, +x toward the balance,
    escape wheel centre at (-d, 0). Pallets embrace 2.5 teeth, so the two
    stones sit at +-30 deg about the line of centres. Returns
    (body, stones, guard pin pos, stone directions)."""
    d = dist(P, E)
    ex = (-d, 0.0)
    L = dist(P, B) - 1.0          # fork notch sits on the impulse-jewel radius
    hub = circle((0, 0), 0.40)
    lever = stroke([(0, 0), (L * 0.5, 0), (L - 0.3, 0)], 0.60, 0.40, cap=False)
    horns = unary_union([
        stroke(bezier((L - 0.5, 0.05), (L - 0.1, 0.30), (L + 0.25, 0.40), (L + 0.55, 0.50), 12), 0.26, 0.15),
        stroke(bezier((L - 0.5, -0.05), (L - 0.1, -0.30), (L + 0.25, -0.40), (L + 0.55, -0.50), 12), 0.26, 0.15),
    ])
    notch = Polygon([(L - 0.24, -0.13), (L + 0.9, -0.13), (L + 0.9, 0.13), (L - 0.24, 0.13)])
    stones, arms, dirs = [], [], []
    for sgn in (1, -1):
        th = math.radians(30 * sgn)
        u = (math.cos(th), math.sin(th))
        a_end = (ex[0] + (ESC_R + 0.62) * u[0], ex[1] + (ESC_R + 0.62) * u[1])
        arms.append(stroke(bezier((0, 0), (-0.15, 0.55 * sgn), (a_end[0] + 0.35, a_end[1] + 0.05 * sgn),
                                  a_end, 14), 0.52, 0.50))
        r0, r1, w = ESC_R - 0.13, ESC_R + 0.66, 0.22
        n = (-u[1], u[0])
        pts = [(ex[0] + r * u[0] + s * n[0], ex[1] + r * u[1] + s * n[1]) for r, s in
               ((r0, -w / 2), (r1, -w / 2), (r1, w / 2), (r0, w / 2))]
        stones.append(Polygon(pts))
        dirs.append(th)
    body = smooth(unary_union([hub, lever, horns] + arms), 0.16, 0.04).difference(notch)
    # keep the anchor body clear of the tooth circle; stones do the work
    body = body.difference(circle(ex, ESC_R + 0.08))
    body = body.difference(unary_union([s.buffer(0.004) for s in stones]))
    if body.geom_type == 'MultiPolygon':
        body = max(body.geoms, key=lambda q: q.area)
    return body, stones, (L - 0.5, 0.0), dirs


def balance_wheel():
    rim = ring((0, 0), BAL_RIM_OUT, BAL_RIM_IN, res=256)
    arms = [stroke([pol(0.55, a), pol(BAL_RIM_IN + 0.1, a)], 0.42, 0.34, cap=False)
            for a in (math.pi / 4 + k * math.pi / 2 for k in range(4))]
    hub = circle((0, 0), 0.78)
    body = smooth(unary_union([rim, hub] + arms), 0.22, 0.0)
    return body.difference(circle((0, 0), 0.16))


def hairspring_path(turns=HS_TURNS, r0=HS_IN, r1=HS_OUT, a_end=None, n_per_turn=180):
    """Archimedean spiral, inner end at the collet, outer end at a_end."""
    if a_end is None:
        a_end = 0.0
    total = turns * TAU
    pts = []
    N = int(turns * n_per_turn)
    for k in range(N + 1):
        t = k / N
        th = a_end - total * (1 - t)
        r = r0 + (r1 - r0) * t
        pts.append((r * math.cos(th), r * math.sin(th)))
    return pts


# ---------------------------------------------------------------- bridges --

FEET = {
    'train': [(12.4, 8.6), (15.6, -3.2), (5.6, 12.2)],
    'barrel': [(-12.6, 9.8), (1.2, 15.2), (-9.8, -4.6)],
    'pallet': [(14.0, -8.0)],
    'cock': [(-3.4, -14.6)],
}
JEWELS = {
    'train': [(C, 1.05), (T3, 0.9), (T4, 0.85), (E, 0.78)],
    'pallet': [(P, 0.72)],
}

# Bridge boundaries. A: barrel/train partition (cut as a 0.42 gap).
# B: barrel bridge edge toward the open escapement side. L: the train
# bridge's lower edge, which leaves the lower halves of the gold train
# wheels, the escapement and the balance open to view.
CURVE_A = (bezier((5.3, 19.5), (4.4, 12.5), (2.6, 7.6), (0.4, 4.6), 24)[:-1]
           + bezier((0.4, 4.6), (-1.6, 1.9), (-2.6, 0.2), (-3.0, -2.6), 16))
CURVE_B = (bezier((-3.0, -2.6), (-3.4, -5.6), (-5.6, -8.6), (-7.4, -11.2), 16)[1:-1]
           + bezier((-7.4, -11.2), (-8.6, -13.0), (-9.2, -15.4), (-9.6, -19.5), 16))
CURVE_L = (bezier((-3.0, -2.6), (0.6, -2.4), (3.6, -3.0), (5.6, -2.7), 16)[1:-1]
           + bezier((5.6, -2.7), (7.4, -2.4), (8.6, -1.9), (10.3, -1.9), 16)[:-1]
           + bezier((10.3, -1.9), (11.4, -1.9), (12.6, -1.0), (13.6, -1.6), 12)[:-1]
           + bezier((13.6, -1.6), (14.6, -2.2), (16.2, -4.4), (19.5, -6.4), 12))


def train_bridge():
    disc = circle((0, 0), PLATE_R - 0.4, res=256)
    region = Polygon(CURVE_A[::-1] + [(-3.0, -2.6)] + CURVE_L + [(22, -6.4), (22, 22), (5.3, 22)]).buffer(0)
    lobes = unary_union([circle(C, 2.0), circle(T3, 1.7), circle(T4, 1.6), circle(E, 1.45),
                         stroke(bezier(T4, (11.0, -1.4), (11.3, -2.5), E, 10), 2.4, 2.3),
                         stroke(bezier(E, (13.0, -3.6), (14.5, -3.4), FEET['train'][1], 10), 2.3, 2.6)])
    left = Polygon(CURVE_A + CURVE_B + [(-22, -19.5), (-22, 22), (5.3, 22)]).buffer(0)
    p = unary_union([region, lobes.difference(left)])
    p = p.difference(circle(B, 6.4)).difference(left.buffer(0.42))
    p = smooth(p, 1.2, 0.3)
    return p.intersection(disc)


def barrel_bridge(train=None):
    disc = circle((0, 0), PLATE_R - 0.4, res=256)
    left = Polygon(CURVE_A + CURVE_B + [(-22, -19.5), (-22, 22), (5.3, 22)]).buffer(0)
    p = disc.intersection(left)
    if train is not None:
        p = p.difference(train.buffer(0.42, quad_segs=24))
    return smooth(p, 0.5, 0.3)


def pallet_bridge():
    Fp = FEET['pallet'][0]
    return blob([(P, 1.12), (Fp, 1.45)], [(bezier(P, (11.0, -6.1), (12.4, -7.4), Fp, 12), 1.6, 2.1)],
                fill=0.8, round_=0.25)


def balance_cock():
    Fk = FEET['cock'][0]
    return blob([(B, 2.5), (Fk, 1.95)],
                [(bezier(Fk, (-0.6, -13.6), (2.6, -11.4), B, 24), 3.5, 2.3)], fill=1.6, round_=0.3)


def plate():
    return circle((0, 0), PLATE_R, res=256)


def click_and_spring():
    """Click (pawl) engaging the ratchet teeth, with its wire spring."""
    a_tip = math.radians(122)
    ra = M_RATCHET * Z_RATCHET / 2 + 1.15 * M_RATCHET
    tip = pol(ra - 0.12, a_tip, R)
    piv = pol(ra + 2.3, a_tip + math.radians(17), R)
    mid = pol(ra + 0.9, a_tip + math.radians(9), R)
    body = stroke(bezier(piv, mid, pol(ra + 0.35, a_tip + math.radians(3), R), tip, 12), 1.3, 0.45)
    body = smooth(unary_union([body, circle(piv, 0.85)]), 0.3, 0.05)
    o = ang(R, piv)
    sp = [pol(ra + 3.4, o - math.radians(14), R), pol(ra + 3.9, o - math.radians(4), R),
          pol(ra + 3.7, o + math.radians(8), R), pol(ra + 2.4, o + math.radians(10), R)]
    spring = stroke(bezier(*sp, 20), 0.36, 0.2)
    return body, spring, piv


def layout_summary():
    tb = train_bridge()
    return {
        'plate': plate(),
        'train': tb,
        'barrel': barrel_bridge(tb),
        'pallet': pallet_bridge(),
        'cock': balance_cock(),
    }
