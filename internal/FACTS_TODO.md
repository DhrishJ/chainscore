# FACTS_TODO

Every public claim that could NOT be verified as currently stated, from the
Phase 0 audit (2026-07-06). Each item needs a human decision before it may
appear anywhere public. The pre-publish validator blocks all of them today
because their registry entries are `verified = false`.

Ground truth sources: `reports/backtest/latest.json`, `model/FINAL_STATUS.md`,
`model/STATUS_AUDIT.md`, `model/PROGRESS.md`, `lib/data/coverage.generated.json`,
`ml/model_meta.json`. Note the model/ directory is local-only (gitignored).

## 1. "250K+ Borrowers analyzed" (landing page hero stats, `app/page.tsx`)

- The NUMBER is real: 254,729 unique borrower addresses ingested from Aave
  V2/V3 and Compound V2 subgraph data (`borrowers_ingested`, verified).
- The VERB is not: only 40,000 wallets had full multi-chain histories fetched,
  features computed, and were used in training (`training_wallets`, verified).
- Decision needed, pick one:
  - (a) "250K+ borrower records ingested" or "built from 250K+ borrowers'
    lending data" (keeps the big number, honest verb), or
  - (b) "40,000 wallets analyzed" (strictest reading), or
  - (c) drop the stat.
- Recommendation: (a), with the definition pinned in the registry.

## 2. "8 Networks covered" (hero stats + `app/layout.tsx` meta description)

- Verified reality: 7 EVM chains with live borrow detection (Ethereum,
  Arbitrum, Optimism, Polygon, Base, Avalanche, Scroll) + a separate Solana
  scoring path.
- Two honesty problems with the flat "8": (i) Solana is NOT available on the
  partner v1 API (returns 501, D-020); (ii) Scroll and Avalanche run degraded
  transaction-history features (Etherscan v2 has no txlist there).
- Decision needed: phrasing such as "7 EVM networks + Solana" with a visible
  coverage note, or "8 networks" with an asterisk linking to a coverage table.
- Recommendation: a coverage table on the site (honesty as differentiator);
  hero says "7 EVM networks + Solana".

## 3. "Liquidation records: 25K+ events" (methodology strip, `app/page.tsx`)

- Closest verified figure: 20,717 unique liquidated WALLETS
  (`liquidated_wallets_unique`). A 25K+ per-event count exists nowhere on
  disk that I could trace.
- Decision needed: replace with "20K+ liquidated wallets" (backed today) or
  produce a real event-level count from the raw data and register it.
- Recommendation: "20K+ liquidated wallets" now; event count later if wanted.

## 4. Demo score card factors are invented (`components/ScoreGaugePreview.tsx`)

- Card shows: Repayment history 92, Wallet age 86, Transaction consistency 81,
  DeFi protocol usage 74. These labels and values match NOTHING in the model.
- The real model factor groups (`ml/model_meta.json`): Lending History,
  Wallet History, DeFi Activity, Portfolio & Identity.
- Decision needed: relabel the card to the four real groups and either mark
  values as "illustrative" or render a real example wallet.
- Recommendation: real factor groups + a real (anonymized) example wallet.

## 5. Factor set inconsistency (landing "Every factor" section, `app/page.tsx`)

- Section lists five: Repayment behavior, Liquidation history, Wallet age,
  Borrowing track record, Portfolio health. The model has four groups (above),
  and the demo card shows a third, different set (item 4).
- Decision needed: one canonical public factor taxonomy. Recommendation: the
  model's four groups, everywhere, sourced from `ml/model_meta.json` at build
  time so copy cannot drift from the model again.

## 6. Chain-list consistency (`app/page.tsx` marquee vs everything else)

- The landing marquee lists 8 chains including Solana with no caveats; the
  partner API docs and OpenAPI are EVM-only. Same fix as item 2: one canonical
  coverage source (`lib/data/coverage.generated.json` + a solana flag) that
  every surface renders from.

Once you decide each item, flip the wording into the corresponding
`facts_registry` row, set `verified = true`, and the validator starts allowing
exactly that claim. Phase 6 (website rebuild) applies the copy changes.
