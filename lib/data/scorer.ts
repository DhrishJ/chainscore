import type { Factor, ScoreResult, RawWalletData } from '@/types'

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

function scoreWalletAge(walletAgeMonths: number): number {
  if (walletAgeMonths < 6) return 10
  if (walletAgeMonths < 12) return 25
  if (walletAgeMonths < 24) return 50
  if (walletAgeMonths < 36) return 70
  if (walletAgeMonths < 48) return 85
  return 100
}

function scoreTxVolume(txCount: number, activeMonthsLast12: number): number {
  let base: number
  if (txCount < 10) base = 10
  else if (txCount < 50) base = 30
  else if (txCount < 200) base = 55
  else if (txCount < 500) base = 75
  else if (txCount < 1000) base = 90
  else base = 100

  if (activeMonthsLast12 >= 8) base += 10
  return clamp(base)
}

function scoreDefiBreath(data: RawWalletData): number {
  let score = data.protocolsUsed.length === 0 ? 0
    : data.protocolsUsed.length === 1 ? 20
    : data.protocolsUsed.length === 2 ? 40
    : data.protocolsUsed.length === 3 ? 60
    : data.protocolsUsed.length === 4 ? 80
    : 100

  if (data.hasUniswapLP) score += 10
  if (data.hasStakedETH) score += 10
  if (data.hasGovernanceVote) score += 10
  return clamp(score)
}

function scoreRepayment(
  borrows: number,
  repays: number,
  liquidations: number,
  hasError: boolean
): number {
  if (hasError) return 50

  if (borrows === 0) {
    let base = 60
    if (liquidations === 0) base = clamp(base + 15)
    return base
  }

  const repayRate = repays / borrows
  let base: number
  if (repayRate <= 0) base = 0
  else if (repayRate < 0.5) base = Math.round((repayRate / 0.5) * 40)
  else if (repayRate < 0.75) base = Math.round(40 + ((repayRate - 0.5) / 0.25) * 25)
  else if (repayRate < 0.9) base = Math.round(65 + ((repayRate - 0.75) / 0.15) * 17)
  else if (repayRate < 1.0) base = Math.round(82 + ((repayRate - 0.9) / 0.1) * 18)
  else base = 100

  if (liquidations === 0) base = clamp(base + 15)
  if (liquidations >= 1) base = clamp(base - 20, 0)

  return clamp(base)
}

function scorePortfolioStability(data: RawWalletData, walletAgeDays: number): number {
  let score = 0
  if (data.totalPortfolioUSD > 1000) score += 20
  if (data.stablecoinPct > 10) score += 15
  if (data.hasETH && walletAgeDays > 365) score += 20
  if (data.hasENS) score += 15
  if (data.isGnosisSafe) score += 30
  return clamp(score)
}

function scoreToPercentile(score: number): number {
  // Rough percentile mapping based on normal distribution around 580
  const table: [number, number][] = [
    [300, 1],
    [350, 3],
    [400, 8],
    [450, 15],
    [500, 25],
    [550, 38],
    [580, 50],
    [600, 57],
    [650, 68],
    [700, 79],
    [750, 88],
    [800, 94],
    [850, 99],
  ]

  for (let i = 1; i < table.length; i++) {
    const [s0, p0] = table[i - 1]
    const [s1, p1] = table[i]
    if (score <= s1) {
      const t = (score - s0) / (s1 - s0)
      return Math.round(p0 + t * (p1 - p0))
    }
  }
  return 99
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 750) return 'A'
  if (score >= 650) return 'B'
  if (score >= 550) return 'C'
  if (score >= 450) return 'D'
  return 'F'
}

