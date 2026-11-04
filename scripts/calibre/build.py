"""Builds the ChainScore calibre in Blender from the 2D layout in geom2d.

Usage (module): import build; parts = build.build()
Every part is registered with an explode layer so the render script can
take the movement apart along its own axis.
"""
import sys, os, math, glob
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy, bmesh
# Cycles compiles the OSL finishes with the `oslquery` module that ships
# inside the bpy wheel but outside its import path.
for _p in glob.glob(os.path.join(os.path.dirname(bpy.__file__), '*', 'python', 'lib', 'python3*', 'site-packages')):
    if _p not in sys.path:
        sys.path.append(_p)
from mathutils import Vector, Matrix, Euler
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.ops import unary_union
from shapely import affinity
import geom2d as g
import shaders

TAU = math.tau
PARTS = []     # dicts: obj, layer, lift (extra), base location
MATS = {}

Z = dict(
    plate_top=0.0, plate_bot=-1.8, recess=0.32,
    centre=(0.25, 0.40), third=(0.95, 1.07), fourth=(1.40, 1.51), escape=(1.75, 1.87),
    fork=(1.72, 1.90), barrel=(0.8, 2.2), bal=(2.65, 3.15), hs=(3.30, 3.44),
    bridge=(2.3, 3.5), pallet=(2.05, 2.55), cock=(3.6, 4.6), ratchet=(3.5, 4.05), crown=(3.5, 4.0),
)


# ------------------------------------------------------------------ utils --

def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def register(ob, layer, lift=0.0, side=(0.0, 0.0)):
    PARTS.append(dict(obj=ob, layer=layer, lift=lift, side=side, base=ob.location.copy(),
                      base_rot=ob.rotation_euler.copy()))
    return ob


def _polys(p):
    if p.is_empty:
        return []
    if isinstance(p, Polygon):
        return [p]
    return [q for q in getattr(p, 'geoms', []) if isinstance(q, Polygon) and q.area > 1e-6]


def classify_faces(me, mats, top_only_bevel=False):
    """Material slots: 0 top, 1 bevel/chamfer, 2 flank, 3 bottom."""
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        nz = p.normal.z
        if nz > 0.999:
            p.material_index = 0
            p.use_smooth = False
        elif nz < -0.999:
            p.material_index = min(3, len(mats) - 1)
            p.use_smooth = False
        elif abs(nz) < 0.02:
            p.material_index = min(2, len(mats) - 1)
            p.use_smooth = True
        else:
            p.material_index = min(1, len(mats) - 1)
            p.use_smooth = True


def extrude(name, poly, z0, z1, mats, bevel=0.03, res=0, simplify=0.0015, loc=(0, 0)):
    """Extrude a shapely (Multi)Polygon between z0 and z1 with a chamfer.
    res=0 gives a flat 45 degree chamfer (anglage); res>0 a rounded edge."""
    h = z1 - z0
    bevel = min(bevel, h * 0.45)
    cu = bpy.data.curves.new(name + '_cu', 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    cu.extrude = max(h / 2 - bevel, 1e-4)
    cu.bevel_depth = bevel
    cu.bevel_resolution = res
    cu.offset = -bevel
    cu.resolution_u = 1
    for q in _polys(poly):
        if simplify:
            q = q.simplify(simplify, preserve_topology=True)
        for ringc in [q.exterior] + list(q.interiors):
            pts = list(ringc.coords)[:-1]
            sp = cu.splines.new('POLY')
            sp.points.add(len(pts) - 1)
            for i, (x, y) in enumerate(pts):
                sp.points[i].co = (x - loc[0], y - loc[1], 0, 1)
            sp.use_cyclic_u = True
    tmp = bpy.data.objects.new(name + '_tmp', cu)
    link(tmp)
    tmp.location = (0, 0, 0)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    for v in me.vertices:
        v.co.z += h / 2
    me.update()
    classify_faces(me, mats)
    ob = bpy.data.objects.new(name, me)
    ob.location = (loc[0], loc[1], z0)
    return link(ob)


def lathe(name, prof, mats, segs=64, loc=(0, 0, 0), smooth=True, mat_by_seg=None):
    """Revolve a (r, z) profile about local Z. mat_by_seg: list of material
    indices per profile segment."""
    bm = bmesh.new()
    rings = []
    for (r, z) in prof:
        if r < 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(TAU * k / segs), r * math.sin(TAU * k / segs), z))
                          for k in range(segs)])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        mi = mat_by_seg[i] if mat_by_seg else 0
        for k in range(segs):
            k2 = (k + 1) % segs
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                f = bm.faces.new((a[0], b[k], b[k2]))
            elif len(b) == 1:
                f = bm.faces.new((a[k], b[0], a[k2]))
            else:
                f = bm.faces.new((a[k], b[k], b[k2], a[k2]))
            f.material_index = mi
            f.smooth = smooth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    return link(ob)


def boolean(ob, cutter, op='DIFFERENCE'):
    mod = ob.modifiers.new('bool', 'BOOLEAN')
    mod.operation = op
    mod.object = cutter
    mod.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.remove(mod)
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def box_obj(name, sx, sy, sz, loc):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    return link(ob)


