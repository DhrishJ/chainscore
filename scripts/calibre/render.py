"""Render shots of the calibre.

  python render.py --shot top --res 1200x1200 --samples 64 --out out/top.png
  python render.py --shot explode --frames 0-59 --res 1600x1000 --out out/explode/f_####.png
"""
import sys, os, math, argparse, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build
import bpy
from mathutils import Vector, Matrix
import geom2d as g


def setup_scene(samples, res, transparent=True):
    sc = bpy.context.scene
    bpy.ops.preferences.addon_enable(module='cycles')
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    if os.environ.get('THREADS'):
        sc.render.threads_mode = 'FIXED'
        sc.render.threads = int(os.environ['THREADS'])
    sc.cycles.shading_system = True
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.012
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 10
    sc.cycles.glossy_bounces = 8
    sc.cycles.transmission_bounces = 8
    sc.cycles.diffuse_bounces = 2
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 0.5
    sc.cycles.sample_clamp_indirect = 8.0
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 0.001
    sc.unit_settings.length_unit = 'MILLIMETERS'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    sc.render.image_settings.color_depth = '16'
    try:
        sc.view_settings.view_transform = 'AgX'
        for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
            try:
                sc.view_settings.look = look
                break
            except TypeError:
                pass
    except TypeError:
        pass
    sc.view_settings.exposure = 0.0
    world = bpy.data.worlds.new('world')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.0015, 0.0016, 0.0019, 1)
    bg.inputs['Strength'].default_value = 1.0
    return sc


