"""OSL finishing shaders and Cycles materials for the calibre.

Every decorative finish is an anisotropic tangent field, which is what a
real finish is: the abrasive leaves micro-grooves and light streaks
perpendicular to them.
"""
import bpy

OSL_COTES = r'''
// Cotes de Geneve: parallel stripes, each cut by a spinning disc moved
// along the stripe, which leaves arcs running across the stripe.
shader cotes(float Width = 2.25, float Angle = -32.0, float Disc = 1.75,
             output vector Tangent = vector(1, 0, 0), output float Height = 0)
{
    float a = radians(Angle);
    vector ax = vector(cos(a), sin(a), 0);
    vector ay = vector(-sin(a), cos(a), 0);
    vector q = vector(P[0], P[1], 0);
    float uu = dot(q, ax);
    float vv = dot(q, ay);
    float s = uu / Width;
    float k = floor(s);
    float lx = (s - k - 0.5) * Width;
    float sq = sqrt(max(Disc * Disc - lx * lx, 1e-4));
    Tangent = normalize(sq * ax - lx * ay);
    float ph = (vv - sq) * 38.0 + k * 17.31;
    float fine = noise("perlin", ph) * 0.6 + noise("perlin", ph * 3.1 + 4.2) * 0.25;
    float prof = 1.0 - pow(2.0 * lx / Width, 2.0);
    float edge = smoothstep(0.0, 0.035, 0.5 - abs(s - k - 0.5));
    Height = 0.8 * prof * edge + 0.06 * fine;
}
'''

OSL_PERLAGE = r'''
// Perlage: overlapping circular graining spots laid row by row; the
// visible spot at a point is the last one applied that covers it.
shader perlage(float Spacing = 0.62, float Radius = 0.44,
               output vector Tangent = vector(1, 0, 0), output float Height = 0)
{
    float x = P[0];
    float y = P[1];
    float rh = Spacing * 0.866;
    float row = floor(y / rh);
    float best = -1e12;
    vector cb = vector(x, y, 0) + vector(0.001, 0, 0);
    for (int dr = -1; dr <= 2; dr++) {
        float r = row + dr;
        float off = mod(r, 2.0) * 0.5 * Spacing;
        float col = floor((x - off) / Spacing);
        for (int dc = -1; dc <= 2; dc++) {
            float cc = col + dc;
            vector c = vector((cc + 0.5) * Spacing + off, (r + 0.5) * rh, 0);
            float d = distance(vector(x, y, 0), c);
            if (d < Radius) {
                float order = r * 100000.0 + cc;
                if (order > best) { best = order; cb = c; }
            }
        }
    }
    vector rv = vector(x, y, 0) - cb;
    float d = length(rv);
    Tangent = normalize(vector(-rv[1], rv[0], 0) + vector(1e-5, 0, 0));
    float ring = noise("perlin", d * 140.0 + best * 0.013) * 0.5;
    Height = 0.35 * smoothstep(Radius, Radius * 0.82, d) + 0.04 * ring;
}
'''

OSL_CIRCULAR = r'''
// Circular graining / snailing about the object's own centre.
// Mode 0: circular satin. Mode 1: snailing (spiral azurage grooves).
// Mode 2: radial sunburst.
shader circular(int Mode = 0, float Pitch = 0.09,
                output vector Tangent = vector(1, 0, 0), output float Height = 0)
{
    point po = transform("object", P);
    float r = hypot(po[0], po[1]) + 1e-5;
    float th = atan2(po[1], po[0]);
    vector t;
    if (Mode == 2) t = vector(po[0], po[1], 0) / r;
    else t = vector(-po[1], po[0], 0) / r;
    Tangent = normalize(transform("object", "common", t));
    if (Mode == 1) {
        // snailing: overlapping spiral cuts; the tangent follows the spiral
        float sp = r / Pitch + th / (2.0 * M_PI) * 3.0;
        float w = sp - floor(sp);
        vector rad = vector(po[0], po[1], 0) / r;
        vector circ = vector(-po[1], po[0], 0) / r;
        float tilt = (w - 0.5) * 1.1;
        Tangent = normalize(transform("object", "common", circ * cos(tilt) + rad * sin(tilt)));
        Height = 0.5 + 0.5 * sin(sp * 2.0 * M_PI);
    } else {
        Height = noise("perlin", r * 90.0) * 0.5 + 0.5;
    }
}
'''

OSL_VERTICAL = r'''
// Straight vertical graining on flanks.
shader vertical(output vector Tangent = vector(0, 0, 1), output float Height = 0)
{
    Tangent = vector(0, 0, 1);
    Height = noise("perlin", P[0] * 60.0 + P[1] * 60.0) * 0.5;
}
'''