def instance(src, name, loc, rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, src.data)
    ob.location = loc
    ob.rotation_euler = rot
    return link(ob)


# ---------------------------------------------------------------- screws --

_SCREWS = {}


def screw_template(key, r, h, mats, slot=True, shank=0.9):
    if key in _SCREWS:
        return _SCREWS[key]
    prof = [(0.0, h), (r * 0.55, h * 0.985), (r * 0.86, h * 0.93), (r * 0.94, h * 0.82), (r, h * 0.62),
            (r, h * 0.1), (r * 0.96, 0.0), (r * 0.42, 0.0), (r * 0.42, -shank), (0.0, -shank)]
    ob = lathe('tpl_' + key, prof, mats, segs=72)
    if slot:
        cut = box_obj('slotcut', 2.6 * r, 0.2 * r, h * 0.9, (0, 0, h))
        boolean(ob, cut)
        bpy.data.objects.remove(cut)
        for p in ob.data.polygons:
            if p.normal.z > 0.999 and p.center.z < h * 0.7:
                p.material_index = 1
    bpy.context.scene.collection.objects.unlink(ob)
    _SCREWS[key] = ob
    return ob


def screw(key, name, at, z, r=0.78, h=0.42, rot=None, mats=None, layer=8, lift=0.0, slot=True):
    tpl = screw_template(key, r, h, mats or [MATS['blued'], MATS['blued_dark']], slot=slot)
    if rot is None:
        rot = (hash(name) % 1000) / 1000 * math.pi
    ob = instance(tpl, name, (at[0], at[1], z), (0, 0, rot))
    return register(ob, layer, lift)


# ------------------------------------------------------------- chatons --

def jewel_setting(name, c, r_out, z_top, layer, lift=0.0, screws=True):
    """Gold chaton holding an oliveted ruby, with two blued chaton screws."""
    r_in = r_out * 0.58
    ch = lathe(name + '_chaton', [(r_in, z_top - 0.02), (r_in, z_top - 0.42), (r_out, z_top - 0.42),
                                  (r_out, z_top - 0.03), (r_out - 0.05, z_top + 0.03), (r_in + 0.06, z_top + 0.03),
                                  (r_in, z_top - 0.02)],
               [MATS['chaton'], MATS['gold_polish']], segs=96, mat_by_seg=[0, 0, 0, 1, 0, 1], loc=(c[0], c[1], 0))
    register(ch, layer, lift)
    jr = r_in
    jw = lathe(name + '_ruby', [(0.06, z_top - 0.06), (jr * 0.45, z_top - 0.035), (jr * 0.85, z_top - 0.07),
                                (jr, z_top - 0.12), (jr, z_top - 0.36), (0.06, z_top - 0.36), (0.06, z_top - 0.06)],
               [MATS['ruby']], segs=64, loc=(c[0], c[1], 0))
    register(jw, layer, lift)
    pv = lathe(name + '_pivot', [(0.0, z_top - 0.1), (0.055, z_top - 0.1), (0.055, z_top - 0.5), (0, z_top - 0.5)],
               [MATS['steel_polish']], segs=24, loc=(c[0], c[1], 0))
    register(pv, layer - 1 if layer > 1 else layer, 0)
    if screws:
        a0 = (hash(name) % 628) / 100.0
        for k in (0, 1):
            a = a0 + k * math.pi
            p = (c[0] + (r_out + 0.12) * math.cos(a), c[1] + (r_out + 0.12) * math.sin(a))
            screw('chaton', name + f'_cs{k}', p, z_top, r=0.27, h=0.16, layer=layer, lift=lift + 0.6)
    return ch


# --------------------------------------------------------------- wheels --

def mesh_phase(z_a, ca, z_b, cb):
    """Phase for wheel a (tooth pointing at b) and b (gap facing a)."""
    return g.ang(ca, cb), g.ang(cb, ca) + math.pi / z_b


def wheel_with_pinion(name, outline_fn, c, zw, pin_z, pin_teeth, pin_m, wheel_phase, pin_phase, arbor, layer,
                      wheel_mat='gold_circ', pin_extra=0.0):
    w_poly = outline_fn()
    w_poly = affinity.rotate(w_poly, wheel_phase, origin=(0, 0), use_radians=True)
    w = extrude(name, affinity.translate(w_poly, c[0], c[1]), zw[0], zw[1],
                [MATS[wheel_mat], MATS['gold_polish'], MATS['gold_polish'], MATS[wheel_mat]], bevel=0.018, res=1,
                loc=c)
    register(w, layer)
    pp = g.pinion_outline(pin_teeth, pin_m, phase=pin_phase)
    pin = extrude(name + '_pinion', affinity.translate(pp, c[0], c[1]), pin_z[0], pin_z[1],
                  [MATS['steel_polish'], MATS['steel_polish'], MATS['steel_polish'], MATS['steel_polish']],
                  bevel=0.01, res=1, loc=c)
    register(pin, layer)
    a0, a1 = arbor
    shaft = lathe(name + '_arbor', [(0, a0), (0.065, a0), (0.065, a0 + 0.35), (0.12, a0 + 0.45),
                                    (0.12, a1 - 0.45), (0.065, a1 - 0.35), (0.065, a1), (0, a1)],
                  [MATS['steel_polish']], segs=32, loc=(c[0], c[1], 0))
    register(shaft, layer)
    seat = lathe(name + '_seat', [(0.12, zw[0] - 0.04), (0.34, zw[0] - 0.04), (0.34, zw[1] + 0.05),
                                  (0.3, zw[1] + 0.09), (0.12, zw[1] + 0.09), (0.12, zw[0] - 0.04)],
                 [MATS['steel_polish']], segs=48, loc=(c[0], c[1], 0))
    register(seat, layer)
    return w


