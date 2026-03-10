/**
 * ChainScore — ML-based wallet scorer
 * Replaces the hand-crafted formula in scorer.ts with XGBoost inference.
 *
 * Model is loaded once at module init from ml/model.json (server-side only).
 * Falls back to the formula scorer if the model file is not found.
 */

import fs from 'fs'
import path from 'path'
import type { Factor, ScoreResult, RawWalletData } from '@/types'

// ─────────────────────────────────────────────────────────────
// XGBoost JSON types
// ─────────────────────────────────────────────────────────────

interface XGBTree {
  left_children: number[]
  right_children: number[]
  split_indices: number[]
  split_conditions: number[]
  base_weights: number[]
  default_left: number[]
}

interface XGBModel {
  learner: {
    gradient_booster: {
      model: {
        trees: XGBTree[]
      }
    }
    learner_model_param: {
      base_score: string
    }
  }
}

interface ModelMeta {
  feature_names: string[]
  calibration: {
    p10: number; score_at_p10: number
    p50: number; score_at_p50: number
    p90: number; score_at_p90: number
    score_min: number
    score_max: number
  }
}

// ─────────────────────────────────────────────────────────────
// Model loading (once at startup)
// ─────────────────────────────────────────────────────────────

let xgbModel: XGBModel | null = null
let modelMeta: ModelMeta | null = null
let modelLoaded = false

function loadModel() {
  if (modelLoaded) return
  modelLoaded = true

  try {
    const modelPath = path.join(process.cwd(), 'ml', 'model.json')
    const metaPath  = path.join(process.cwd(), 'ml', 'model_meta.json')

    if (!fs.existsSync(modelPath) || !fs.existsSync(metaPath)) {
      console.warn('[mlScorer] model.json or model_meta.json not found — falling back to formula scorer')
      return
    }

    xgbModel  = JSON.parse(fs.readFileSync(modelPath, 'utf-8')) as XGBModel
    modelMeta = JSON.parse(fs.readFileSync(metaPath,  'utf-8')) as ModelMeta
    console.log('[mlScorer] XGBoost model loaded successfully')
  } catch (e) {
    console.error('[mlScorer] Failed to load model:', e)
  }
}

// ─────────────────────────────────────────────────────────────
// XGBoost inference
// ─────────────────────────────────────────────────────────────

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

function predictTree(tree: XGBTree, features: number[]): number {
  let node = 0
  while (tree.left_children[node] !== -1) {
    const featureVal = features[tree.split_indices[node]]
    const goLeft = (featureVal === undefined || isNaN(featureVal))
      ? tree.default_left[node] === 1
      : featureVal < tree.split_conditions[node]
    node = goLeft ? tree.left_children[node] : tree.right_children[node]
  }
  return tree.base_weights[node]
}

function xgbPredict(features: number[]): number {
  if (!xgbModel) return 0.5

  const trees = xgbModel.learner.gradient_booster.model.trees
  let margin = 0
  for (const tree of trees) {
    margin += predictTree(tree, features)
  }
  return sigmoid(margin)
}

// ─────────────────────────────────────────────────────────────
// Feature vector construction
// Must match FEATURE_COLS order in train_model.py exactly
// ─────────────────────────────────────────────────────────────

function buildFeatureVector(data: RawWalletData, walletAgeDays: number): number[] {
  const totalBorrows = data.aaveBorrows + data.compoundBorrows

  const protocolsCount = [
    data.aaveBorrows > 0 || data.hasAave,
    data.compoundBorrows > 0 || data.hasCompound,
    data.hasUniswapLP,
    data.hasStakedETH,
  ].filter(Boolean).length

  // Must match FEATURE_COLS order in train_model.py exactly
  return [
    walletAgeDays,                   // wallet_age_days
    Math.floor(walletAgeDays / 30),  // wallet_age_months
    data.txCount,                    // tx_count
    data.activeMonthsLast12,         // active_months_12
    data.aaveBorrows,                // aave_borrows
    data.compoundBorrows,            // compound_borrows
    totalBorrows,                    // total_borrows
    protocolsCount,                  // protocols_used_count
    data.hasUniswapLP ? 1 : 0,      // has_uniswap_lp
    data.hasStakedETH ? 1 : 0,      // has_staked_eth
    data.hasETH ? 1 : 0,            // has_eth
    data.hasENS ? 1 : 0,            // has_ens
    data.isGnosisSafe ? 1 : 0,      // is_gnosis_safe
    data.totalPortfolioUSD,          // total_portfolio_usd
    data.stablecoinPct,              // stablecoin_pct
  ]
}