def _script(name, code):
    t = bpy.data.texts.get(name) or bpy.data.texts.new(name)
    t.clear()
    t.write(code)
    return t


def _principled(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return nt, bsdf


def metal(name, color, rough, aniso=0.0, osl=None, osl_params=None, bump=0.0, bump_dist=0.003,
          thin_film=None, coat=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt, b = _principled(mat)
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = rough
    b.inputs['Anisotropic'].default_value = aniso
    if thin_film:
        b.inputs['Thin Film Thickness'].default_value = thin_film[0]
        b.inputs['Thin Film IOR'].default_value = thin_film[1]
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.05
    if osl:
        sn = nt.nodes.new('ShaderNodeScript')
        sn.mode = 'INTERNAL'
        sn.script = osl
        sn.update()
        for k, v in (osl_params or {}).items():
            sn.inputs[k].default_value = v
        if aniso:
            nt.links.new(sn.outputs['Tangent'], b.inputs['Tangent'])
        if bump:
            bn = nt.nodes.new('ShaderNodeBump')
            bn.inputs['Strength'].default_value = bump
            bn.inputs['Distance'].default_value = bump_dist
            nt.links.new(sn.outputs['Height'], bn.inputs['Height'])
            nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])
    return mat


def ruby(name='ruby'):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt, b = _principled(mat)
    b.inputs['Base Color'].default_value = (0.92, 0.035, 0.09, 1)
    b.inputs['Metallic'].default_value = 0.0
    b.inputs['Roughness'].default_value = 0.02
    b.inputs['IOR'].default_value = 1.77
    b.inputs['Transmission Weight'].default_value = 1.0
    # a whisper of emission keeps tiny stones from reading as black holes
    b.inputs['Emission Color'].default_value = (0.9, 0.02, 0.08, 1)
    b.inputs['Emission Strength'].default_value = 0.015
    return mat


def make_all():
    cot = _script('cotes.osl', OSL_COTES)
    per = _script('perlage.osl', OSL_PERLAGE)
    cir = _script('circular.osl', OSL_CIRCULAR)
    ver = _script('vertical.osl', OSL_VERTICAL)
    RH = (0.70, 0.71, 0.73)
    GOLD = (0.96, 0.74, 0.40)
    STEEL = (0.55, 0.56, 0.58)
    M = {}
    M['rh_cotes'] = metal('rh_cotes', RH, 0.20, 0.85, cot, {}, bump=0.45, bump_dist=0.004)
    M['rh_polish'] = metal('rh_polish', RH, 0.035)
    M['rh_flank'] = metal('rh_flank', (0.66, 0.67, 0.69), 0.26, 0.6, ver, {}, bump=0.1)
    M['rh_perlage'] = metal('rh_perlage', (0.68, 0.69, 0.71), 0.22, 0.8, per, {'Spacing': 0.5, 'Radius': 0.36}, bump=0.16, bump_dist=0.003)
    M['rh_satin'] = metal('rh_satin', (0.66, 0.67, 0.69), 0.32)
    M['gold_circ'] = metal('gold_circ', GOLD, 0.16, 0.7, cir, {'Mode': 0}, bump=0.08)
    M['gold_polish'] = metal('gold_polish', GOLD, 0.06)
    M['chaton'] = metal('chaton', (1.0, 0.78, 0.45), 0.05)
    M['steel_polish'] = metal('steel_polish', STEEL, 0.045)
    M['steel_dark'] = metal('steel_dark', (0.42, 0.43, 0.45), 0.12)
    M['steel_snail'] = metal('steel_snail', (0.70, 0.71, 0.74), 0.14, 0.95, cir, {'Mode': 1, 'Pitch': 0.34}, bump=0.35,
                             bump_dist=0.003)
    M['steel_sun'] = metal('steel_sun', (0.66, 0.67, 0.70), 0.2, 0.85, cir, {'Mode': 2}, bump=0.05)
    M['blued'] = metal('blued', (0.035, 0.10, 0.42), 0.14, coat=0.0)
    M['blued_dark'] = metal('blued_dark', (0.02, 0.05, 0.22), 0.25)
    M['glucydur'] = metal('glucydur', (0.93, 0.62, 0.42), 0.12)
    M['glucydur_sat'] = metal('glucydur_sat', (0.93, 0.62, 0.42), 0.22, 0.6, cir, {'Mode': 0})
    M['hairspring'] = metal('hairspring', (0.62, 0.64, 0.70), 0.12)
    M['gilt'] = metal('gilt', (0.92, 0.72, 0.42), 0.2, 0.7, cir, {'Mode': 0}, bump=0.05)
    M['engrave'] = metal('engrave', (0.98, 0.78, 0.42), 0.42)
    M['ruby'] = ruby()
    return M