def sorted_profile(prof):
    out = []
    for r, z in prof:
        if out and abs(out[-1][1] - z) < 1e-9 and abs(out[-1][0] - r) < 1e-9:
            continue
        out.append((r, z))
    return out


# ---------------------------------------------------------------- build --

def build():
    global MATS
    PARTS.clear()
    _SCREWS.clear()
    MATS = shaders.make_all()
    L = g.layout_summary()

    # --- plate, with a recess for the balance and escapement
    plate = g.plate()
    recess = unary_union([g.circle(g.B, 6.75), g.circle(g.E, 2.95), g.circle(g.P, 1.7),
                          g.stroke([g.E, g.P, g.B], 3.2)]).intersection(g.circle((0, 0), g.PLATE_R - 0.9))
    recess = g.smooth(recess, 0.8, 0.2)
    pmats = [MATS['rh_perlage'], MATS['rh_polish'], MATS['rh_flank'], MATS['rh_satin']]
    lower = extrude('plate', plate, Z['plate_bot'], Z['plate_top'] - Z['recess'], pmats, bevel=0.18)
    upper = extrude('plate_upper', plate.difference(recess), Z['plate_top'] - Z['recess'] - 0.01, Z['plate_top'],
                    pmats, bevel=0.06)
    register(lower, 0)
    register(upper, 0)

    # --- pillars under every bridge foot (mostly hidden, seen in the explode)
    for k, feet in g.FEET.items():
        top = {'train': Z['bridge'][0], 'barrel': Z['bridge'][0], 'pallet': Z['pallet'][0], 'cock': Z['cock'][0]}[k]
        for i, f in enumerate(feet):
            p = extrude(f'pillar_{k}{i}', g.circle(f, 0.95), 0.0, top,
                        [MATS['rh_satin'], MATS['rh_polish'], MATS['rh_flank'], MATS['rh_satin']], bevel=0.05,
                        loc=f)
            register(p, 0)

    # --- barrel (gilt drum, teeth at the bottom, lid with snailing)
    zb0, zb1 = Z['barrel']
    rb_root = g.M_BARREL * g.Z_BARREL / 2 - 1.75 * g.M_BARREL
    ph_bar, ph_cpin = mesh_phase(g.Z_BARREL, g.R, g.Z_CPIN, g.C)
    bt = affinity.rotate(g.barrel_teeth(), ph_bar, origin=(0, 0), use_radians=True).difference(g.circle((0, 0), 1.0))
    bteeth = extrude('barrel_teeth', affinity.translate(bt, *g.R), zb0, zb0 + 0.32,
                     [MATS['gilt'], MATS['gold_polish'], MATS['gold_polish'], MATS['gilt']], bevel=0.02, res=1,
                     loc=g.R)
    register(bteeth, 1)
    drum = lathe('barrel_drum', [(rb_root - 0.25, zb0 + 0.3), (rb_root - 0.02, zb0 + 0.3), (rb_root, zb0 + 0.34),
                                 (rb_root, zb1 - 0.04), (rb_root - 0.04, zb1), (rb_root - 0.35, zb1),
                                 (rb_root - 0.35, zb0 + 0.3)],
                 [MATS['gilt']], segs=192, loc=(g.R[0], g.R[1], 0))
    register(drum, 1)
    lid = lathe('barrel_lid', [(0.9, zb1 + 0.04), (rb_root - 0.3, zb1 + 0.04), (rb_root - 0.36, zb1 - 0.02),
                               (0.9, zb1 - 0.02), (0.9, zb1 + 0.04)],
                [MATS['steel_snail']], segs=192, loc=(g.R[0], g.R[1], 0), smooth=False)
    register(lid, 1, 0.3)
    barb = lathe('barrel_arbor', [(0, zb0 - 0.6), (0.45, zb0 - 0.6), (0.45, zb1 + 0.2), (0.6, zb1 + 0.25),
                                  (0.6, Z['ratchet'][0]), (0, Z['ratchet'][0])],
                 [MATS['steel_polish']], segs=48, loc=(g.R[0], g.R[1], 0))
    register(barb, 1, 0.5)

    # --- going train
    ph_c, ph_3p = mesh_phase(g.Z_CENTRE, g.C, g.Z_3PIN, g.T3)
    ph_3, ph_4p = mesh_phase(g.Z_THIRD, g.T3, g.Z_4PIN, g.T4)
    ph_4, ph_ep = mesh_phase(g.Z_FOURTH, g.T4, g.Z_EPIN, g.E)
    wheel_with_pinion('centre_wheel', g.centre_wheel, g.C, Z['centre'], (zb0 - 0.05, zb0 + 0.38), g.Z_CPIN,
                      g.M_BARREL, ph_c, ph_cpin, (-1.2, Z['bridge'][1] - 0.1), 1)
    wheel_with_pinion('third_wheel', g.third_wheel, g.T3, Z['third'], (0.18, 0.48), g.Z_3PIN, g.M_CENTRE,
                      ph_3, ph_3p, (-0.9, Z['bridge'][1] - 0.1), 2)
    wheel_with_pinion('fourth_wheel', g.fourth_wheel, g.T4, Z['fourth'], (0.88, 1.12), g.Z_4PIN, g.M_THIRD,
                      ph_4, ph_4p, (-1.6, Z['bridge'][1] - 0.1), 2)

    # --- escapement: choose the escape-wheel phase so one tooth rests on a
    # pallet's locking face and the other pallet sits in a tooth space.
    body, stones, guard, dirs = g.pallet_fork_local()
    a_fork = g.ang(g.P, g.B)
    st_w = [g.at(s, g.P, a_fork) for s in stones]
    ew = g.escape_wheel()
    best = None
    for k in range(0, 2400):
        ph = math.radians(24.0 * k / 2400)
        wpoly = g.at(ew, g.E, ph)
        if any(wpoly.intersects(s) for s in st_w):
            continue
        dmin = min(wpoly.distance(s) for s in st_w)
        if best is None or dmin < best[0]:
            best = (dmin, ph)
    ph_esc = best[1]
    esc = extrude('escape_wheel', g.at(ew, g.E, ph_esc), *Z['escape'],
                  [MATS['steel_polish'], MATS['steel_polish'], MATS['steel_dark'], MATS['steel_polish']], bevel=0.012,
                  res=1, loc=g.E)
    register(esc, 3)
    pp = g.pinion_outline(g.Z_EPIN, g.M_FOURTH, phase=ph_ep)
    ep = extrude('escape_pinion', affinity.translate(pp, *g.E), 1.33, 1.58, [MATS['steel_polish']] * 4, bevel=0.008,
                 res=1, loc=g.E)
    register(ep, 3)
    eab = lathe('escape_arbor', [(0, -0.6), (0.06, -0.6), (0.06, -0.3), (0.1, -0.2), (0.1, 1.3), (0.2, 1.33),
                                 (0.2, Z['escape'][1] + 0.05), (0.1, Z['escape'][1] + 0.1), (0.1, Z['bridge'][1] - 0.45),
                                 (0.06, Z['bridge'][1] - 0.35), (0.06, Z['bridge'][1] - 0.1), (0, Z['bridge'][1] - 0.1)],
                [MATS['steel_polish']], segs=24, loc=(g.E[0], g.E[1], 0))
    register(eab, 3)

    fk = extrude('pallet_fork', g.at(body, g.P, a_fork), *Z['fork'],
                 [MATS['steel_polish'], MATS['steel_polish'], MATS['steel_dark'], MATS['steel_polish']], bevel=0.015,
                 res=1, loc=g.P)
    register(fk, 4)
    for i, s in enumerate(st_w):
        so = extrude(f'pallet_stone{i}', s, Z['fork'][0] - 0.02, Z['fork'][1] + 0.05, [MATS['ruby']] * 4, bevel=0.01,
                     res=1, loc=s.centroid.coords[0])
        register(so, 4)
    fab = lathe('pallet_arbor', [(0, -0.4), (0.06, -0.4), (0.06, -0.1), (0.11, 0.0), (0.11, Z['pallet'][0] - 0.3),
                                 (0.06, Z['pallet'][0] - 0.2), (0.06, Z['pallet'][1] - 0.1), (0, Z['pallet'][1] - 0.1)],
                [MATS['steel_polish']], segs=24, loc=(g.P[0], g.P[1], 0))
    register(fab, 4)
    gp = g.at(Point(guard).buffer(0.05), g.P, a_fork).centroid.coords[0]
    guard_pin = lathe('guard_pin', [(0, Z['fork'][1]), (0.045, Z['fork'][1]), (0.045, Z['fork'][1] + 0.55),
                                    (0, Z['fork'][1] + 0.6)], [MATS['steel_polish']], segs=16, loc=(gp[0], gp[1], 0))
    register(guard_pin, 4)
    # banking pins on the plate either side of the fork
    for sgn in (1, -1):
        ang = a_fork + sgn * math.radians(11)
        bp = (g.P[0] + 2.1 * math.cos(ang), g.P[1] + 2.1 * math.sin(ang))
        pin = lathe(f'banking_{sgn}', [(0, -0.3), (0.11, -0.3), (0.11, Z['fork'][1] + 0.1), (0.08, Z['fork'][1] + 0.15),
                                       (0, Z['fork'][1] + 0.15)], [MATS['steel_polish']], segs=24, loc=(bp[0], bp[1], 0))
        register(pin, 0)

    # --- bridges
    bmats = [MATS['rh_cotes'], MATS['rh_polish'], MATS['rh_flank'], MATS['rh_satin']]
    jewel_holes = unary_union([g.circle(c, r + 0.01) for c, r in g.JEWELS['train']])
    feet_holes = unary_union([g.circle(f, 0.36) for f in g.FEET['train']])
    tb = extrude('train_bridge', L['train'].difference(jewel_holes).difference(feet_holes), *Z['bridge'], bmats,
                 bevel=0.11)
    register(tb, 5)
    bb_holes = unary_union([g.circle(f, 0.36) for f in g.FEET['barrel']] + [g.circle(g.R, 0.62), g.circle(g.K, 0.5)])
    bb = extrude('barrel_bridge', L['barrel'].difference(bb_holes), *Z['bridge'], bmats, bevel=0.11)
    register(bb, 5)
    pal_holes = unary_union([g.circle(g.P, g.JEWELS['pallet'][0][1] + 0.01), g.circle(g.FEET['pallet'][0], 0.36)])
    pb = extrude('pallet_bridge', L['pallet'].difference(pal_holes), *Z['pallet'], bmats, bevel=0.07)
    register(pb, 5)
    for i, (c, r) in enumerate(g.JEWELS['train']):
        jewel_setting(f'tj{i}', c, r, Z['bridge'][1], 5)
    jewel_setting('pj', g.P, g.JEWELS['pallet'][0][1], Z['pallet'][1], 5, screws=False)
    for k in ('train', 'barrel'):
        for i, f in enumerate(g.FEET[k]):
            screw('bridge', f'screw_{k}{i}', f, Z['bridge'][1], layer=5, lift=1.6)
    screw('bridge', 'screw_pallet', g.FEET['pallet'][0], Z['pallet'][1], layer=5, lift=1.6)

    # --- keyless works on the barrel bridge
    ph_rat, ph_crown = mesh_phase(g.Z_RATCHET, g.R, g.Z_CROWN, g.K)
    rat_poly = affinity.rotate(g.ratchet_wheel(), ph_rat, origin=(0, 0), use_radians=True)
    rat = extrude('ratchet_wheel', affinity.translate(rat_poly, *g.R), *Z['ratchet'],
                  [MATS['steel_snail'], MATS['steel_polish'], MATS['steel_polish'], MATS['steel_snail']], bevel=0.05,
                  res=0, loc=g.R)
    register(rat, 6)
    cr_poly = affinity.rotate(g.wheel_outline(g.Z_CROWN, g.M_RATCHET, add=1.15, ded=1.55, tf=0.5), ph_crown,
                              origin=(0, 0), use_radians=True).difference(g.circle((0, 0), 0.5))
    crw = extrude('crown_wheel', affinity.translate(cr_poly, *g.K), *Z['crown'],
                  [MATS['steel_snail'], MATS['steel_polish'], MATS['steel_polish'], MATS['steel_snail']], bevel=0.05,
                  res=0, loc=g.K)
    register(crw, 6)
    core = lathe('crown_core', [(0.5, Z['crown'][1]), (1.25, Z['crown'][1]), (1.25, Z['crown'][1] + 0.08),
                                (1.18, Z['crown'][1] + 0.12), (0.5, Z['crown'][1] + 0.12)],
                 [MATS['steel_polish']], segs=96, loc=(g.K[0], g.K[1], 0), smooth=False)
    register(core, 6, 0.4)
    screw('ratchet', 'ratchet_screw', g.R, Z['ratchet'][1], r=1.38, h=0.5,
          mats=[MATS['steel_polish'], MATS['steel_dark']], layer=6, lift=1.8)
    screw('crownscrew', 'crown_screw', g.K, Z['crown'][1] + 0.12, r=0.95, h=0.42, layer=6, lift=1.8)
    cb, cs, cpiv = g.click_and_spring()
    pa = TAU / g.Z_RATCHET
    a_tip = math.radians(122)
    k = round((a_tip - ph_rat) / pa - 0.5)
    delta = (ph_rat + (k + 0.5) * pa) - a_tip
    cb = affinity.rotate(cb, delta, origin=g.R, use_radians=True)
    cs = affinity.rotate(cs, delta, origin=g.R, use_radians=True)
    cpiv = affinity.rotate(Point(cpiv), delta, origin=g.R, use_radians=True).coords[0]
    click = extrude('click', cb, Z['ratchet'][0], Z['ratchet'][0] + 0.38,
                    [MATS['steel_polish'], MATS['steel_polish'], MATS['steel_dark'], MATS['steel_polish']],
                    bevel=0.04, res=0)
    register(click, 6)
    spring = extrude('click_spring', cs, Z['ratchet'][0], Z['ratchet'][0] + 0.3,
                     [MATS['steel_polish']] * 4, bevel=0.03, res=1)
    register(spring, 6)
    screw('clickscrew', 'click_screw', cpiv, Z['ratchet'][0] + 0.38, r=0.62, h=0.3, layer=6, lift=1.5)

    # --- balance
    bal_poly = g.balance_wheel()
    bal = extrude('balance', affinity.translate(bal_poly, *g.B), *Z['bal'],
                  [MATS['glucydur'], MATS['glucydur'], MATS['glucydur'], MATS['glucydur']], bevel=0.035, res=2,
                  loc=g.B)
    register(bal, 7)
    # timing screws, radial, gold
    tpl = screw_template('timing', 0.2, 0.26, [MATS['gold_polish'], MATS['gold_polish']], slot=True, shank=0.3)
    for k in range(g.BAL_SCREWS):
        a = TAU * k / g.BAL_SCREWS + math.radians(5)
        p = (g.B[0] + g.BAL_RIM_OUT * math.cos(a), g.B[1] + g.BAL_RIM_OUT * math.sin(a))
        ob = instance(tpl, f'timing_{k}', (p[0], p[1], sum(Z['bal']) / 2), (0, math.pi / 2, a))
        ob.rotation_mode = 'XYZ'
        # point the screw axis outward: rotate local Z to the radial direction
        ob.rotation_euler = (Vector((math.cos(a), math.sin(a), 0)).to_track_quat('Z', 'Y')).to_euler()
        register(ob, 7)
    zs0, zs1 = -0.9, Z['cock'][1] - 0.1
    staff = lathe('balance_staff', [(0, zs0), (0.05, zs0), (0.05, zs0 + 0.3), (0.12, zs0 + 0.5), (0.12, 1.6),
                                    (0.28, 1.65), (0.28, Z['bal'][0] - 0.02), (0.55, Z['bal'][0]),
                                    (0.55, Z['bal'][1] + 0.02), (0.2, Z['bal'][1] + 0.05), (0.2, Z['hs'][0] - 0.02),
                                    (0.12, Z['hs'][1] + 0.2), (0.12, zs1 - 0.4), (0.05, zs1 - 0.25), (0.05, zs1),
                                    (0, zs1)], [MATS['steel_polish']], segs=40, loc=(g.B[0], g.B[1], 0))
    register(staff, 7)
    roller = lathe('roller', [(0.2, 1.72), (1.15, 1.72), (1.15, 1.84), (0.2, 1.84)], [MATS['steel_polish']],
                   segs=96, loc=(g.B[0], g.B[1], 0), smooth=False)
    register(roller, 7)
    a_imp = g.ang(g.B, g.P)
    ip = (g.B[0] + 1.0 * math.cos(a_imp), g.B[1] + 1.0 * math.sin(a_imp))
    imp = lathe('impulse_jewel', [(0, 1.62), (0.1, 1.62), (0.1, 1.84), (0, 1.84)], [MATS['ruby']], segs=24,
                loc=(ip[0], ip[1], 0))
    register(imp, 7)
    # hairspring: Archimedean spiral ribbon, outer end to the stud on the cock
    a_stud = g.ang(g.B, g.FEET['cock'][0]) + 0.42
    hs = hairspring(g.hairspring_path(a_end=a_stud), *Z['hs'])
    register(hs, 7, 0.5)
    collet = lathe('collet', [(0.12, Z['hs'][0]), (0.42, Z['hs'][0]), (0.42, Z['hs'][1]), (0.12, Z['hs'][1])],
                   [MATS['steel_polish']], segs=48, loc=(g.B[0], g.B[1], 0), smooth=False)
    register(collet, 7, 0.5)

    # --- balance cock with regulator and shock setting
    Fk = g.FEET['cock'][0]
    cock = extrude('balance_cock', L['cock'].difference(g.circle(g.B, 1.05)).difference(g.circle(Fk, 0.36)),
                   *Z['cock'], bmats, bevel=0.1)
    register(cock, 9)
    foot = extrude('cock_foot', g.circle(Fk, 1.9).intersection(L['cock']), 0.0, Z['cock'][0] + 0.01,
                   [MATS['rh_satin'], MATS['rh_polish'], MATS['rh_flank'], MATS['rh_satin']], bevel=0.06, loc=Fk)
    register(foot, 9)
    screw('bridge', 'screw_cock', Fk, Z['cock'][1], layer=9, lift=1.6)
    stud_p = (g.B[0] + 3.45 * math.cos(a_stud), g.B[1] + 3.45 * math.sin(a_stud))
    stud = extrude('stud', g.circle(stud_p, 0.28), Z['hs'][0] - 0.05, Z['cock'][0],
                   [MATS['steel_polish']] * 4, bevel=0.03, res=1, loc=stud_p)
    register(stud, 9)
    shock_setting(g.B, Z['cock'][1], 9)
    regulator(g.B, Fk, Z['cock'][1], 9)

    # --- stem and crown, exiting at 9 o'clock
    stem_crown(10)

    # --- engraving
    engrave_arc('CHAINSCORE', bb, center=(0, 0), radius=15.1, a_mid=math.radians(212), size=0.95,
                z_top=Z['bridge'][1], spacing=1.4)
    engrave_line('SEVENTEEN JEWELS', tb, at=(8.2, 6.2), angle=math.radians(-62), size=0.6, z_top=Z['bridge'][1],
                 spacing=1.3)
    return PARTS


