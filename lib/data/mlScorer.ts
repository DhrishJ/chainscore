/**
 * ChainScore — unified ML wallet scorer (Phase 7).
 *
 * One scoring call produces BOTH the headline score and the on-page factor bars
 * from a single model prediction, so they agree by construction. There is no
 * second, parallel heuristic score anymore.
 *
 * Pipeline per wallet:
 *   features  -> model margin + per-feature contributions  (one pass)
 *   margin    -> raw P(liquidation) via sigmoid
 *   raw P     -> calibrated default probability (PD) via the exported lookup
 *   PD        -> 300..850 score via the points-to-double-odds band
 *   contribs  -> grouped into the 4 factor families -> the bars the UI renders
 *
 * The model (XGBoost booster JSON, or a logistic regression fallback) and all
 * mapping parameters load once from ml/model.json + ml/model_meta.json.
 */

import fs from 'fs'
import path from 'path'
import type { Factor, ScoreResult, RawWalletData } from '@/types'

// ─────────────────────────────────────────────────────────────
// Model artifact types
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
  learner: { gradient_booster: { model: { trees: XGBTree[] } } }
  chainscore_model_type?: string
}

interface LRModel {
  model_type: 'logistic_regression'
  feature_names: string[]
  scaler_mean: number[]
  scaler_scale: number[]
  coefficients: number[]
  intercept: number
}

interface ModelMeta {
  model_version: string
  model_type: 'xgboost' | 'logistic_regression'
  feature_names: string[]
  factor_groups: Record<string, string[]>
  factor_scales: Record<string, number>
  base_score: number
  calibration: { x: number[]; y: number[] }
  score_band: { offset: number; factor: number; score_min: number; score_max: number }
  grade_cutoffs: { A: number; B: number; C: number; D: number }
  score_distribution: Record<string, number>
}

// ─────────────────────────────────────────────────────────────
// Loading (once)
// ─────────────────────────────────────────────────────────────

let xgbModel: XGBModel | null = null
let lrModel: LRModel | null = null
let meta: ModelMeta | null = null
let modelLoaded = false