def emitter(name, size, loc, target, strength, color=(1, 1, 1), falloff=True):
    """Softbox: a plane with a radial falloff, aimed at target, hidden from
    the camera but visible in reflections."""
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.scale = (size[0], size[1], 1)
    ob.location = loc
    d = (Vector(target) - Vector(loc)).normalized()
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new(name + '_m')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    if falloff:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        gr = nt.nodes.new('ShaderNodeTexGradient')
        gr.gradient_type = 'SPHERICAL'
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1.9, 1.9, 1.9)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (0.04, 0.04, 0.04, 1)
        ramp.color_ramp.elements[1].position = 0.75
        ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(gr.outputs['Fac'], ramp.inputs['Fac'])
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = strength
        nt.links.new(ramp.outputs['Color'], mul.inputs[0])
        nt.links.new(mul.outputs[0], em.inputs['Strength'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    me.materials.append(mat)
    ob.visible_camera = False
    ob.visible_shadow = False
    return ob


def look_at(loc, target, up=(0, 0, 1)):
    """Rotation whose -Z looks at target with world-up kept upright; a
    straight-down view uses +Y as up (12 o'clock at the top)."""
    f = (Vector(target) - Vector(loc)).normalized()
    upv = Vector(up)
    if abs(f.dot(upv)) > 0.999:
        upv = Vector((0, 1, 0))
    r = f.cross(upv).normalized()
    u = r.cross(f).normalized()
    m = Matrix(((r.x, u.x, -f.x), (r.y, u.y, -f.y), (r.z, u.z, -f.z)))
    return m.to_quaternion()


def camera(loc, target, lens=90, fstop=None, focus=None, ortho=None):
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cd.sensor_width = 36
    cd.clip_start = 0.5
    cd.clip_end = 5000
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    cam = bpy.data.objects.new('cam', cd)
    cam.location = loc
    cam.rotation_euler = look_at(loc, target).to_euler()
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    if fstop:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = (Vector(focus or target) - Vector(loc)).length
    return cam


def lights_for(cam_loc, target=(0, 0, 2)):
    """Key softbox at the mirror direction of the camera (so the flat
    bridges show their finish), two strip lights for the chamfers, a
    small spot for sparkle, and a dim fill."""
    t = Vector(target)
    c = Vector(cam_loc) - t
    mirror = Vector((-c.x, -c.y, c.z))
    S = LIGHT_SCALE
    key_loc = t + mirror.normalized() * 260 + Vector((70, 40, 0))
    emitter('key', (190, 130), key_loc, t, 1.6 * S)
    side = Vector((c.y, -c.x, 0)).normalized()
    if side.length < 0.5:
        side = Vector((1, 0, 0))
    emitter('strip_l', (14, 240), t + side * 150 + Vector((0, 0, 70)), t, 3.0 * S, falloff=False)
    emitter('strip_r', (10, 240), t - side * 160 + Vector((0, 0, 45)), t, 1.6 * S, falloff=False)
    emitter('fill', (200, 200), Vector(cam_loc) * 1.2 + Vector((0, 0, 40)), t, 0.04 * S, falloff=False)


LIGHT_SCALE = float(os.environ.get('LIGHT_SCALE', '1.0'))

SHOTS = {
    'top': dict(cam=(0, 0, 118), target=(0, 0, 0), lens=90, fstop=None),
    'hero': dict(cam=(-20, -108, 82), target=(2.0, -3.6, 1.5), lens=82, fstop=18, focus=(6.39, -9.2, 3.0)),
    'macro': dict(cam=(22, -44, 36), target=(8.0, -6.6, 2.2), lens=100, fstop=11, focus=(9.0, -6.0, 2.6)),
    'explode': dict(cam=(-62, -128, 78), target=(0.0, -1.0, 13.0), lens=85, fstop=None),
}


LAYER_Z = {0: 0.0, 1: 6.0, 2: 8.6, 3: 10.6, 4: 11.6, 5: 17.0, 6: 21.6, 7: 26.0, 8: 28.0, 9: 31.5, 10: 0.0}


def explode(t):
    """Take the movement apart by assembly layer. t in [0, 1]; upper
    layers leave first, the plate never moves, the crown slides out."""
    for P in build.PARTS:
        L = P['layer']
        start = 0.42 * (1 - L / 10.0) if L else 0.0
        u = min(1.0, max(0.0, (t - start) / (1 - start)))
        u = u * u * (3 - 2 * u)
        dz = (LAYER_Z.get(L, 0.0) + P['lift'] * 1.7) * u
        sx, sy = P['side']
        ob = P['obj']
        ob.location = P['base'] + Vector((sx * 2.2 * u, sy * 2.2 * u, dz))


def place_explode_camera(cam, t):
    """Pull back and rise as the parts separate (smoothstep)."""
    u = t * t * (3 - 2 * t)
    d = Vector((-62, -128, 60)).normalized()
    tgt = Vector((0.0, -1.0, 1.6)).lerp(Vector((0.0, -1.0, 15.5)), u)
    dist = 118 + (182 - 118) * u
    cam.location = tgt + d * dist
    cam.rotation_euler = look_at(tuple(cam.location), tuple(tgt)).to_euler()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shot', default='top')
    ap.add_argument('--res', default='1000x1000')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--out', default=os.path.join(HERE, 'out', 'test.png'))
    ap.add_argument('--frames', default=None)
    ap.add_argument('--t', type=float, default=None)
    ap.add_argument('--save', default=None)
    ap.add_argument('--cam', default=None)
    ap.add_argument('--target', default=None)
    ap.add_argument('--lens', type=float, default=None)
    ap.add_argument('--shift', default=None)
    ap.add_argument('--fstop', type=float, default=None)
    ap.add_argument('--focus', default=None)
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    res = tuple(int(x) for x in args.res.split('x'))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = setup_scene(args.samples, res)
    t0 = time.time()
    build.build()
    print('built', len(build.PARTS), 'parts in', round(time.time() - t0, 1), 's')
    s = dict(SHOTS[args.shot])
    vec = lambda t: tuple(float(x) for x in t.split(','))
    if args.cam: s['cam'] = vec(args.cam)
    if args.target: s['target'] = vec(args.target)
    if args.lens: s['lens'] = args.lens
    if args.fstop is not None: s['fstop'] = args.fstop or None
    if args.focus: s['focus'] = vec(args.focus)
    if args.shift: s['shift'] = vec(args.shift)
    cam = camera(s['cam'], s['target'], s['lens'], s.get('fstop'), s.get('focus'), s.get('ortho'))
    if s.get('shift'):
        cam.data.shift_x, cam.data.shift_y = s['shift']
    lights_for(s['cam'], s['target'])
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=args.save)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    if args.frames:
        a, b = (int(x) for x in args.frames.split('-'))
        n = int(os.environ.get('EXPLODE_N', '60'))
        for f in range(a, b + 1):
            t = f / (n - 1)
            explode(t)
            if args.shot == 'explode':
                place_explode_camera(cam, t)
            sc.render.filepath = args.out.replace('####', f'{f:04d}')
            t1 = time.time()
            bpy.ops.render.render(write_still=True)
            print('frame', f, round(time.time() - t1, 1), 's', flush=True)
    else:
        if args.t is not None:
            explode(args.t)
            if args.shot == 'explode':
                place_explode_camera(cam, args.t)
        sc.render.filepath = args.out
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print('rendered in', round(time.time() - t1, 1), 's')


if __name__ == '__main__':
    main()
