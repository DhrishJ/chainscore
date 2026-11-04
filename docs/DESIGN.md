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
`lib/instrument/dial.ts`, `lib/instrument/movement.ts`): a dial gauge printed
at the model's real score band, grade cutoffs and operating cutoff, with two
sub-dials (probability of default on a log scale, data completeness), a grade
wheel in the window at six o'clock, and behind a sapphire caseback the
mechanism that drives it. Everything on it is a field of the report:

- Main scale: the score. Sub-dials: `calibratedPD` and `dataCompleteness`.
  Window: the grade, or the NO HISTORY flag (`noBorrowHistory: true`).
- Behind the dial: one wheel per factor group, all meshing with the centre
  wheel, each sized by the group's weight in the score (a wheel's tooth count
  is its weight in percent: 30, 25, 23, 22, from `lib/data/mlScorer.ts` via
  the example envelope). The bridge is engraved with the feature count.

It is used only where it shows something the text says. On the home page
(`components/home/InstrumentRail.tsx`) it stays beside the first four
sections and each `[data-stop]` element sets a reading, a view and a caption:

| Stop | Reading | View |
| --- | --- | --- |
| Hero | example wallet, 742 B | three-quarter front |
| Report heading | same; caption reads the sub-dials | front, turned the other way |
| Factor breakdown | same; wheels labelled with names and weights | the caseback |
| No history | no reading, flag in | front again (a full turn) |
| Backtest | 578 with the flagged zone lit | front, tilted |

Between stops the view turns continuously with the scroll and the gear train
turns with it; the reading changes as each stop reaches the middle of the
screen. On phones it appears once, in the hero, and turns as it passes. On a
result page it reads the wallet's own score, PD and completeness.
`components/instrument/ScoreInstrument.tsx` loads three.js after first paint
and shows the flat SVG `ScoreGauge` until then (and without WebGL).

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

Only the instrument moves, and it is always a physical motion of the object:

- Arrival: the case turns in and the needle runs its full-scale self-test
  (rest, 850, then the reading), the grade wheel rolling with it.
- Readings: the needle and sub-hands settle on damped springs, the flag drops
  in with a small bounce, the flagged zone fades in and pulses slowly.
- Life: the case floats and leans a little toward a mouse pointer,
  reflections drift across the crystal, a live needle trembles by a fraction
  of a point; behind the dial the balance swings at 3 Hz with a breathing
  hairspring, the escape wheel steps half a tooth per beat and the train turns.
- Scroll: the view follows the reader between stops on critically damped
  springs; the train and ratchet turn with the scroll.

It renders continuously only while on screen and the tab is visible. If
frames run slow it lowers its pixel ratio, then halves its frame rate. Text
never animates, and there is no smooth-scroll library. Under
`prefers-reduced-motion` there is no arrival, float, ticking or parallax; it
jumps to each stop's view and reading and draws only when they change.

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