def hairspring(path, z0, z1, t=0.042):
    bm = bmesh.new()
    n = len(path)
    vs = []
    for i, (x, y) in enumerate(path):
        if i == 0:
            dx, dy = path[1][0] - x, path[1][1] - y
        elif i == n - 1:
            dx, dy = x - path[i - 1][0], y - path[i - 1][1]
        else:
            dx, dy = path[i + 1][0] - path[i - 1][0], path[i + 1][1] - path[i - 1][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L * t / 2, dx / L * t / 2
        X, Y = x + g.B[0], y + g.B[1]
        vs.append([bm.verts.new((X + nx, Y + ny, z0)), bm.verts.new((X - nx, Y - ny, z0)),
                   bm.verts.new((X - nx, Y - ny, z1)), bm.verts.new((X + nx, Y + ny, z1))])
    for i in range(n - 1):
        a, b = vs[i], vs[i + 1]
        for k in range(4):
            f = bm.faces.new((a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]))
            f.smooth = True
    bm.faces.new(vs[0][::-1])
    bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('hairspring')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(MATS['hairspring'])
    return link(bpy.data.objects.new('hairspring', me))


def shock_setting(c, z_top, layer):
    """Incabloc-style setting: gold bushing, cap jewel, lyre spring."""
    bush = lathe('shock_bush', [(0.4, z_top - 0.3), (1.0, z_top - 0.3), (1.0, z_top + 0.02), (0.95, z_top + 0.07),
                                (0.55, z_top + 0.07), (0.5, z_top + 0.02), (0.4, z_top + 0.02)],
                 [MATS['chaton']], segs=96, loc=(c[0], c[1], 0))
    register(bush, layer)
    cap = lathe('cap_jewel', [(0, z_top + 0.06), (0.48, z_top + 0.06), (0.48, z_top - 0.08), (0, z_top - 0.08)],
                [MATS['ruby']], segs=64, loc=(c[0], c[1], 0), smooth=False)
    register(cap, layer)
    # lyre: two mirrored S-curves from a base bar, tips hooked over the cap
    pts_l = g.bezier((-0.62, -0.78), (-1.05, -0.2), (-0.75, 0.55), (-0.18, 0.62), 18)
    pts_r = [(-x, y) for x, y in pts_l]
    lyre = unary_union([g.stroke(pts_l, 0.12, 0.09), g.stroke(pts_r, 0.12, 0.09),
                        g.stroke([(-0.62, -0.78), (0.62, -0.78)], 0.14, 0.14)])
    lyre = affinity.rotate(lyre, g.ang(g.B, g.FEET['cock'][0]) + math.pi / 2, origin=(0, 0), use_radians=True)
    ly = extrude('lyre', affinity.translate(lyre, *c), z_top + 0.07, z_top + 0.15, [MATS['steel_polish']] * 4,
                 bevel=0.02, res=1, loc=c)
    register(ly, layer, 0.3)


