# Label definition (Workstream C)

The positive class, exactly as constructed by `model/src/build_labels.py`
(criteria version: `liq-window-v1`). This document is the reference for every
metric ChainScore reports; if the definition changes, the criteria version
must change with it.

## Positive class (label = 1)

A (wallet, chain) pair where the wallet:

1. Borrowed on a covered lending deployment (Aave V2/V3, Compound V2, per
   `model/config.yaml`) BEFORE the observation cutoff, and
2. Was liquidated (appeared as the liquidatee in a liquidation event) on that
   chain INSIDE the outcome window `[observation_cutoff, outcome_end]`.

## Negative class (label = 0)

A (wallet, chain) pair where the wallet borrowed before the observation
cutoff and was NOT liquidated inside the outcome window.

## Unlabeled (excluded entirely)

Wallets that never borrowed. They have no observable credit outcome, which is
also why the live scorer returns `noBorrowHistory` for them instead of a
number.

## Current window

| Parameter | Value |
|---|---|
| observation_cutoff | 2024-06-01 (features may only use data strictly before this) |
| outcome_end | 2024-12-01 (6 month forward window) |
| Labeled population | 122,221 (wallet, chain) pairs, 11,111 positives, base rate 9.09 percent |
| Unit of analysis | per (wallet, chain); a wallet active on two chains is two rows |

## Point-in-time discipline

- Every feature is computed from onchain data with block timestamp strictly
  before `observation_cutoff`. The outcome window opens exactly at the
  cutoff, so features and outcomes never overlap.
- `_split_ts` (when the wallet first entered the credit system) orders the
  temporal train/holdout split; it is a recency anchor, not the feature
  as-of.
- The backtest engine (`lib/backtest/engine.ts`) refuses any row whose
  features were observed after its as-of or whose outcome window opens
  before it (`LookaheadError`); `tests/unit/backtest.test.ts` proves both
  refusals.

## Known limitations (be honest about these)

1. Liquidation is a proxy for default, not identical to it. A wallet can be
   liquidated by a price wick while remaining a good actor, and a wallet can
   default in ways that never trigger an onchain liquidation.
2. Liquidation inside a FIXED window is partly luck: market conditions in
   the window dominate individual behavior for thin histories. This is the
   main reason PR-AUC is the weak metric and why the operating point carries
   a 48 percent false positive rate at 88 percent recall.
3. Labels currently come from the covered deployments only; a wallet
   liquidated on an uncovered protocol counts as a negative.
4. The backtest holdout (7,720 rows) is slightly larger than the training
   pipeline's evaluation slice (7,364) because the pipeline applies an
   additional usable-anchor filter during its split; the export keeps every
   holdout-window row with a chain assignment. Metrics agree to three
   decimals regardless (see reports/backtest/).