// ─────────────────────────────────────────────────────────────
// Score calibration: probability → 300–850
// Piecewise linear through 3 anchor points from training
// ─────────────────────────────────────────────────────────────

function calibrateScore(prob: number): number {
  if (!modelMeta) return Math.round(300 + prob * 550)

  const { p10, score_at_p10, p50, score_at_p50, p90, score_at_p90, score_min, score_max } = modelMeta.calibration

  let score: number
  if (prob <= p10) {
    score = score_min + (prob / p10) * (score_at_p10 - score_min)
  } else if (prob <= p50) {
    const t = (prob - p10) / (p50 - p10)
    score = score_at_p10 + t * (score_at_p50 - score_at_p10)
  } else if (prob <= p90) {
    const t = (prob - p50) / (p90 - p50)
    score = score_at_p50 + t * (score_at_p90 - score_at_p50)
  } else {
    const t = (prob - p90) / (1 - p90)
    score = score_at_p90 + t * (score_max - score_at_p90)
  }

  return Math.round(Math.min(score_max, Math.max(score_min, score)))
}

// ─────────────────────────────────────────────────────────────
// Factor explanations (for UI — separate from ML scoring)
// ─────────────────────────────────────────────────────────────

function buildFactors(data: RawWalletData, walletAgeDays: number, walletAgeMonths: number): Factor[] {
  const totalBorrows = data.aaveBorrows + data.compoundBorrows
  const totalRepays  = data.aaveRepays  + data.compoundRepays
  const totalLiquidations = data.aaveLiquidations + (data.compoundLiquidations ?? 0)
  const hasRepayError = Boolean(data.errors?.aave || data.errors?.compound)

  // Wallet age (0–100)
  const f1Raw = walletAgeMonths < 6 ? 10 : walletAgeMonths < 12 ? 25 : walletAgeMonths < 24 ? 50 : walletAgeMonths < 36 ? 70 : walletAgeMonths < 48 ? 85 : 100

  // Transaction volume (0–100)
  let f2Raw = data.txCount < 10 ? 10 : data.txCount < 50 ? 30 : data.txCount < 200 ? 55 : data.txCount < 500 ? 75 : data.txCount < 1000 ? 90 : 100
  if (data.activeMonthsLast12 >= 8) f2Raw = Math.min(100, f2Raw + 10)

  // DeFi breadth (0–100)
  const protocols = data.protocolsUsed.length
  let f3Raw = protocols === 0 ? 0 : protocols === 1 ? 20 : protocols === 2 ? 40 : protocols === 3 ? 60 : protocols === 4 ? 80 : 100
  if (data.hasUniswapLP) f3Raw = Math.min(100, f3Raw + 10)
  if (data.hasStakedETH) f3Raw = Math.min(100, f3Raw + 10)
  if (data.hasGovernanceVote) f3Raw = Math.min(100, f3Raw + 10)

  // Repayment (0–100)
  let f4Raw = 50
  if (!hasRepayError) {
    if (totalBorrows === 0) {
      f4Raw = totalLiquidations === 0 ? 75 : 60
    } else {
      const rate = totalRepays / totalBorrows
      if (rate <= 0) f4Raw = 0
      else if (rate < 0.5) f4Raw = Math.round((rate / 0.5) * 40)
      else if (rate < 0.75) f4Raw = Math.round(40 + ((rate - 0.5) / 0.25) * 25)
      else if (rate < 0.9) f4Raw = Math.round(65 + ((rate - 0.75) / 0.15) * 17)
      else if (rate < 1.0) f4Raw = Math.round(82 + ((rate - 0.9) / 0.1) * 18)
      else f4Raw = 100
      if (totalLiquidations === 0) f4Raw = Math.min(100, f4Raw + 15)
      if (totalLiquidations >= 1) f4Raw = Math.max(0, f4Raw - 20)
    }
  }

  // Portfolio stability (0–100)
  let f5Raw = 0
  if (data.totalPortfolioUSD > 1000) f5Raw += 20
  if (data.stablecoinPct > 10) f5Raw += 15
  if (data.hasETH && walletAgeDays > 365) f5Raw += 20
  if (data.hasENS) f5Raw += 15
  if (data.isGnosisSafe) f5Raw += 30
  f5Raw = Math.min(100, f5Raw)

  return [
    {
      name: 'Wallet Age',
      rawScore: f1Raw,
      weight: 0.20,
      weightedScore: f1Raw * 0.20,
      explanation: walletAgeMonths < 6
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
      explanation: data.txCount < 10
        ? `Only ${data.txCount} transactions detected. More activity demonstrates consistent usage.`
        : data.activeMonthsLast12 >= 8
        ? `${data.txCount} transactions across ${data.activeMonthsLast12} active months in the past year.`
        : `${data.txCount} total transactions. Stay active for at least 8 months per year.`,
      limitedData: Boolean(data.errors?.etherscan),
    },
    {
      name: 'DeFi Protocol Breadth',
      rawScore: f3Raw,
      weight: 0.20,
      weightedScore: f3Raw * 0.20,
      explanation: data.protocolsUsed.length === 0
        ? 'No DeFi protocol usage detected. Using lending, DEXes, or staking improves this factor.'
        : `Used ${data.protocolsUsed.length} protocol(s): ${data.protocolsUsed.join(', ')}.${data.hasUniswapLP ? ' LP positions detected (+bonus).' : ''}${data.hasStakedETH ? ' ETH staking detected (+bonus).' : ''}`,
      limitedData: Boolean(data.errors?.uniswap),
    },
    {
      name: 'Repayment Behavior',
      rawScore: f4Raw,
      weight: 0.35,
      weightedScore: f4Raw * 0.35,
      explanation: hasRepayError
        ? 'Unable to fully query lending protocol history. Score estimated from available data.'
        : totalBorrows === 0
        ? 'No borrowing history. A clean repayment record with loans would score higher.'
        : totalLiquidations > 0
        ? `${totalLiquidations} liquidation(s) detected — this significantly reduces your score.`
        : `Repaid ${totalRepays} of ${totalBorrows} loan events with no liquidations.`,
      limitedData: hasRepayError,
    },
    {
      name: 'Portfolio Stability',
      rawScore: f5Raw,
      weight: 0.10,
      weightedScore: f5Raw * 0.10,
      explanation: [
        data.isGnosisSafe ? 'Gnosis Safe multisig detected (+30).' : '',
        data.hasENS ? 'ENS name registered (+15).' : '',
        data.hasETH && walletAgeDays > 365 ? 'Long-term ETH holder (+20).' : '',
        data.stablecoinPct > 10 ? `${Math.round(data.stablecoinPct)}% stablecoin allocation (+15).` : '',
        data.totalPortfolioUSD > 1000 ? 'Portfolio value > $1,000 (+20).' : '',
      ].filter(Boolean).join(' ') || 'Low portfolio stability signals. Hold ETH, register ENS, or use a multisig.',
      limitedData: Boolean(data.errors?.alchemy),
    },
  ]
}