def regulator(c, foot, z_top, layer):
    """Index regulator with a swan-neck fine adjuster."""
    a = g.ang(c, foot) + math.radians(5)
    ring_p = g.ring(c, 1.32, 1.05)
    tip = (c[0] + 5.6 * math.cos(a), c[1] + 5.6 * math.sin(a))
    arm = g.stroke([(c[0] + 1.2 * math.cos(a), c[1] + 1.2 * math.sin(a)), tip], 0.5, 0.12)
    back = g.stroke([(c[0] - 1.2 * math.cos(a), c[1] - 1.2 * math.sin(a)),
                     (c[0] - 2.2 * math.cos(a), c[1] - 2.2 * math.sin(a))], 0.42, 0.3)
    idx = g.smooth(unary_union([ring_p, arm, back]), 0.15, 0.0)
    ob = extrude('regulator_index', idx, z_top, z_top + 0.12, [MATS['steel_polish'], MATS['steel_polish'],
                                                              MATS['steel_dark'], MATS['steel_polish']],
                 bevel=0.025, res=1)
    register(ob, layer, 0.25)
    # swan neck: a curved spring fixed on the cock, pressing on the index
    n = (-math.sin(a), math.cos(a))
    base = (c[0] + 3.3 * math.cos(a) + 1.3 * n[0], c[1] + 3.3 * math.sin(a) + 1.3 * n[1])
    pts = g.bezier(base,
                   (base[0] - 1.6 * math.cos(a) + 0.4 * n[0], base[1] - 1.6 * math.sin(a) + 0.4 * n[1]),
                   (base[0] - 2.2 * math.cos(a) - 0.9 * n[0], base[1] - 2.2 * math.sin(a) - 0.9 * n[1]),
                   (base[0] - 0.9 * math.cos(a) - 1.05 * n[0], base[1] - 0.9 * math.sin(a) - 1.05 * n[1]), 30)
    swan = unary_union([g.stroke(pts, 0.36, 0.16), g.circle(base, 0.5)])
    sw = extrude('swan_neck', swan, z_top, z_top + 0.14, [MATS['steel_polish'], MATS['steel_polish'],
                                                          MATS['steel_dark'], MATS['steel_polish']], bevel=0.03, res=1)
    register(sw, layer, 0.35)
    screw('tiny', 'swan_screw', base, z_top + 0.14, r=0.34, h=0.2, layer=layer, lift=0.9)
    adj = (c[0] + 3.3 * math.cos(a) - 0.75 * n[0], c[1] + 3.3 * math.sin(a) - 0.75 * n[1])
    screw('tiny', 'adjust_screw', adj, z_top, r=0.34, h=0.2, layer=layer, lift=0.9)


