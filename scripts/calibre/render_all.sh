#!/bin/bash
# Render every plate, then export them into public/calibre and regenerate
# lib/site/plates.ts. Takes about 90 minutes on 4 CPU cores.
#   PY=/path/to/venv/python ./render_all.sh
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python3}
OUT=${OUT:-$PWD/out}
REPO=$(cd ../.. && pwd)
export LIGHT_SCALE=${LIGHT_SCALE:-3}
mkdir -p "$OUT/explode" "$OUT/web"
$PY render.py -- --shot hero --res 2400x1500 --samples 160 --out "$OUT/hero.png"
$PY render.py -- --shot top --res 1800x1800 --samples 96 --out "$OUT/top.png"
$PY render.py -- --shot macro --res 2400x1500 --samples 128 --out "$OUT/macro.png"
EXPLODE_N=48 $PY render.py -- --shot explode --res 1200x1200 --samples 64 --frames 0-47 --out "$OUT/explode/f_####.png"
$PY export.py still "$OUT/hero.png" "$OUT/web" calibre-hero 2400,1600,1000
$PY export.py still "$OUT/hero.png" "$OUT/web" calibre-keyless 920,640 380,140,1300,860
$PY export.py still "$OUT/top.png" "$OUT/web" calibre-plan 1400,900,600 20,150,1640,1650 1.22
$PY export.py still "$OUT/macro.png" "$OUT/web" calibre-escapement 2400,1600,1000
$PY export.py seq "$OUT/explode" "$REPO/public/calibre/explode" 1200 640
cp "$OUT"/web/*.avif "$OUT"/web/*.webp "$REPO/public/calibre/"
$PY plates_ts.py "$OUT/web" "$REPO/lib/site/plates.ts" 48
