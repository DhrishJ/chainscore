export interface Factor {
  name: string
  rawScore: number       // 0–100
  weight: number         // e.g. 0.20
  weightedScore: number
  explanation: string
  limitedData: boolean
}

export interface ScoreResult {
  address: string
  ens: string | null
  score: number          // 300–850
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  percentile: number
  factors: Factor[]
  walletAge: number      // days
  totalTxns: number
  protocolsUsed: string[]
  timestamp: number
  newWallet: boolean
  // Additive model-transparency fields (Phase 7). The calibrated probability of
  // default the score is derived from, and the model version that produced it.
  // Optional so the contract stays backward compatible.
  calibratedPD?: number
  modelVersion?: string
  // True when the wallet has no detected borrowing history on the lending
  // protocols ChainScore tracks. ChainScore only scores borrowers, so these
  // wallets get an honest "no credit history" state instead of a number.
  noBorrowHistory?: boolean
}

export interface RawWalletData {
  firstTxTimestamp: number | null
  txCount: number
  txCount30d: number
  txCount90d: number
  txCount180d: number
  activeDaysCount: number
  activeMonthsLast12: number
  daysSinceFirstDefi: number
  totalPortfolioUSD: number
  stablecoinPct: number
  tokenDiversity: number
  hasETH: boolean
  hasENS: boolean
  isGnosisSafe: boolean
  hasAave: boolean
  hasCompound: boolean
  aaveBorrows: number
  aaveRepays: number
  aaveLiquidations: number
  compoundBorrows: number
  compoundRepays: number
  compoundLiquidations: number
  hasUniswapLP: boolean
  hasStakedETH: boolean
  hasGovernanceVote: boolean
  protocolsUsed: string[]
  ens: string | null
  errors: Record<string, string>
}