def stem_crown(layer):
    y, z = g.STEM_Y, -0.9
    stem = lathe('stem', [(0, -12.5), (0.32, -12.5), (0.32, -18.2), (0.45, -18.4), (0.45, -19.8), (0, -19.8)],
                 [MATS['steel_polish']], segs=32, loc=(0, 0, 0))
    stem.rotation_euler = (0, math.radians(-90), 0)
    stem.location = (0, y, z)
    # lathe was built along Z; rotate so it runs along -X
    stem.rotation_euler = (0, math.radians(90), 0)
    register(stem, layer, 0.0, side=(-4.0, 0.0))
    flutes = 28
    pts = []
    for k in range(flutes * 6):
        th = TAU * k / (flutes * 6)
        r = 2.55 - 0.13 * (0.5 + 0.5 * math.cos(th * flutes)) ** 3
        pts.append((r * math.cos(th), r * math.sin(th)))
    crown_poly = Polygon(pts)
    cr = extrude('crown', crown_poly, 0.0, 2.6, [MATS['steel_polish'], MATS['steel_polish'], MATS['steel_polish'],
                                                MATS['steel_polish']], bevel=0.35, res=3)
    cr.rotation_euler = (0, math.radians(-90), 0)
    cr.location = (-19.7, y, z)
    register(cr, layer, 0.0, side=(-4.0, 0.0))
    cap = lathe('crown_cap', [(0, 0.0), (1.5, 0.0), (1.5, 0.12), (1.1, 0.25), (0, 0.3)], [MATS['steel_polish']],
                segs=64)
    cap.rotation_euler = (0, math.radians(-90), 0)
    cap.location = (-22.3, y, z)
    register(cap, layer, 0.0, side=(-4.0, 0.0))


