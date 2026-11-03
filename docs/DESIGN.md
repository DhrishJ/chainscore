# ChainScore Design System

This document describes the design tokens and conventions that actually exist
in this codebase today (`tailwind.config.ts`, `app/globals.css`,
`lib/site/scoreTier.ts`, `lib/three/`). It is a reference, not an
aspiration; update it when the tokens change.

## Concept: the instrument

ChainScore is presented as a precision instrument for credit: CS-1, a panel
gauge modeled in code (`lib/three/instrument.ts`), and a site that reads like
its spec sheet. The register is honest, functional design: laboratory
instruments, engineering drawings, Swiss editorial layout. In practice that
means warm paper and printer's ink, one ultramarine signal colour, hairline
rules instead of cards, numbered sections, figure captions, square controls,
and real data in every visual. No gradients, glows, glass cards, or emoji.

## Color tokens

Every colour is a CSS variable (space-separated RGB channels) set per theme in
`app/globals.css` and consumed by Tailwind as `rgb(var(--cs-x) /
<alpha-value>)`, so opacity modifiers like `bg-accent/10` work and each theme
tunes its own contrast. Dark mode is the `.dark` class (`darkMode: ['class']`).

| Token | Paper (light) | Graphite (dark) | Role |
| --- | --- | --- | --- |
| `background` | `#F0EEE9` | `#0C0C0B` | Page |
| `card` | `#E8E5DE` | `#161614` | Recessed surfaces |
| `border` | `#D0CDC5` | `#2E2D2A` | Opaque hairline (prefer `border-text/15` for rules) |
| `text` | `#111110` | `#ECEAE4` | Ink |
| `muted` | `#5C5A54` | `#9E9B93` | Secondary text |
| `accent` | `#1A3CFF` | `#6B85FF` | The signal: needle, links, active states, grade A |
| `accent-fg` | `#FFFFFF` | `#0C0C0B` | Text on a solid `accent` fill |
| `success` | `#1B7140` | `#3FD08A` | Grade B, confirmations |
| `warning` | `#8F5A00` | `#F2B33D` | Grades C and D, degraded data |
| `danger` | `#BF2F1C` | `#FF6A4D` | Grade F, liquidations, errors |
| `ink`, `ink-fg`, `ink-muted`, `ink-accent`, `ink-line`, `ink-green`, `ink-amber` | | | The ink slab: code panels that stay dark in both themes |

Contrast (WCAG 2.1, measured): `text` on `background` 16:1 (paper);
`muted` 5.9:1 on paper, 7.0:1 on graphite; `accent` 5.8:1 on paper, 6.0:1
on graphite; `warning` 5.0:1, `danger` 5.0:1, `success` 5.2:1 on paper. On
solid fills use `accent-fg` (6.7:1 paper, 6.0:1 graphite) or
`text-background`; never `text-white` on `accent`, which fails in graphite.

Whole sections can be scoped dark by adding the `dark` class to them (the API
section and the footer do this), since every token is re-declared under
`.dark`.

## Type

Three families, all self-hosted by `next/font` (CSP `font-src 'self'`):

| Utility / class | Face | Use |
| --- | --- | --- |
| `font-sans` (also `font-grotesk`, an alias) | Archivo, variable `wdth` + `wght` | Display, UI, body |
| `font-serif` | Newsreader, variable `opsz` | The editorial voice (manifesto, ledes) |
| `font-mono` | IBM Plex Mono 400/500 | Labels, data, code, addresses |

Composite classes in `app/globals.css`:

- `.t-display`: Archivo at 78% width, weight 640, tight tracking. Headlines.
- `.t-headline`: 84% width, weight 600. Section and card heads.
- `.t-engraved`: 125% width caps, the engraved-plate voice.
- `.t-label`: Plex Mono 11px caps, tracked. Figure numbers, captions, data.
- `.t-serif`: Newsreader with optical sizing.
- `.t-body`: 17px / 1.6 body copy.

