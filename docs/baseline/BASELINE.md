# Phase 0 baseline snapshot

Captured 2026-07-02 at commit `3f9349a`. Every later phase reports its numbers
against this file. Methods are stated so the comparison stays apples to apples.

## Model (deployed, commit 3e9840a, live on chainscore.dev)

Source: `model/FINAL_STATUS.md` (local, gitignored), full 40,000-wallet
balanced set, temporal holdout evaluated once, base-rate-weighted to the true
9.09 percent prevalence.

| Metric | Value |
|---|---|
| Model version | v4-xgb-cal (30 features) |
| ROC-AUC (held out) | 0.823 |
| PR-AUC (held out) | 0.517 |
| Recall at D/F operating point | 0.80 |
| False positive rate at same point | 0.33 |
| Brier / ECE | not recorded for this run; gap to close in Workstream C |
| Score band | offset 135.0, factor 134.4, PDO 93.2, median 636 |
| Grade cutoffs | A>=779, B>=690, C>=588, D>=422 |

## Model (uncommitted working-tree candidate, NOT deployed)

Source: `model/METRICS.md`, 38,243 rows, temporal holdout evaluated once.
Awaiting a gate 0 decision; still labeled v4-xgb-cal, which must be bumped
before it ever ships.

| Metric | Value |
|---|---|
| Features | 34 (adds borrow_velocity, liquidation_rate, net_unpaid_borrows, defi_tenure_ratio) |
| ROC-AUC (held out) | 0.849, bootstrap CI [0.837, 0.858] |
| PR-AUC (held out) | 0.598, bootstrap CI [0.579, 0.620] |
| Brier | 0.0654 |
| ECE | 0.0595 |
| Walk-forward PR-AUC | 0.637 +/- 0.074 across 4 folds |
| Weakest segments (PR-AUC) | arbitrum 0.362, avalanche 0.397, heavy borrowers (>3 borrows) 0.217 |

## Web performance (Lighthouse 12.x lab data)

Method: `next build && next start` locally, Playwright Chromium via
CHROME_PATH, headless=new, default throttling. Lab TBT stands in for INP
(Lighthouse cannot measure INP). Raw reports sit next to this file.
Before/after comparisons must use this same local method.

| Page | Form factor | Perf | LCP | FCP | CLS | TBT |
|---|---|---|---|---|---|---|
| / | desktop | 0.92 | 1.8 s | 0.5 s | 0.001 | 20 ms |
| / | mobile | 0.55 | 8.2 s | 1.8 s | 0.006 | 810 ms |
| /score/[address] | mobile | 0.57 | 7.1 s | 1.7 s | 0.007 | 790 ms |

Other categories (home, desktop): accessibility 0.95, best practices 0.96,
SEO 1.0. Score page mobile accessibility: 1.0.

Reading: desktop is fine; mobile is the problem. LCP 8.2 s and TBT ~800 ms on
mobile are far outside the Workstream A targets (LCP < 2.0 s, INP < 200 ms).
Main suspects for Workstream A: client bundle weight (Wagmi + RainbowKit +
Solana wallet adapters all load on every page via the root layout Providers)
and render-blocking hydration.

## Dependencies

`npm audit` at baseline: 138 findings (2 critical, 21 high, 92 moderate,
23 low) across 1,924 resolved packages, concentrated in the Solana
wallet-adapter tree. CI runs audit and osv-scanner report-only until the
Phase 6 cleanup (DECISIONS.md D-005).

## Test and CI state at end of Phase 0

- Unit: 15 tests across mlScorer, env.server, solanaAuth. All passing.
- E2E: 2 Playwright smoke tests. Passing.
- CI: typecheck, lint, unit, build with client-bundle secret check, e2e,
  dependency scan (report-only), gitleaks (gating).
- Coverage focus so far: scoring gates and determinism, env parsing,
  signature verification primitives. Provider adapters and API routes are
  untested until Workstream B introduces the DataSource seam to mock against.