FONT_PATH = os.environ.get('CALIBRE_ENGRAVING_FONT', '/usr/share/fonts/truetype/freefont/FreeSerif.ttf')


def _text_mesh(name, body, size, depth, spacing, follow=None):
    cu = bpy.data.curves.new(name + '_txt', 'FONT')
    cu.body = body
    cu.font = bpy.data.fonts.load(FONT_PATH, check_existing=True)
    cu.size = size
    cu.extrude = depth / 2
    cu.space_character = spacing
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.resolution_u = 4
    ob = bpy.data.objects.new(name + '_txt', cu)
    link(ob)
    if follow is not None:
        cu.follow_curve = follow
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    mw = ob.matrix_world.copy()
    bpy.data.objects.remove(ob)
    return me, mw


def _engrave(name, me, target, z_top, depth=0.07):
    """me: text mesh in target-local XY. z_top: world height of the surface."""
    zl = z_top - target.location.z
    cutter = bpy.data.objects.new(name + '_cut', me.copy())
    cutter.location = target.location.copy()
    link(cutter)
    for v in cutter.data.vertices:
        v.co.z = zl + 0.05 if v.co.z > 0 else zl - depth
    cutter.data.update()
    boolean(target, cutter)
    bpy.data.objects.remove(cutter)
    for p in target.data.polygons:
        if zl - depth - 0.01 < p.center.z < zl - 0.004:
            p.material_index = 3
    fill = bpy.data.objects.new(name + '_fill', me)
    fill.location = target.location.copy()
    for v in fill.data.vertices:
        v.co.z = zl - 0.028 if v.co.z > 0 else zl - depth + 0.012
    fill.data.update()
    fill.data.materials.clear()
    fill.data.materials.append(MATS['engrave'])
    for p in fill.data.polygons:
        p.use_smooth = False
    link(fill)
    for P_ in PARTS:
        if P_['obj'] is target:
            register(fill, P_['layer'], P_['lift'])
            break


def engrave_arc(body, target, center, radius, a_mid, size, z_top, spacing=1.3, inward=True):
    """Bend straight text onto an arc. inward=True: letter tops face the
    centre and the text reads counter-clockwise (lower-half convention)."""
    me, mw = _text_mesh('engr_' + body[:6], body, size, 0.2, spacing)
    for v in me.vertices:
        p = mw @ v.co
        if inward:
            th = a_mid + p.x / radius
            r = radius - (p.y + size * 0.36)
        else:
            th = a_mid - p.x / radius
            r = radius + (p.y - size * 0.36)
        v.co = Vector((center[0] + r * math.cos(th) - target.location.x,
                       center[1] + r * math.sin(th) - target.location.y, p.z))
    _engrave('engr_' + body[:6], me, target, z_top)


def engrave_line(body, target, at, angle, size, z_top, spacing=1.3):
    me, mw = _text_mesh('engr_' + body[:6], body, size, 0.2, spacing)
    rot = Matrix.Rotation(angle, 4, 'Z')
    for v in me.vertices:
        p = rot @ (mw @ v.co)
        v.co = Vector((p.x + at[0] - target.location.x, p.y + at[1] - target.location.y, p.z))
    _engrave('engr_' + body[:6], me, target, z_top)