function loadModel() {
  if (modelLoaded) return
  modelLoaded = true
  try {
    const modelPath = path.join(process.cwd(), 'ml', 'model.json')
    const metaPath = path.join(process.cwd(), 'ml', 'model_meta.json')
    if (!fs.existsSync(modelPath) || !fs.existsSync(metaPath)) {
      console.warn('[mlScorer] model artifacts not found — falling back to heuristic scorer')
      return
    }
    const raw = JSON.parse(fs.readFileSync(modelPath, 'utf-8'))
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as ModelMeta
    if (raw && raw.model_type === 'logistic_regression') {
      lrModel = raw as LRModel
      console.log('[mlScorer] logistic regression model loaded')
    } else {
      xgbModel = raw as XGBModel
      console.log('[mlScorer] XGBoost model loaded')
    }
  } catch (e) {
    console.error('[mlScorer] failed to load model:', e)
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

// ─────────────────────────────────────────────────────────────
// One prediction pass: margin + per-feature contributions
// contributions sum (+ bias) to the margin, so grouping them into families and
// summing them back always reconstructs the headline. Same numbers, one source.
// ─────────────────────────────────────────────────────────────

interface Prediction {
  marginLiq: number          // logit of P(liquidation)
  contribs: number[]         // per-feature contribution to marginLiq
}

function predictXGB(features: number[]): Prediction {
  const trees = xgbModel!.learner.gradient_booster.model.trees
  const contribs = new Array(features.length).fill(0)
  // base_score is a probability; its logit is the model's starting margin.
  const bs = meta?.base_score ?? 0.5
  let margin = Math.log(bs / (1 - bs))

  for (const tree of trees) {
    let node = 0
    margin += tree.base_weights[0] // each tree contributes its root value as bias
    while (tree.left_children[node] !== -1) {
      const fIdx = tree.split_indices[node]
      const fVal = features[fIdx]
      const goLeft =
        fVal === undefined || isNaN(fVal)
          ? tree.default_left[node] === 1
          : fVal < tree.split_conditions[node]
      const child = goLeft ? tree.left_children[node] : tree.right_children[node]
      // Credit the change in node value along the path to the splitting feature.
      contribs[fIdx] += tree.base_weights[child] - tree.base_weights[node]
      margin += tree.base_weights[child] - tree.base_weights[node]
      node = child
    }
  }
  return { marginLiq: margin, contribs }
}

function predictLR(features: number[]): Prediction {
  const { coefficients, intercept, scaler_mean, scaler_scale } = lrModel!
  const contribs = new Array(features.length).fill(0)
  let margin = intercept
  for (let i = 0; i < coefficients.length; i++) {
    const scale = scaler_scale[i] || 1
    const z = (features[i] - scaler_mean[i]) / scale
    contribs[i] = coefficients[i] * z
    margin += contribs[i]
  }
  return { marginLiq: margin, contribs }
}

// ─────────────────────────────────────────────────────────────
// Calibration + score band + grade + percentile
// ─────────────────────────────────────────────────────────────

function interp(x: number[], y: number[], q: number): number {
  if (q <= x[0]) return y[0]
  if (q >= x[x.length - 1]) return y[y.length - 1]
  let lo = 0
  let hi = x.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (x[mid] <= q) lo = mid
    else hi = mid
  }
  const t = (q - x[lo]) / (x[hi] - x[lo] || 1)
  return y[lo] + t * (y[hi] - y[lo])
}

function calibratePD(rawProbLiq: number): number {
  if (!meta?.calibration) return rawProbLiq
  return interp(meta.calibration.x, meta.calibration.y, rawProbLiq)
}

function pdToScore(pd: number): number {
  const band = meta!.score_band
  const p = Math.min(Math.max(pd, 1e-4), 1 - 1e-4)
  const s = band.offset - band.factor * Math.log(p / (1 - p))
  return Math.round(Math.min(band.score_max, Math.max(band.score_min, s)))
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  const g = meta?.grade_cutoffs
  if (!g) {
    if (score >= 750) return 'A'
    if (score >= 650) return 'B'
    if (score >= 550) return 'C'
    if (score >= 450) return 'D'
    return 'F'
  }
  if (score >= g.A) return 'A'
  if (score >= g.B) return 'B'
  if (score >= g.C) return 'C'
  if (score >= g.D) return 'D'
  return 'F'
}

function scoreToPercentile(score: number): number {
  const dist = meta?.score_distribution
  if (!dist) return 50
  // Build (score, percentile) anchors from the exported deciles + range ends.
  const pts: [number, number][] = [[meta!.score_band.score_min, 0]]
  for (const q of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
    const s = dist[`p${q}`]
    if (typeof s === 'number') pts.push([s, q])
  }
  pts.push([meta!.score_band.score_max, 100])
  pts.sort((a, b) => a[0] - b[0])
  for (let i = 1; i < pts.length; i++) {
    if (score <= pts[i][0]) {
      const [s0, p0] = pts[i - 1]
      const [s1, p1] = pts[i]
      const t = (score - s0) / (s1 - s0 || 1)
      return Math.round(Math.min(100, Math.max(1, p0 + t * (p1 - p0))))
    }
  }
  return 99
}

// ─────────────────────────────────────────────────────────────
// Feature vector — MUST match model/schema.json order (30 features)
// ─────────────────────────────────────────────────────────────

function buildFeatureVector(data: RawWalletData, walletAgeDays: number): number[] {
  const totalBorrows = data.aaveBorrows + data.compoundBorrows
  const totalRepays = data.aaveRepays + data.compoundRepays
  const repaymentRatio = totalRepays / Math.max(totalBorrows, 1)
  const priorLiqCount = (data.aaveLiquidations ?? 0) + (data.compoundLiquidations ?? 0)
  const protocolsCount = [
    data.hasAave || data.aaveBorrows > 0,
    data.hasCompound || data.compoundBorrows > 0,
    data.hasUniswapLP,
    data.hasStakedETH,
  ].filter(Boolean).length

  // Behavioral risk ratios (Phase B), same definitions/clips as build_features.py.
  const borrowVelocity = Math.min(totalBorrows / Math.max(walletAgeDays, 1), 50)
  const liquidationRate = Math.min(priorLiqCount / Math.max(totalBorrows, 1), 10)
  const netUnpaidBorrows = Math.min(Math.max(totalBorrows - totalRepays, 0), 1000)
  const defiTenureRatio = Math.min((data.daysSinceFirstDefi ?? 0) / Math.max(walletAgeDays, 1), 1.5)

  return [
    walletAgeDays,
    walletAgeDays / 30,
    data.daysSinceFirstDefi ?? 0,
    data.activeDaysCount ?? 0,
    data.txCount,
    data.txCount30d ?? 0,
    data.txCount90d ?? 0,
    data.txCount180d ?? 0,
    data.activeMonthsLast12,
    data.aaveBorrows,
    data.aaveRepays,
    data.aaveLiquidations ?? 0,
    data.compoundBorrows,
    data.compoundRepays,
    data.compoundLiquidations ?? 0,
    totalBorrows,
    totalRepays,
    repaymentRatio,
    priorLiqCount,
    priorLiqCount > 0 ? 1 : 0,
    protocolsCount,
    data.hasUniswapLP ? 1 : 0,
    data.hasStakedETH ? 1 : 0,
    data.hasGovernanceVote ? 1 : 0,
    data.totalPortfolioUSD,
    data.stablecoinPct,
    data.tokenDiversity ?? 0,
    data.hasETH ? 1 : 0,
    data.hasENS ? 1 : 0,
    data.isGnosisSafe ? 1 : 0,
    // Behavioral risk ratios (Phase B)
    borrowVelocity,
    liquidationRate,
    netUnpaidBorrows,
    defiTenureRatio,
  ]
}

// ─────────────────────────────────────────────────────────────
// Factor bars from the SAME prediction (model attributions)
// Each family's bar is the model's grouped contribution, normalized to 0..100.
// Higher bar = the family pushes the wallet toward "safe".
// ─────────────────────────────────────────────────────────────

const FAMILY_WEIGHTS: Record<string, number> = {
  'Lending History': 0.3,
  'Wallet History': 0.25,
  'DeFi Activity': 0.23,
  'Portfolio & Identity': 0.22,
}

function familyExplanation(name: string, data: RawWalletData, rawScore: number): string {
  const totalBorrows = data.aaveBorrows + data.compoundBorrows
  switch (name) {
    case 'Lending History':
      if (totalBorrows === 0)
        return 'No onchain borrowing detected. Using Aave or Compound builds a verifiable credit history.'
      if (data.compoundBorrows > 0 && data.aaveBorrows > 0)
        return `Active on both Compound (${data.compoundBorrows} loans) and Aave (${data.aaveBorrows} loans). Repayment track record drives this signal.`
      if (data.compoundBorrows > 0)
        return `${data.compoundBorrows} Compound loan(s) detected. Consistent repayment strengthens this further.`
      return `${data.aaveBorrows} Aave loan(s) detected. Consistent repayment strengthens this further.`
    case 'Wallet History': {
      const months = Math.floor((data.daysSinceFirstDefi ?? 0) / 30)
      return `${data.txCount} transactions, active across ${data.activeMonthsLast12} of the last 12 months. Older, steadily active wallets score higher.`
    }
    case 'DeFi Activity': {
      const n = data.protocolsUsed.length
      if (n === 0)
        return 'Limited DeFi breadth. Staking ETH, providing liquidity, or using more protocols strengthens this signal.'
      return `Active across ${n} protocol(s): ${data.protocolsUsed.join(', ')}.${data.hasStakedETH ? ' ETH staking detected.' : ''}${data.hasUniswapLP ? ' Uniswap LP detected.' : ''}`
    }
    default:
      return [
        data.isGnosisSafe ? 'Gnosis Safe multisig detected.' : '',
        data.hasENS ? 'ENS name registered.' : '',
        data.hasETH ? 'ETH holdings detected.' : '',
        data.totalPortfolioUSD > 1000 ? `Portfolio value $${Math.round(data.totalPortfolioUSD).toLocaleString()}.` : '',
        data.stablecoinPct > 10 ? `${Math.round(data.stablecoinPct)}% stablecoin allocation.` : '',
      ]
        .filter(Boolean)
        .join(' ') || 'Holding ETH, registering an ENS name, or using a Gnosis Safe multisig improve this signal.'
  }
}

function buildModelFactors(data: RawWalletData, contribs: number[]): Factor[] {
  const groups = meta!.factor_groups
  const scales = meta!.factor_scales
  const names = meta!.feature_names
  const idx: Record<string, number> = {}
  names.forEach((n, i) => (idx[n] = i))

  const errorByFamily: Record<string, boolean> = {
    'Lending History': Boolean(data.errors?.aave || data.errors?.compound),
    'Wallet History': Boolean(data.errors?.etherscan),
    'DeFi Activity': Boolean(data.errors?.uniswap),
    'Portfolio & Identity': Boolean(data.errors?.alchemy),
  }

  return Object.keys(groups).map((name) => {
    const sumContrib = groups[name].reduce((acc, f) => acc + (contribs[idx[f]] ?? 0), 0)
    const scale = scales[name] || 1
    // Positive contribution raises liquidation risk; invert so higher bar = safer.
    const rawScore = Math.round(100 * sigmoid(-sumContrib / scale))
    const weight = FAMILY_WEIGHTS[name] ?? 0.25
    return {
      name,
      rawScore: Math.min(100, Math.max(0, rawScore)),
      weight,
      weightedScore: Math.min(100, Math.max(0, rawScore)) * weight,
      explanation: familyExplanation(name, data, rawScore),
      limitedData: errorByFamily[name] ?? false,
    }
  })
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export function computeScore(data: RawWalletData): ScoreResult {
  loadModel()

  // New wallet — no onchain history at all.
  if (data.txCount === 0 && data.firstTxTimestamp === null) {
    return {
      address: '', ens: data.ens, score: 300, grade: 'F', percentile: 1,
      factors: [], walletAge: 0, totalTxns: 0, protocolsUsed: [],
      timestamp: Date.now(), newWallet: true,
    }
  }

  const now = Date.now() / 1000
  const walletAgeDays = data.firstTxTimestamp ? Math.floor((now - data.firstTxTimestamp) / 86400) : 0

  // Borrower-only gate. The model is trained exclusively on wallets that borrowed
  // onchain, so a non-borrower has no observable credit outcome. Return the honest
  // "no borrowing history" state instead of a misleading number.
  const totalBorrowsDetected = data.aaveBorrows + data.compoundBorrows
  if (totalBorrowsDetected === 0) {
    return {
      address: '', ens: data.ens, score: 0, grade: 'F', percentile: 0,
      factors: [], walletAge: walletAgeDays, totalTxns: data.txCount,
      protocolsUsed: data.protocolsUsed, timestamp: Date.now(),
      newWallet: false, noBorrowHistory: true,
    }
  }

  const features = buildFeatureVector(data, walletAgeDays)

  // Single prediction → headline AND factor bars both derive from it.
  if ((xgbModel || lrModel) && meta) {
    const pred = xgbModel ? predictXGB(features) : predictLR(features)
    const rawProbLiq = sigmoid(pred.marginLiq)
    const pd = calibratePD(rawProbLiq)
    const score = pdToScore(pd)
    const factors = buildModelFactors(data, pred.contribs)
    return {
      address: '', ens: data.ens, score,
      grade: scoreToGrade(score), percentile: scoreToPercentile(score),
      factors, walletAge: walletAgeDays, totalTxns: data.txCount,
      protocolsUsed: data.protocolsUsed, timestamp: Date.now(),
      newWallet: false, calibratedPD: pd, modelVersion: meta.model_version,
    }
  }

  // Last-resort fallback if no model artifact is present at all.
  const score = 300 + Math.round(Math.min(1, totalBorrowsDetected / 20) * 300)
  return {
    address: '', ens: data.ens, score, grade: scoreToGrade(score),
    percentile: scoreToPercentile(score), factors: [], walletAge: walletAgeDays,
    totalTxns: data.txCount, protocolsUsed: data.protocolsUsed,
    timestamp: Date.now(), newWallet: false,
  }
}
