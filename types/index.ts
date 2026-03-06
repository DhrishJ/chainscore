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
}

export interface RawWalletData {
  firstTxTimestamp: number | null
  txCount: number
  activeMonthsLast12: number
  totalPortfolioUSD: number
  stablecoinPct: number
  hasETH: boolean
  hasENS: boolean
  isGnosisSafe: boolean
  hasAave: boolean       // detected via aTokens in wallet
  hasCompound: boolean   // detected via cTokens in wallet
  aaveBorrows: number
  aaveRepays: number
  aaveLiquidations: number
  compoundBorrows: number
  compoundRepays: number
  hasUniswapLP: boolean
  hasStakedETH: boolean
  hasGovernanceVote: boolean
  protocolsUsed: string[]
  ens: string | null
  errors: Record<string, string>
}