// ─────────────────────────────────────────────────────────────
// Grade + percentile helpers
// ─────────────────────────────────────────────────────────────

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 750) return 'A'
  if (score >= 650) return 'B'
  if (score >= 550) return 'C'
  if (score >= 450) return 'D'
  return 'F'
}

function scoreToPercentile(score: number): number {
  const table: [number, number][] = [
    [300, 1], [350, 3], [400, 8], [450, 15], [500, 25],
    [550, 38], [580, 50], [600, 57], [650, 68], [700, 79],
    [750, 88], [800, 94], [850, 99],
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

// ─────────────────────────────────────────────────────────────
// Main export — drop-in replacement for computeScore()
// ─────────────────────────────────────────────────────────────

export function computeScore(data: RawWalletData): ScoreResult {
  loadModel()

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
  const walletAgeDays   = data.firstTxTimestamp ? Math.floor((now - data.firstTxTimestamp) / 86400) : 0
  const walletAgeMonths = Math.floor(walletAgeDays / 30)

  // ML inference
  let score: number
  if (xgbModel) {
    const features = buildFeatureVector(data, walletAgeDays)
    const prob = xgbPredict(features)
    score = calibrateScore(prob)
  } else {
    // Fallback: formula-based scoring
    const factors_temp = buildFactors(data, walletAgeDays, walletAgeMonths)
    const rawWeighted = factors_temp.reduce((sum, f) => sum + f.weightedScore, 0)
    score = Math.round(300 + (rawWeighted / 100) * 550)
  }

  const factors = buildFactors(data, walletAgeDays, walletAgeMonths)

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
