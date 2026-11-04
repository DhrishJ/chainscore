"""Plan-view preview + interference check for the calibre layout."""
import math, sys, itertools
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from PIL import Image, ImageDraw
from shapely.geometry import Polygon, MultiPolygon
from shapely import affinity
import geom2d as g

S = 28  # px per mm
W = int(2 * 21 * S)


def to_px(x, y):
    return (W / 2 + x * S, W / 2 - y * S)


def polys(p):
    if p.is_empty:
        return []
    if isinstance(p, Polygon):
        return [p]
    if isinstance(p, MultiPolygon):
        return list(p.geoms)
    return [q for q in getattr(p, 'geoms', []) if isinstance(q, Polygon)]


def draw(d, p, fill=None, outline=None, width=1):
    for q in polys(p):
        d.polygon([to_px(*c) for c in q.exterior.coords], fill=fill, outline=outline, width=width)
        for hole in q.interiors:
            d.polygon([to_px(*c) for c in hole.coords], fill=(14, 14, 16, 255), outline=outline, width=width)


parts = []  # (name, poly, z0, z1)


def add(name, poly, z0, z1):
    parts.append((name, poly, z0, z1))


L = g.layout_summary()
add('barrel drum', g.at(g.barrel_teeth(), g.R), 0.8, 2.2)
add('centre wheel', g.at(g.centre_wheel(), g.C), 0.25, 0.40)
add('third wheel', g.at(g.third_wheel(), g.T3), 0.95, 1.07)
add('fourth wheel', g.at(g.fourth_wheel(), g.T4), 1.40, 1.51)
add('escape wheel', g.at(g.escape_wheel(), g.E), 1.75, 1.87)
body, stones, guard, _ = g.pallet_fork_local()
a_fork = g.ang(g.P, g.B)
add('pallet fork', g.at(body, g.P, a_fork), 1.72, 1.92)
for i, s in enumerate(stones):
    add(f'pallet stone {i}', g.at(s, g.P, a_fork), 1.70, 1.95)
add('balance', g.at(g.balance_wheel(), g.B), 2.65, 3.15)
add('train bridge', L['train'], 2.3, 3.5)
add('barrel bridge', L['barrel'], 2.3, 3.5)
add('pallet bridge', L['pallet'], 2.05, 2.55)
add('balance cock', L['cock'], 3.6, 4.6)
add('ratchet wheel', g.at(g.ratchet_wheel(), g.R), 3.5, 4.05)
add('crown wheel', g.at(g.crown_wheel(), g.K), 3.5, 4.0)
cb, cs, cpiv = g.click_and_spring()
add('click', cb, 3.5, 3.85)
add('click spring', cs, 3.5, 3.8)

# pillars (feet) occupy 0..bridge underside
for k, feet in g.FEET.items():
    for f in feet:
        top = {'train': 2.3, 'barrel': 2.3, 'pallet': 2.05, 'cock': 3.6}[k]
        add(f'pillar {k}', g.circle(f, 0.9), 0.0, top)

img = Image.new('RGBA', (W, W), (14, 14, 16, 255))
d = ImageDraw.Draw(img, 'RGBA')
draw(d, L['plate'], fill=(70, 72, 78, 255))
cols = {
    'barrel drum': (180, 140, 60, 140), 'centre wheel': (210, 170, 80, 160), 'third wheel': (220, 180, 90, 170),
    'fourth wheel': (230, 190, 100, 180), 'escape wheel': (200, 205, 215, 220), 'pallet fork': (190, 195, 205, 230),
    'balance': (215, 160, 110, 200), 'train bridge': (150, 155, 165, 150), 'barrel bridge': (140, 145, 155, 150),
    'pallet bridge': (160, 165, 175, 170), 'balance cock': (170, 175, 185, 170), 'ratchet wheel': (190, 192, 200, 200),
    'crown wheel': (190, 192, 200, 200), 'click': (200, 200, 210, 220), 'click spring': (200, 200, 210, 220),
}
for name, p, z0, z1 in sorted(parts, key=lambda t: t[2]):
    if name.startswith('pillar'):
        draw(d, p, outline=(255, 80, 80, 255), width=2)
        continue
    c = cols.get(name, (230, 30, 60, 255))
    draw(d, p, fill=c, outline=(20, 20, 20, 255))

hs = g.hairspring_path(a_end=g.ang(g.B, g.FEET['cock'][0]) + 0.35)
d.line([to_px(x + g.B[0], y + g.B[1]) for x, y in hs], fill=(120, 150, 255, 255), width=1)
for k, js in g.JEWELS.items():
    for c, r in js:
        draw(d, g.circle(c, r), fill=(225, 190, 90, 255))
        draw(d, g.circle(c, 0.38), fill=(200, 20, 50, 255))
for k, feet in g.FEET.items():
    for f in feet:
        draw(d, g.circle(f, 0.75), fill=(40, 70, 170, 255))
img.save(sys.argv[1] if len(sys.argv) > 1 else 'plan.png')

# interference: same z band and overlapping footprint
bad = []
for (n1, p1, a0, a1), (n2, p2, b0, b1) in itertools.combinations(parts, 2):
    if min(a1, b1) - max(a0, b0) <= 1e-6:
        continue
    if n1.startswith('pillar') and n2.startswith('pillar'):
        continue
    inter = p1.intersection(p2).area
    if inter > 0.002:
        bad.append((round(inter, 3), n1, n2))
for b in sorted(bad, reverse=True):
    print('INTERFERENCE', b)
print('bridges area', {k: round(v.area, 1) for k, v in L.items()})
print('pallet fork angle deg', round(math.degrees(a_fork), 1))