export function computeScore(data: RawWalletData): ScoreResult {
  // New wallet — no on-chain history
  if (data.txCount === 0 && data.firstTxTimestamp === null) {
    return {
      address: '',
      ens: data.ens,
      score: 300,
      grade: 'F',
      percentile: 1,
      factors: [],
      walletAge: 0,
      totalTxns: 0,
      protocolsUsed: [],
      timestamp: Date.now(),
      newWallet: true,
    }
  }

  const now = Date.now() / 1000
  const walletAgeDays = data.firstTxTimestamp
    ? Math.floor((now - data.firstTxTimestamp) / 86400)
    : 0
  const walletAgeMonths = Math.floor(walletAgeDays / 30)

  const hasRepayError = Boolean(data.errors?.aave || data.errors?.compound)

  const f1Raw = scoreWalletAge(walletAgeMonths)
  const f2Raw = scoreTxVolume(data.txCount, data.activeMonthsLast12)
  const f3Raw = scoreDefiBreath(data)
  const f4Raw = scoreRepayment(
    data.aaveBorrows + data.compoundBorrows,
    data.aaveRepays + data.compoundRepays,
    data.aaveLiquidations,
    hasRepayError
  )
  const f5Raw = scorePortfolioStability(data, walletAgeDays)

  const factors: Factor[] = [
    {
      name: 'Wallet Age',
      rawScore: f1Raw,
      weight: 0.20,
      weightedScore: f1Raw * 0.20,
      explanation:
        walletAgeMonths < 6
          ? 'Your wallet is less than 6 months old. A longer on-chain history signals reliability.'
          : walletAgeMonths < 24
          ? `Your wallet is ${walletAgeMonths} months old. Wallets over 2 years score significantly higher.`
          : `Your wallet is ${walletAgeMonths} months old — a solid on-chain history.`,
      limitedData: Boolean(data.errors?.etherscan),
    },
    {
      name: 'Transaction Volume',
      rawScore: f2Raw,
      weight: 0.15,
      weightedScore: f2Raw * 0.15,
      explanation:
        data.txCount < 10
          ? `Only ${data.txCount} transactions detected. More activity demonstrates consistent usage.`
          : data.activeMonthsLast12 >= 8
          ? `${data.txCount} transactions across ${data.activeMonthsLast12} active months in the past year — excellent consistency.`
          : `${data.txCount} total transactions. Try to stay active for at least 8 months per year.`,
      limitedData: Boolean(data.errors?.etherscan),
    },
    {
      name: 'DeFi Protocol Breadth',
      rawScore: f3Raw,
      weight: 0.20,
      weightedScore: f3Raw * 0.20,
      explanation:
        data.protocolsUsed.length === 0
          ? 'No DeFi protocol usage detected. Using lending, DEXes, or staking improves this factor.'
          : `Used ${data.protocolsUsed.length} protocol(s): ${data.protocolsUsed.join(', ')}.${data.hasUniswapLP ? ' LP positions detected (+bonus).' : ''}${data.hasStakedETH ? ' ETH staking detected (+bonus).' : ''}`,
      limitedData: Boolean(data.errors?.uniswap),
    },
    {
      name: 'Repayment Behavior',
      rawScore: f4Raw,
      weight: 0.35,
      weightedScore: f4Raw * 0.35,
      explanation:
        hasRepayError
          ? 'Unable to fully query lending protocol history. Score set to neutral.'
          : data.aaveBorrows + data.compoundBorrows === 0
          ? 'No borrowing history found. A clean repayment record with loans would score higher.'
          : data.aaveLiquidations > 0
          ? `${data.aaveLiquidations} liquidation(s) detected — this significantly reduces your score.`
          : `Repaid ${data.aaveRepays + data.compoundRepays} of ${data.aaveBorrows + data.compoundBorrows} loan events with no liquidations.`,
      limitedData: hasRepayError,
    },
    {
      name: 'Portfolio Stability',
      rawScore: f5Raw,
      weight: 0.10,
      weightedScore: f5Raw * 0.10,
      explanation:
        [
          data.isGnosisSafe ? 'Gnosis Safe multisig detected (+30).' : '',
          data.hasENS ? 'ENS name registered (+15).' : '',
          data.hasETH && walletAgeDays > 365 ? 'Long-term ETH holder (+20).' : '',
          data.stablecoinPct > 10 ? `${Math.round(data.stablecoinPct)}% stablecoin allocation (+15).` : '',
          data.totalPortfolioUSD > 1000 ? `Portfolio value > $1,000 (+20).` : '',
        ]
          .filter(Boolean)
          .join(' ') || 'Low portfolio stability signals. Hold ETH, register ENS, or use a multisig.',
      limitedData: Boolean(data.errors?.alchemy),
    },
  ]

  const rawWeighted = factors.reduce((sum, f) => sum + f.weightedScore, 0)
  const score = Math.round(300 + (rawWeighted / 100) * 550)

  return {
    address: '',
    ens: data.ens,
    score,
    grade: scoreToGrade(score),
    percentile: scoreToPercentile(score),
    factors,
    walletAge: walletAgeDays,
    totalTxns: data.txCount,
    protocolsUsed: data.protocolsUsed,
    timestamp: Date.now(),
    newWallet: false,
  }
}
