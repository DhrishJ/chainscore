import type { ScoreResult, Factor } from '@/types'

export interface SolanaRawData {
  firstTimestamp: number | null
  txCount: number
  activeMonthsLast12: number
  solBalance: number
  tokenCount: number
  hasMSOL: boolean
  hasJitoSOL: boolean
  hasBSOL: boolean
  hasJupiter: boolean
  hasKamino: boolean
  hasSolend: boolean
  hasMarginfi: boolean
  hasMarinade: boolean
  borrowCount: number
  repayCount: number
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function walletHistoryFactor(d: SolanaRawData): Factor {
  const ageDays = d.firstTimestamp
    ? (Date.now() / 1000 - d.firstTimestamp) / 86400
    : 0
  const ageScore = clamp((ageDays / 730) * 50, 0, 50)
  const txScore = clamp((d.txCount / 500) * 30, 0, 30)
  const monthScore = clamp((d.activeMonthsLast12 / 10) * 20, 0, 20)
  const raw = Math.round(ageScore + txScore + monthScore)
  return {
    name: 'Wallet History',
    rawScore: raw,
    weight: 0.30,
    weightedScore: raw * 0.30,
    explanation: `${Math.round(ageDays)}-day old wallet with ${d.txCount} transactions and ${d.activeMonthsLast12} active months in the past year.`,
    limitedData: d.txCount < 5,
  }
}

function portfolioFactor(d: SolanaRawData): Factor {
  const solScore = clamp((d.solBalance / 10) * 40, 0, 40)
  const tokenScore = clamp((d.tokenCount / 10) * 20, 0, 20)
  const stakingScore =
    (d.hasMSOL ? 15 : 0) + (d.hasJitoSOL ? 15 : 0) + (d.hasBSOL ? 10 : 0)
  const raw = Math.round(solScore + tokenScore + clamp(stakingScore, 0, 40))
  return {
    name: 'Portfolio & Staking',
    rawScore: clamp(raw, 0, 100),
    weight: 0.25,
    weightedScore: clamp(raw, 0, 100) * 0.25,
    explanation: `${d.solBalance.toFixed(2)} SOL balance, ${d.tokenCount} token${d.tokenCount !== 1 ? 's' : ''} held${d.hasMSOL || d.hasJitoSOL || d.hasBSOL ? ', liquid staking detected' : ''}.`,
    limitedData: d.solBalance < 0.1,
  }
}

function defiActivityFactor(d: SolanaRawData): Factor {
  let score = 0
  if (d.hasJupiter) score += 20
  if (d.hasKamino) score += 25
  if (d.hasSolend) score += 20
  if (d.hasMarginfi) score += 20
  if (d.hasMarinade) score += 15
  if (d.borrowCount > 0) {
    const ratio = Math.min(1, d.repayCount / d.borrowCount)
    score += Math.round(ratio * 20)
  }
  const raw = clamp(score, 0, 100)
  const protocols = [
    d.hasJupiter && 'Jupiter',
    d.hasKamino && 'Kamino',
    d.hasSolend && 'Solend',
    d.hasMarginfi && 'Marginfi',
    d.hasMarinade && 'Marinade',
  ].filter(Boolean) as string[]

  return {
    name: 'DeFi Activity',
    rawScore: raw,
    weight: 0.25,
    weightedScore: raw * 0.25,
    explanation: protocols.length > 0
      ? `Used ${protocols.join(', ')} on Solana.`
      : 'No DeFi protocol activity detected yet.',
    limitedData: protocols.length === 0,
  }
}

function diversityFactor(d: SolanaRawData): Factor {
  const count = [
    d.hasJupiter, d.hasKamino, d.hasSolend, d.hasMarginfi,
    d.hasMarinade, d.hasMSOL, d.hasJitoSOL,
  ].filter(Boolean).length
  const raw = clamp(count * 15, 0, 100)
  return {
    name: 'Protocol Diversity',
    rawScore: raw,
    weight: 0.20,
    weightedScore: raw * 0.20,
    explanation: `Interacted with ${count} distinct Solana protocol${count !== 1 ? 's' : ''}.`,
    limitedData: false,
  }
}

export function computeSolanaScore(data: SolanaRawData): ScoreResult {
  if (!data.firstTimestamp || data.txCount === 0) {
    return {
      address: '',
      ens: null,
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

  // Borrower-only gate: ChainScore scores wallets with onchain borrowing
  // history. A Solana wallet with no detected borrow events on the lending
  // protocols we track (Kamino, Solend, Marginfi) gets the honest
  // "no credit history" state instead of a number.
  if (data.borrowCount === 0) {
    const walletAge = Math.floor((Date.now() / 1000 - data.firstTimestamp) / 86400)
    return {
      address: '',
      ens: null,
      score: 0,
      grade: 'F',
      percentile: 0,
      factors: [],
      walletAge,
      totalTxns: data.txCount,
      protocolsUsed: [],
      timestamp: Date.now(),
      newWallet: false,
      noBorrowHistory: true,
    }
  }

  const factors = [
    walletHistoryFactor(data),
    portfolioFactor(data),
    defiActivityFactor(data),
    diversityFactor(data),
  ]

  const weightedSum = factors.reduce((s, f) => s + f.weightedScore, 0)
  const score = Math.round(300 + (weightedSum / 100) * 550)

  let grade: 'A' | 'B' | 'C' | 'D' | 'F'
  if (score >= 750) grade = 'A'
  else if (score >= 670) grade = 'B'
  else if (score >= 580) grade = 'C'
  else if (score >= 500) grade = 'D'
  else grade = 'F'

  let percentile = 1
  if (score >= 750) percentile = 90
  else if (score >= 670) percentile = 75
  else if (score >= 580) percentile = 55
  else if (score >= 500) percentile = 35
  else percentile = 15

  const walletAge = Math.floor((Date.now() / 1000 - data.firstTimestamp) / 86400)

  const protocolsUsed = [
    data.hasJupiter && 'Jupiter',
    data.hasKamino && 'Kamino',
    data.hasSolend && 'Solend',
    data.hasMarginfi && 'Marginfi',
    data.hasMarinade && 'Marinade',
    data.hasMSOL && 'Marinade (mSOL)',
    data.hasJitoSOL && 'Jito (jitoSOL)',
    data.hasBSOL && 'Blaze (bSOL)',
  ].filter(Boolean) as string[]

  return {
    address: '',
    ens: null,
    score,
    grade,
    percentile,
    factors,
    walletAge,
    totalTxns: data.txCount,
    protocolsUsed: [...new Set(protocolsUsed)],
    timestamp: Date.now(),
    newWallet: false,
  }
}
