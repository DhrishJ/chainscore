// The canonical public facts the site renders (G3). Every value here is
// either backed by a verified facts_registry entry (registryKey names it) or
// is structural data mirrored from a generated source and enforced by
// tests/unit/publicFacts.test.ts, so landing copy can never drift from the
// model or the coverage registry again. If a number needs to change, it
// changes here and in the registry, nowhere else.

export interface PublicStat {
  value: string
  label: string
  registryKey: string | null
  href?: string
}

// Hero stat strip. Wordings follow the Gate 0 reconciliation decisions:
// "ingested" not "analyzed" for the 250K figure; networks stated as
// 7 EVM + Solana; the 25K events claim is retired for 20K+ liquidated
// wallets (rendered in the methodology strip below).
export const HERO_STATS: PublicStat[] = [
  { value: '40,000', label: 'Wallets analyzed in training', registryKey: 'training_wallets' },
  { value: '88%', label: 'Of liquidations flagged in backtest', registryKey: 'backtest_recall_operating', href: '/retrospective' },
  { value: '7 + Solana', label: 'EVM networks, plus Solana', registryKey: 'evm_chains_covered', href: '#coverage' },
  { value: '300 to 850', label: 'Score range', registryKey: 'score_range' },
]

export const METHODOLOGY: PublicStat[] = [
  { value: '250K+', label: 'Borrower records ingested', registryKey: 'claim_250k_borrowers_analyzed' },
  { value: '20K+', label: 'Liquidated wallets in the data', registryKey: 'liquidated_wallets_unique' },
  { value: 'Aave V2, V3 + Compound V2', label: 'Protocols covered', registryKey: 'protocols_covered' },
  { value: 'Public data only', label: 'No KYC, nothing offchain', registryKey: null },
]

// The model's real factor groups. Enforced against ml/model_meta.json by
// test; the descriptions are editorial, the names are not.
export interface FactorGroup {
  name: string
  description: string
}

export const FACTOR_GROUPS: FactorGroup[] = [
  {
    name: 'Lending History',
    description:
      'Borrows, repayments, and prior liquidations across Aave and Compound. Repayment ratio and liquidation history carry the most weight, exactly as offchain.',
  },
  {
    name: 'Wallet History',
    description:
      'Wallet age, activity depth, and consistency over time. Established borrowers with a long record earn more trust than fresh addresses.',
  },
  {
    name: 'DeFi Activity',
    description:
      'Breadth of protocol usage: LP positions, staking, governance. Signals of a real participant rather than a throwaway wallet.',
  },
  {
    name: 'Portfolio & Identity',
    description:
      'Holdings, stablecoin mix, token diversity, and identity markers like ENS. How the account manages risk between loans.',
  },
]

// Chain coverage, honestly stated. Enforced against
// lib/data/coverage.generated.json by test. degraded = borrow detection is
// live but transaction-history features are reduced (no txlist source), so
// scores there carry lower data completeness.
export interface ChainCoverage {
  name: string
  slug: string
  status: 'full' | 'degraded' | 'separate'
  note: string
}

export const CHAIN_COVERAGE: ChainCoverage[] = [
  { name: 'Ethereum', slug: 'ethereum', status: 'full', note: 'Full coverage: Aave V2/V3, Compound V2, complete tx history.' },
  { name: 'Arbitrum', slug: 'arbitrum', status: 'full', note: 'Full coverage: Aave V3, complete tx history.' },
  { name: 'Optimism', slug: 'optimism', status: 'full', note: 'Full coverage: Aave V3, complete tx history.' },
  { name: 'Polygon', slug: 'polygon', status: 'full', note: 'Full coverage: Aave V3, complete tx history.' },
  { name: 'Base', slug: 'base', status: 'full', note: 'Full coverage: Aave V3, complete tx history.' },
  { name: 'Avalanche', slug: 'avalanche', status: 'degraded', note: 'Borrow detection live; tx-history features reduced. Data completeness is reported on every score.' },
  { name: 'Scroll', slug: 'scroll', status: 'degraded', note: 'Borrow detection live; tx-history features reduced. Data completeness is reported on every score.' },
  { name: 'Solana', slug: 'solana', status: 'separate', note: 'Separate scoring path on the site. Not yet available on the partner API.' },
]
