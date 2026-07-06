// Seed the Facts Registry (G3) from the Phase 0 claims audit.
//
//   node --env-file=.env.local --import tsx scripts/seedFacts.ts
//
// verified: true only where the value traces to real, on-disk data
// (reports/backtest/latest.json, model/FINAL_STATUS.md, model/STATUS_AUDIT.md,
// lib/data/coverage.generated.json, ml/model_meta.json). Everything the site
// currently claims that could NOT be traced is seeded verified: false and
// listed in FACTS_TODO.md for human reconciliation. Upserts by key, so the
// script is idempotent; a human flipping verified in the DB is not overwritten
// on re-run (we only upsert non-verification fields on update).

import { prisma } from '@/lib/db'

const UPDATED_BY = 'phase0-audit'

interface SeedFact {
  key: string
  value: string
  numericValue: number | null
  unit: string | null
  definition: string
  source: string
  asOf: string // ISO date
  verified: boolean
}

const FACTS: SeedFact[] = [
  // ---- Verified: traced to on-disk data ----
  {
    key: 'score_range',
    value: '300 to 850',
    numericValue: null,
    unit: 'score',
    definition: 'The full range of the ChainScore credit score.',
    source: 'ml/model_meta.json score_band',
    asOf: '2026-06-20',
    verified: true,
  },
  {
    key: 'score_min',
    value: '300',
    numericValue: 300,
    unit: 'score',
    definition: 'Minimum possible ChainScore.',
    source: 'ml/model_meta.json score_band',
    asOf: '2026-06-20',
    verified: true,
  },
  {
    key: 'score_max',
    value: '850',
    numericValue: 850,
    unit: 'score',
    definition: 'Maximum possible ChainScore.',
    source: 'ml/model_meta.json score_band',
    asOf: '2026-06-20',
    verified: true,
  },
  {
    key: 'model_version',
    value: 'v5-xgb-cal',
    numericValue: null,
    unit: null,
    definition: 'The shipped model: calibrated XGBoost, Platt-calibrated, base-rate weighted.',
    source: 'ml/model_meta.json model_version; reports/backtest/latest.json modelVersion',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'backtest_wallets',
    value: '7,720',
    numericValue: 7720,
    unit: 'wallets',
    definition:
      'Rows in the point-in-time liquidation backtest (holdout wallets scored with zero lookahead).',
    source: 'reports/backtest/latest.json nRows',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'backtest_positives',
    value: '1,933',
    numericValue: 1933,
    unit: 'wallets',
    definition: 'Backtest holdout wallets that were actually liquidated in the label window.',
    source: 'reports/backtest/latest.json positives',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'backtest_roc_auc',
    value: '0.849',
    numericValue: 0.8489,
    unit: 'auc',
    definition: 'ROC-AUC on the point-in-time backtest, base-rate weighted to 9.09% prevalence.',
    source: 'reports/backtest/latest.json metrics.rocAuc (0.8488894...)',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'backtest_pr_auc',
    value: '0.599',
    numericValue: 0.5993,
    unit: 'auc',
    definition: 'PR-AUC on the point-in-time backtest, base-rate weighted to 9.09% prevalence.',
    source: 'reports/backtest/latest.json metrics.prAuc (0.5993138...)',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'backtest_recall_operating',
    value: '88%',
    numericValue: 0.8815,
    unit: 'ratio',
    definition:
      'Share of later-liquidated wallets flagged at the published operating threshold (score 578).',
    source: 'reports/backtest/latest.json operatingPoint.recall (0.88153...)',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'backtest_fpr_operating',
    value: '48%',
    numericValue: 0.4849,
    unit: 'ratio',
    definition:
      'False positive rate at the published operating threshold. Stated openly on the retrospective; part of the honesty posture.',
    source: 'reports/backtest/latest.json operatingPoint.falsePositiveRate (0.48487...)',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'backtest_precision_operating',
    value: '15.4%',
    numericValue: 0.1538,
    unit: 'ratio',
    definition: 'Precision at the published operating threshold.',
    source: 'reports/backtest/latest.json operatingPoint.precision (0.15382...)',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'base_rate_target',
    value: '9.09%',
    numericValue: 0.0909,
    unit: 'ratio',
    definition:
      'True population liquidation prevalence the metrics are weighted to (11,111 of 122,221).',
    source: 'model/FINAL_STATUS.md; reports/backtest/latest.json targetBaseRate',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'training_wallets',
    value: '40,000',
    numericValue: 40000,
    unit: 'wallets',
    definition:
      'Wallets in the balanced training set with full multi-chain wallet histories fetched, features computed, and used to train v5-xgb-cal (all 11,111 positives + 28,889 chain-stratified negatives).',
    source: 'model/FINAL_STATUS.md "Dataset actually used (balanced mode, FULL 40,000)"',
    asOf: '2026-06-20',
    verified: true,
  },
  {
    key: 'labeled_population',
    value: '122,221',
    numericValue: 122221,
    unit: 'wallets',
    definition:
      'Borrower wallets with a valid liquidation label (features cutoff, label window) in the staged dataset.',
    source: 'model/PROGRESS.md; model/FINAL_STATUS.md (11,111/122,221)',
    asOf: '2026-06-19',
    verified: true,
  },
  {
    key: 'borrowers_ingested',
    value: '254,729',
    numericValue: 254729,
    unit: 'wallets',
    definition:
      'Unique borrower addresses ingested from lending-protocol subgraph data (Aave V2/V3, Compound V2 deployments). Ingested and labeled, NOT all individually scored: only the 40,000 training wallets had full histories analyzed. Any public use must say "borrower records" or "ingested", never "analyzed".',
    source: 'model/STATUS_AUDIT.md "Population: 254,729 unique borrowers"; model/PROGRESS.md',
    asOf: '2026-06-19',
    verified: true,
  },
  {
    key: 'liquidated_wallets_unique',
    value: '20,717',
    numericValue: 20717,
    unit: 'wallets',
    definition: 'Unique wallets with at least one liquidation in the ingested population.',
    source: 'model/STATUS_AUDIT.md "20,717 unique liquidated wallets"',
    asOf: '2026-06-19',
    verified: true,
  },
  {
    key: 'evm_chains_covered',
    value: '7',
    numericValue: 7,
    unit: 'chains',
    definition:
      'EVM chains with live lending-protocol borrow detection: Ethereum, Arbitrum, Optimism, Polygon, Base, Avalanche, Scroll. Transaction-history features are degraded on Scroll and Avalanche (Etherscan v2 has no txlist there); public copy must not claim flat coverage.',
    source: 'lib/data/coverage.generated.json (9 deployments across 7 chains)',
    asOf: '2026-07-05',
    verified: true,
  },
  {
    key: 'protocols_covered',
    value: 'Aave V2, Aave V3, Compound V2',
    numericValue: null,
    unit: null,
    definition: 'Lending protocols with live borrow/liquidation detection.',
    source: 'lib/data/coverage.generated.json deployment families',
    asOf: '2026-07-05',
    verified: true,
  },

  // ---- NOT verified as currently claimed: human reconciliation required ----
  {
    key: 'claim_250k_borrowers_analyzed',
    value: '250K+',
    numericValue: 250000,
    unit: 'wallets',
    definition:
      'SITE CLAIM UNDER REVIEW: "250K+ Borrowers analyzed". The number traces to borrowers_ingested (254,729) but "analyzed" overstates: only 40,000 wallets were fully analyzed (training_wallets). Human must pick the wording: "250K+ borrower records ingested" (defensible) or "40,000 wallets analyzed in training" (strictest). Until then this claim may not publish.',
    source: 'FACTS_TODO.md item 1',
    asOf: '2026-07-06',
    verified: false,
  },
  {
    key: 'claim_8_networks_covered',
    value: '8',
    numericValue: 8,
    unit: 'chains',
    definition:
      'SITE CLAIM UNDER REVIEW: "8 Networks covered" (7 EVM + Solana). Solana runs a separate scoring path that is NOT on the partner v1 API (returns 501, D-020), and Scroll/Avalanche have degraded tx-history features. Human must decide the honest phrasing (e.g., "7 EVM networks + Solana" with a coverage note). Until then this claim may not publish.',
    source: 'FACTS_TODO.md item 2; DECISIONS.md D-020',
    asOf: '2026-07-06',
    verified: false,
  },
  {
    key: 'claim_25k_liquidation_events',
    value: '25K+',
    numericValue: 25000,
    unit: 'events',
    definition:
      'SITE CLAIM UNDER REVIEW: "Liquidation records: 25K+ events". Closest verified figure is 20,717 unique liquidated WALLETS; a per-event count of 25K+ could not be traced on disk. Recommend replacing with "20K+ liquidated wallets" (backed by liquidated_wallets_unique). Until then this claim may not publish.',
    source: 'FACTS_TODO.md item 3',
    asOf: '2026-07-06',
    verified: false,
  },
]

async function main(): Promise<void> {
  for (const f of FACTS) {
    const { verified, ...rest } = f
    const data = { ...rest, asOf: new Date(f.asOf), updatedBy: UPDATED_BY }
    await prisma.factsRegistry.upsert({
      where: { key: f.key },
      // Never flip `verified` on update: a human's verification decision in
      // the DB outranks the seed.
      update: data,
      create: { ...data, verified },
    })
  }
  const total = await prisma.factsRegistry.count()
  const verifiedCount = await prisma.factsRegistry.count({ where: { verified: true } })
  console.log(`facts_registry seeded: ${total} facts, ${verifiedCount} verified`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
