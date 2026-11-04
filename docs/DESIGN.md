# ChainScore Design System

This document describes the design tokens and conventions that actually exist
in this codebase today (`tailwind.config.ts`, `app/globals.css`,
`lib/site/scoreTier.ts`, `lib/instrument/`). It is a reference, not an
aspiration; update it when the tokens change.

## Concept: the product, plainly

The site shows the product rather than describing it: the score check, a full
example report laid out like the real result page, the no-history answer, the
published backtest, the API request and response. Copy is specific and dry
(`BRAND_VOICE.md`). Headings are plain titles at moderate sizes, not
declarative sentences; numbers come from the Facts Registry or are computed
from the model and the backtest.

Avoid the signatures of generated sites (D-040, D-044): eyebrow labels,
numbered sections, figure numbers, rolling counters, word-by-word reveals,
giant tightly tracked headline sentences over muted paragraphs, glass,
gradients, glows, rounded cards, emoji.

## The instrument

The one 3D object is the ChainScore instrument (`lib/instrument/stage.ts`,
`lib/instrument/dial.ts`): a dial gauge printed at the model's real score band,
grade cutoffs and operating cutoff. It is used only where it shows something
the text says:

- Home, beside the hero and the example report: the example wallet's score.
- Home, beside the no-history section: no reading, the needle on its stop and
  the NO HISTORY flag in the window (what the API returns as
  `noBorrowHistory: true`).
- Home, beside the backtest: the needle on the operating cutoff with the
  flagged zone lit.
- Result page: the wallet's actual score, or the flag for a non-borrower.

`components/home/InstrumentRail.tsx` keeps it in view beside the first four
home sections on wide screens and switches its reading by the section in the
middle of the screen; on phones it appears once, in the hero.
`components/instrument/ScoreInstrument.tsx` loads three.js after first paint,
shows the flat SVG `ScoreGauge` until then (and without WebGL), and renders
only while the needle, flag, zone or view is moving.

## Color tokens

One theme. Every colour is a CSS variable (space-separated RGB channels) in
`app/globals.css`, consumed by Tailwind as `rgb(var(--cs-x) / <alpha-value>)`.
`:root` and `.dark` carry the same values, and `<html>` always has `dark`.

| Token | Value | Contrast on `background` | Role |
| --- | --- | --- | --- |
| `background` | `#0B0B0C` | | Page |
| `card` | `#131314` | | Report panels |
| `border` | `#2E2E2F` | | Opaque hairline (prefer `border-text/15` for rules) |
| `text` | `#ECEAE5` | 16.4:1 | Text |
| `muted` | `#9A9790` | 6.7:1 | Secondary text |
| `accent` | `#ECEAE5` | 16.4:1 | Monochrome interface |
| `danger` | `#E95C68` | 5.8:1 | Liquidations, the flagged zone, the weakest slice |
| `success` | `#7EC89C` | 10.0:1 | Score tiers |
| `warning` | `#E2B460` | 10.2:1 | Score tiers |
| `ink*` | `#111112` and the above | | Code panels |

## Type

- **IBM Plex Sans** (`--font-sans`) for everything people read. Numbers in
  data use `.t-figure` (tabular figures) so columns line up.
- **IBM Plex Mono** (`--font-mono`) for code, wallet addresses and API fields
  only.
- Classes in `app/globals.css`: `.t-display` (500, -0.02em), `.t-headline`
  (500, -0.012em), `.t-body` (16px / 1.62), `.t-label` (13px small print,
  sentence case), `.t-code`, `.t-figure`.

## Layout

- `.frame`: max width 1680px, fluid gutter `--gutter` (20 to 44px).
- 12-column grids. On the home page the first four sections use 7 columns,
  with the instrument in the remaining 5.
- Sections are separated by space and `border-text/10` or `/15` hairlines.

## Controls

- Square throughout. Radii are pinned to 0 in `tailwind.config.ts` (including
  `rounded-xl` to `rounded-3xl`); `rounded-full` stays for true circles.
- `.btn-ink`: solid light on black, the primary action. `.btn-line`: hairline.
- `.field`: a ruled input; the wallet field is mono.
- Links are underlined at rest (`.link-u`), brighter on hover.

## Motion

Only the instrument moves: the needle settles on a damped spring, the flag
slides, the zone fades, the view eases between sections. Nothing animates while
it is still, there is no scroll-linked rendering, no smooth-scroll library, and
text never animates. Under `prefers-reduced-motion` the instrument jumps
straight to each state.

## Risk-tier color semantics

`lib/site/scoreTier.ts` is the canonical mapping, pinned to
`ml/model_meta.json` grade cutoffs by `tests/unit/scoreTier.test.ts`:

| Grade | Tier | Token |
| --- | --- | --- |
| `A` | excellent | `accent` |
| `B` | good | `success` |
| `C`, `D` | fair | `warning` |
| `F` | poor | `danger` |

The instrument's dial and the flat `ScoreGauge` print their grade bands from
the same cutoffs with the same tier colours.

## Usage rules

- Use tokens (`bg-card`, `text-muted`, `border-text/15`), never raw hex in
  components. (Exception: `lib/instrument/`, whose materials and printed dial
  are a physical object, not UI.)
- If something needs to stand out, use weight or size, not a new hue. Ruby is
  reserved for liquidation and risk.
- Reuse `stylesForGrade` / `tierForScore` from `lib/site/scoreTier.ts` for any
  grade UI rather than re-deriving the mapping.
- Numbers on public pages come from `lib/site/publicFacts.ts` (Facts
  Registry) or are computed in `lib/site/modelFacts.ts`; both are pinned by
  tests.
- House style: "onchain" is one word; no em dashes.
