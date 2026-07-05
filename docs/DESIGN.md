# ChainScore Design System

This document describes the design tokens and conventions that actually exist
in this codebase today (`tailwind.config.ts`, `app/globals.css`,
`components/ScoreBadge.tsx`). It is a reference, not an aspiration, update it
when the tokens change.

## Color tokens

Defined in `tailwind.config.ts` under `theme.extend.colors`:

| Token | Value | Mechanism |
| --- | --- | --- |
| `background` | `rgb(var(--cs-bg) / <alpha-value>)` | CSS variable, light/dark |
| `card` | `rgb(var(--cs-card) / <alpha-value>)` | CSS variable, light/dark |
| `border` | `rgb(var(--cs-border) / <alpha-value>)` | CSS variable, light/dark |
| `accent` | `#0052FF` | Static hex, same in both themes |
| `success` | `#00C879` | Static hex, same in both themes |
| `warning` | `#FFB800` | Static hex, same in both themes |
| `danger` | `#FF3B5C` | Static hex, same in both themes |
| `text` | `rgb(var(--cs-text) / <alpha-value>)` | CSS variable, light/dark |
| `muted` | `rgb(var(--cs-muted) / <alpha-value>)` | CSS variable, light/dark |

`accent`, `success`, `warning`, and `danger` are fixed hex values so brand and
risk colors read the same regardless of theme. `background`, `card`,
`border`, `text`, and `muted` are backed by CSS custom properties (space
separated RGB channels, consumed via Tailwind's `rgb(var(--x) / <alpha-value>)`
pattern so `bg-card/60` style opacity modifiers work).

The CSS variables are set in `app/globals.css`:

```css
:root {
  --cs-bg: 255 255 255;       /* #FFFFFF */
  --cs-card: 248 250 252;     /* #F8FAFC */
  --cs-border: 226 232 240;   /* #E2E8F0 */
  --cs-text: 15 23 42;        /* #0F172A */
  --cs-muted: 71 85 105;      /* #475569 */
}

.dark {
  --cs-bg: 10 10 15;          /* #0A0A0F */
  --cs-card: 13 17 23;        /* #0D1117 */
  --cs-border: 28 35 51;      /* #1C2333 */
  --cs-text: 236 240 247;     /* #ECF0F7 */
  --cs-muted: 148 163 184;    /* #94A3B8 */
}
```

Dark mode is toggled by adding/removing the `.dark` class on a parent
element (`darkMode: ['class']` in `tailwind.config.ts`), not by
`prefers-color-scheme`. `:root` is the light-mode default; `.dark` overrides
it.

Separately, `app/globals.css` also defines a full set of shadcn/ui
compatibility variables (`--background`, `--foreground`, `--primary`,
`--secondary`, `--muted`, `--accent`, `--destructive`, `--popover`,
`--border`, `--input`, `--ring`, `--chart-1..5`, `--radius`) as HSL triples,
consumed by the `foreground`, `popover`, `primary`, `secondary`,
`destructive`, `input`, `ring`, and `chart` Tailwind color entries. These
exist for compatibility with unmodified shadcn/ui component internals and
are a separate token namespace from the `cs-*` ChainScore tokens above.
Product UI should use the ChainScore tokens (`background`, `card`, `border`,
`accent`, `success`, `warning`, `danger`, `text`, `muted`); the shadcn tokens
back `components/ui/*` primitives only.

## Fonts

Declared in `tailwind.config.ts` under `theme.extend.fontFamily`, all sourced
from `next/font` CSS variables (set up wherever the fonts are loaded, e.g.
the root layout):

| Utility | Variable | Fallback |
| --- | --- | --- |
| `font-grotesk` | `var(--font-space-grotesk)` | `sans-serif` |
| `font-sans` | `var(--font-inter)` | `sans-serif` |
| `font-mono` | `var(--font-jetbrains-mono)` | `ui-monospace, monospace` |

`font-grotesk` (Space Grotesk) is used for headings/wordmark/emphasis (see
the `ChainScore` logo lockup in `components/Navbar.tsx`), `font-sans` (Inter)
is the default body typeface, and `font-mono` (JetBrains Mono) is used for
addresses, numeric/tabular data, and code-like values.

## Border radius

Declared in `tailwind.config.ts` under `theme.extend.borderRadius`, derived
from the single `--radius` CSS variable (`0.5rem`, set in the shadcn
`:root` block in `app/globals.css`):

| Utility | Value |
| --- | --- |
| `rounded-lg` | `var(--radius)` (0.5rem) |
| `rounded-md` | `calc(var(--radius) - 2px)` |
| `rounded-sm` | `calc(var(--radius) - 4px)` |

There is a single radius scale (no separate `xl`/`2xl` custom tokens);
larger radii in the app use Tailwind's built-in scale (e.g. `rounded-full`
for pills/badges) directly.

## Risk-tier color semantics

Grades map to colors consistently across the app (`components/ScoreBadge.tsx`
is the canonical implementation, mirrored by `lib/format.ts`'s
`gradeColorClass`):

| Grade | Meaning | Color token | Text class |
| --- | --- | --- | --- |
| `A` | Best | accent | `text-accent` |
| `B` | Good | accent | `text-accent` |
| `C` | Fair | warning | `text-warning` |
| `D` | Weak | warning | `text-warning` |
| `F` | Poor | danger | `text-danger` |

The same tier grouping (A/B, C/D, F) also appears as score-threshold based
color logic in `app/score/[address]/page.tsx` and
`components/RecentScoresTicker.tsx` (score `>= 750` -> accent, `>= 550` ->
warning, else danger), and border/background pairings
(`border-*/30 bg-*/10`) follow the same three-way split throughout
(`components/WalletConnectButton.tsx`, `components/SolanaWalletButton.tsx`,
`app/marketplace/[id]/ListingDetailClient.tsx`, `app/dashboard/page.tsx`).

`success` (`#00C879`) exists as a distinct token from `accent` but is not
part of the grade mapping, it is reserved for explicit success/confirmation
states (e.g. "submitted", "connected"), separate from the risk-tier scale.

## Usage rules

- Use semantic tokens (`bg-card`, `text-muted`, `border-border`,
  `text-accent`, etc.), never raw hex codes or arbitrary Tailwind color
  values, in components.
- There is one accent color (`#0052FF`, blue). Do not introduce a second
  "brand" color, if something needs to stand out, use `accent` plus opacity
  or weight, not a new hue.
- Risk/grade UI must use the tier colors consistently: A/B -> `accent`,
  C/D -> `warning`, F -> `danger`. Do not invent a fourth tier color or swap
  the grouping in a new component, reuse `gradeColorClass` from
  `lib/format.ts` (or the equivalent logic in `ScoreBadge.tsx`) instead of
  re-deriving the mapping.
- `success` is for explicit success/confirmation states only, it is not an
  alternate spelling of `accent` and is not part of the grade scale.
- Prefer the CSS-variable-backed tokens (`background`, `card`, `border`,
  `text`, `muted`) over the shadcn compatibility tokens
  (`foreground`, `primary`, `secondary`, etc.) in product UI, the shadcn
  tokens are for `components/ui/*` primitives.
