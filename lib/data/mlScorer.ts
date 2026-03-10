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
// Factor signals — 4 groups derived from ML feature importances
//
// Weights reflect actual XGBoost gain importances (grouped):
//   Lending History:  30%  (compound_borrows 17%, aave_borrows 6%, total_borrows 7%)
//   Wallet History:   25%  (wallet_age 13%, tx_count 6%, active_months 5%)
//   DeFi Activity:    23%  (protocols 9%, staked_eth 9%, uniswap_lp 6%)
//   Portfolio:        22%  (has_eth 7%, gnosis_safe 6%, portfolio_usd 5%, stablecoin 3%)
// ─────────────────────────────────────────────────────────────

function buildFactors(data: RawWalletData, walletAgeDays: number, walletAgeMonths: number): Factor[] {
  const totalBorrows = data.aaveBorrows + data.compoundBorrows
  const hasLendingError = Boolean(data.errors?.aave || data.errors?.compound)

  // ── Lending History (30%) ──────────────────────────────────
  // Compound borrowing is the strongest single signal (17% importance)
  let f1Raw = 20 // baseline: no history
  if (totalBorrows > 0) {
    if (data.compoundBorrows > 0) f1Raw += 40
    if (data.aaveBorrows > 0)     f1Raw += 25
    const borrowBonus = Math.min(15, Math.floor(totalBorrows / 5) * 3)
    f1Raw = Math.min(100, f1Raw + borrowBonus)
  }

  const f1Explanation = hasLendingError
    ? 'Unable to fully query lending history. Score estimated from available data.'
    : totalBorrows === 0
    ? 'No on-chain borrowing detected. Using Aave or Compound builds a verifiable credit history.'
    : data.compoundBorrows > 0 && data.aaveBorrows > 0
    ? `Active on both Compound (${data.compoundBorrows} loans) and Aave (${data.aaveBorrows} loans) — strong multi-protocol lending history.`
    : data.compoundBorrows > 0
    ? `${data.compoundBorrows} Compound loan(s) detected. Adding Aave activity would further strengthen this signal.`
    : `${data.aaveBorrows} Aave loan(s) detected. Adding Compound activity would further strengthen this signal.`

  // ── Wallet History (25%) ───────────────────────────────────
  let f2Raw = walletAgeMonths < 6 ? 10 : walletAgeMonths < 12 ? 25 : walletAgeMonths < 24 ? 45 : walletAgeMonths < 36 ? 65 : walletAgeMonths < 48 ? 80 : 90
  const txBonus = data.txCount < 10 ? 0 : data.txCount < 50 ? 3 : data.txCount < 200 ? 6 : data.txCount < 500 ? 8 : 10
  if (data.activeMonthsLast12 >= 8) f2Raw += 5
  f2Raw = Math.min(100, f2Raw + txBonus)

  const f2Explanation = walletAgeMonths < 6
    ? `Wallet is ${walletAgeMonths} months old with ${data.txCount} transactions. Older, more active wallets score higher.`
    : data.activeMonthsLast12 >= 8
    ? `${walletAgeMonths}-month-old wallet with ${data.txCount} transactions active across ${data.activeMonthsLast12} of the last 12 months — consistent usage.`
    : `${walletAgeMonths}-month-old wallet, ${data.txCount} transactions. Try to stay active for at least 8 months per year.`

  // ── DeFi Activity (23%) ────────────────────────────────────
  const protocols = data.protocolsUsed.length
  let f3Raw = protocols === 0 ? 0 : protocols === 1 ? 30 : protocols === 2 ? 55 : protocols === 3 ? 75 : 90
  if (data.hasStakedETH) f3Raw = Math.min(100, f3Raw + 10)
  if (data.hasUniswapLP)  f3Raw = Math.min(100, f3Raw + 8)
  if (data.hasGovernanceVote) f3Raw = Math.min(100, f3Raw + 5)

  const f3Explanation = protocols === 0
    ? 'No DeFi protocol usage detected. Staking ETH, providing liquidity, or borrowing on lending protocols all strengthen this signal.'
    : `Active on ${protocols} protocol(s): ${data.protocolsUsed.join(', ')}.${data.hasStakedETH ? ' ETH staking detected.' : ''}${data.hasUniswapLP ? ' Uniswap LP position detected.' : ''}`

  // ── Portfolio & Identity (22%) ─────────────────────────────
  let f4Raw = 0
  if (data.hasETH)                          f4Raw += 30
  if (data.isGnosisSafe)                    f4Raw += 25
  if (data.totalPortfolioUSD > 10000)       f4Raw += 20
  else if (data.totalPortfolioUSD > 1000)   f4Raw += 12
  else if (data.totalPortfolioUSD > 100)    f4Raw += 5
  if (data.stablecoinPct > 10)              f4Raw += 12
  if (data.hasENS)                          f4Raw += 13
  f4Raw = Math.min(100, f4Raw)

  const f4Explanation = [
    data.isGnosisSafe ? 'Gnosis Safe multisig — highest trust signal.' : '',
    data.hasENS ? 'ENS name registered.' : '',
    data.hasETH ? 'ETH holdings detected.' : '',
    data.totalPortfolioUSD > 1000 ? `Portfolio value $${Math.round(data.totalPortfolioUSD).toLocaleString()}.` : '',
    data.stablecoinPct > 10 ? `${Math.round(data.stablecoinPct)}% stablecoin allocation.` : '',
  ].filter(Boolean).join(' ') || 'No strong portfolio signals. Holding ETH, registering an ENS name, or using a Gnosis Safe multisig all improve this.'

  return [
    {
      name: 'Lending History',
      rawScore: f1Raw,
      weight: 0.30,
      weightedScore: f1Raw * 0.30,
      explanation: f1Explanation,
      limitedData: hasLendingError,
    },
    {
      name: 'Wallet History',
      rawScore: f2Raw,
      weight: 0.25,
      weightedScore: f2Raw * 0.25,
      explanation: f2Explanation,
      limitedData: Boolean(data.errors?.etherscan),
    },
    {
      name: 'DeFi Activity',
      rawScore: f3Raw,
      weight: 0.23,
      weightedScore: f3Raw * 0.23,
      explanation: f3Explanation,
      limitedData: Boolean(data.errors?.uniswap),
    },
    {
      name: 'Portfolio & Identity',
      rawScore: f4Raw,
      weight: 0.22,
      weightedScore: f4Raw * 0.22,
      explanation: f4Explanation,
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
