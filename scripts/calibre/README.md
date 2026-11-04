# The ChainScore calibre

The photographs on the site are renders of a mechanical watch movement built
by these scripts. Nothing here runs in the app; the output is committed to
`public/calibre/` and indexed by `lib/site/plates.ts`.

## What is modelled

A Lepine calibre after the Unitas 6497 family, seen from the caseback: 36.6 mm,
crown at 9 o'clock, small seconds (fourth wheel) at 3, barrel upper left,
balance lower right, straight-line Swiss lever escapement.

| Pair | Teeth | Module (mm) | Centre distance (mm) |
| --- | --- | --- | --- |
| Barrel into centre pinion | 84 / 12 | 0.1603 | 7.69 |
| Centre wheel into third pinion | 80 / 10 | 0.13 | 5.85 |
| Third wheel into fourth pinion | 75 / 10 | 0.11 | 4.68 |
| Fourth wheel into escape pinion | 70 / 7 | 0.10 | 3.85 |

Centre distances are the sums of the pitch radii, so every pair meshes. The
centre wheel turns once an hour; 8 x 7.5 = 60 turns of the fourth wheel, so it
carries the seconds hand; 70/7 = 10 turns of the 15-tooth escape wheel a
minute, 30 beats a turn, gives 18,000 vibrations an hour. The pallets embrace
2.5 teeth, so the pallet arbor sits at R / cos 30 deg from the escape wheel and
the escape wheel phase is solved so one tooth rests on a pallet while the other
pallet sits in a tooth space. The fork length is set by the balance's impulse
jewel radius.

`preview2d.py` draws the plan and checks every pair of parts that share a
height band for overlap, so nothing interpenetrates.

Finishes are anisotropic OSL shaders (`shaders.py`): Geneva stripes whose
micro-arcs run across each stripe, overlapping perlage spots laid row by row,
snailing on the keyless wheels, polished 45 degree chamfers (anglage) on every
bridge edge, heat-blued screws, gold chatons and synthetic rubies.

## Rendering

Needs Python 3.13 with `bpy==5.2.*`, `shapely`, `pillow` (with AVIF) and
`numpy`:

```
python3.13 -m venv .venv && .venv/bin/pip install bpy==5.2.3 shapely pillow numpy
PY=.venv/bin/python ./render_all.sh
```

Shots live in `render.py` (`hero`, `top`, `macro`, `explode`); `--res`,
`--samples`, `--cam=x,y,z`, `--target=x,y,z` and `--t` (explode amount) help
when iterating. `export.py` composites on the page black (`#0B0B0C`) and writes
AVIF plus WebP; `plates_ts.py` regenerates `lib/site/plates.ts`; `og.py` builds
the link-preview image.
