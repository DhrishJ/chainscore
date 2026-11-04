# ChainScore Design System

This document describes the design tokens and conventions that actually exist
in this codebase today (`tailwind.config.ts`, `app/globals.css`,
`lib/site/scoreTier.ts`, `lib/site/plates.ts`, `scripts/calibre/`). It is a
reference, not an aspiration; update it when the tokens change.

## Concept: the calibre

The site's one recurring image is a mechanical watch movement, the ChainScore
calibre, photographed in a studio: the hero, the escapement next to the
borrower principle, the movement taken apart beside the factor groups, the
keyless works on pricing, the plan view in the footer. It is built, not
illustrated: `scripts/calibre/geom2d.py` lays out a Lepine calibre after the
Unitas 6497 family (36.6 mm, crown at 9 o'clock from the caseback, small
seconds at 3), with a going train that meshes at true centre distances and a
Swiss lever escapement, and `scripts/calibre/build.py` turns it into a Blender
scene with real finishes.

The rest of the page stays out of its way: studio black, one typeface, plain
sentences, hairline rules, and real data. The copy is specific and dry
(`BRAND_VOICE.md`). No eyebrow labels, numbered sections, figure numbers,
rolling counters, word-by-word reveals, glass, gradients, glows, rounded cards
or emoji. Those are the signatures of generated sites (D-040).

## Color tokens

One theme. Every colour is a CSS variable (space-separated RGB channels) in
`app/globals.css`, consumed by Tailwind as `rgb(var(--cs-x) / <alpha-value>)`.
`:root` and `.dark` carry the same values, and `<html>` always has `dark`, so
`dark:` utilities in older components resolve consistently.

| Token | Value | Contrast on `background` | Role |
| --- | --- | --- | --- |
| `background` | `#0B0B0C` | | Page; also the renders' background |
| `card` | `#131314` | | One step up |
| `border` | `#2E2E2F` | | Opaque hairline (prefer `border-text/15` for rules) |
| `text` | `#ECEAE5` | 16.4:1 | Text |
| `muted` | `#9A9790` | 6.7:1 | Secondary text |
| `accent` | `#ECEAE5` | 16.4:1 | Monochrome: the photographs carry colour |
| `danger` | `#E95C68` | 5.8:1 | Ruby: liquidations, the weakest slice |
| `success` | `#7EC89C` | 10.0:1 | Score tiers |
| `warning` | `#E2B460` | 10.2:1 | Score tiers |
| `ink*` | `#111112` and the above | | Code panels |

## Type

- **Schibsted Grotesk** (`--font-sans`) sets everything: display, UI, body,
  table figures. It has real tabular numerals (`tnum`); use them in columns of
  plain digits, not on large figures with thousands separators, where the
  tabular comma opens a gap.
- **Fragment Mono** (`--font-mono`) is for code and wallet addresses only.
- Classes in `app/globals.css`: `.t-display` (500, -0.042em, 0.93),
  `.t-headline` (500, -0.03em), `.t-body` (17px / 1.58), `.t-label` (13px small
  print, sentence case), `.t-code`. `.t-serif` and `.t-engraved` remain as
  aliases for older pages and render in the house face.

## Layout

- `.frame`: max width 1680px, fluid gutter `--gutter` (20 to 44px).
- 12-column grids, text in 4 to 6 columns, photographs allowed to bleed off
  the frame and the viewport.
- Sections are separated by space and a `border-text/10` or `/15` hairline.

## Controls

- Square throughout. Radii are pinned to 0 in `tailwind.config.ts` (including
  `rounded-xl` to `rounded-3xl`); `rounded-full` stays for true circles.
- `.btn-ink`: solid light on black, the primary action. `.btn-line`: hairline.
- `.field`: a ruled input; the wallet field is mono.
- Links are underlined at rest (`.link-u`), brighter on hover.

## Photographs (the plates)

- Rendered in Cycles from `scripts/calibre/render.py` (shots `hero`, `top`,
  `macro`, `explode`), composited on `#0B0B0C` and encoded by
  `scripts/calibre/export.py` as AVIF plus WebP at fixed widths, with a 24px
  blurred placeholder. `lib/site/plates.ts` is generated from that output and
  lists every plate's sizes and alt text.
- `components/site/Plate.tsx` renders a plate as `<picture>`; only the hero is
  `priority`.
- The explode sequence (`public/calibre/explode/{d,m}/NNN.webp`, 1200px and
  640px) is drawn by `components/home/CalibreSequence.tsx`.

## Motion

Three things move, all transform-only or canvas, all off under
`prefers-reduced-motion`:

1. The hero plate settles once on load (`.cs-settle`, scale 1.045 to 1).
2. Plates drift against the scroll (`components/site/Drift.tsx`): one
   transform per frame while on screen.
3. The explode sequence follows the scroll. Frames load coarse to fine when
   the section is near; the canvas redraws only when the frame changes.

Text never animates. There is no smooth-scroll library and no render loop.

## Risk-tier color semantics

`lib/site/scoreTier.ts` is the canonical mapping, pinned to
`ml/model_meta.json` grade cutoffs by `tests/unit/scoreTier.test.ts`:

| Grade | Tier | Token |
| --- | --- | --- |
| `A` | excellent | `accent` |
| `B` | good | `success` |
| `C`, `D` | fair | `warning` |
| `F` | poor | `danger` |

The result-page `ScoreGauge` prints its grade bands from the same cutoffs with
the same tier colours.

## Usage rules

- Use tokens (`bg-card`, `text-muted`, `border-text/15`), never raw hex in
  components. (Exceptions: the canvas fill in `CalibreSequence`, which must
  match the renders' background exactly.)
- If something needs to stand out, use weight, size, or a photograph, not a
  new hue. Ruby is reserved for liquidation and risk.
- Reuse `stylesForGrade` / `tierForScore` from `lib/site/scoreTier.ts` for any
  grade UI rather than re-deriving the mapping.
- Numbers on public pages come from `lib/site/publicFacts.ts` (Facts
  Registry) or are computed in `lib/site/modelFacts.ts`; both are pinned by
  tests.
- House style: "onchain" is one word; no em dashes.