Archivo's width axis is the signature: condensed for headlines, expanded for
engraved labels, so one family does the work of two.

## Layout

- `.frame`: max 1600px with a fluid gutter (`--gutter`, 20px to 48px).
- 12-column grids with `gap-x-[var(--gutter)]`.
- Sections open with `SectionLabel` (`components/home/SectionLabel.tsx`): an
  index like `(06)`, a name, an aside, and a hairline that draws across.
- Hairline rules (`border-text/15` to `/25`, `/80` for section heads) replace
  cards. Corners are square (`--radius` is 2px for shadcn primitives).

## Controls

- `.btn` with `.btn-ink`, `.btn-signal`, or `.btn-line`: square, mono caps, a
  fill that wipes up on hover, an arrow that nudges.
- `.link-u`: hairline underline that draws in from the left.
- Inputs: one ruled field (`components/WalletInput.tsx`), accent border on
  focus. Focus rings everywhere: 2px `accent` outline, 3px offset.

## Motion

One clock (`lib/motion/engine.ts`): Lenis smooth scroll on editorial routes
(wheel only; touch stays native) and every scroll-driven visual tick from the
same `requestAnimationFrame`. House curve: `cubic-bezier(0.16, 1, 0.3, 1)`.

- Reveals (`lib/motion/reveal.ts`): `data-reveal` (rise and fade),
  `data-lines` with `.lm` line masks, `data-rule` (hairline draw),
  `data-roll` (odometer digits). Only elements below the fold are armed;
  nothing is hidden without JS.
- The hero headline enters on transform only (D-032): it is the LCP element.
- `prefers-reduced-motion`: no Lenis, no reveals, no stage animation (stills
  instead), and a global CSS net for transitions.

## 3D

`lib/three/` holds the procedural models and stages; nothing is downloaded.

- `stage.ts`: renderer (Khronos PBR Neutral tone mapping), a studio
  environment built from emissive panels and prefiltered by PMREM, key and
  rim lights, a shadow catcher, and a quality tier (`high` / `low`).
- `instrument.ts` + `textures.ts` + `gear.ts`: CS-1. The dial is printed at
  the model's score band, grade cutoffs, and the backtest's operating cutoff.
- `backtest.ts`: one block per holdout borrower, arranged by the confusion
  matrix at the operating cutoff.
- `instrumentScene.ts`, `backtestScene.ts`: scroll choreography, written in
  normalised screen space so poses frame correctly at any aspect ratio.

Stages lazy-load after hydration, render only while on screen, fall back to a
still (`public/images/cs1-instrument*.webp`) without WebGL, and are
`aria-hidden` because every number they show is also in the copy. See
DECISIONS.md D-036 and D-037.

## Risk-tier color semantics

`lib/site/scoreTier.ts` is the canonical mapping, pinned to
`ml/model_meta.json` grade cutoffs by `tests/unit/scoreTier.test.ts`:

| Grade | Tier | Token |
| --- | --- | --- |
| `A` | excellent | `accent` |
| `B` | good | `success` |
| `C`, `D` | fair | `warning` |
| `F` | poor | `danger` |

The CS-1 dial, the result-page `ScoreGauge`, and the scroll gauge all print
their grade bands from the same cutoffs with the same tier colours.

## Usage rules

- Use tokens (`bg-card`, `text-muted`, `border-text/15`, `text-accent`), never
  raw hex in components. (Exceptions: the WebGL materials and canvas-drawn
  textures in `lib/three/`, which are physical objects, not UI.)
- One accent. If something needs to stand out, use `accent`, weight, or size,
  not a new hue.
- Reuse `stylesForGrade` / `tierForScore` from `lib/site/scoreTier.ts` for any
  grade UI rather than re-deriving the mapping.
- Numbers on public pages come from `lib/site/publicFacts.ts` (Facts
  Registry) or are computed in `lib/site/modelFacts.ts`; both are pinned by
  tests.
- House style: "onchain" is one word; no em dashes.
