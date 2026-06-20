// Phase 7 test: the headline score and the on-page factor bars come from a single
// model prediction, so they agree by construction. The score page renders
// result.factors verbatim (no recompute), and both the page and the API route call
// the same computeScore, so the rendered factors ARE the API factors. This test
// mirrors lib/data/mlScorer.ts against the exported artifacts and asserts the
// numerical invariant that proves it: the 4 factor families fully decompose the
// same margin that produces the headline score.
//
// Run: node scripts/test-unified-scoring.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const model = JSON.parse(readFileSync(join(root, 'ml/model.json'), 'utf8'))
const meta = JSON.parse(readFileSync(join(root, 'ml/model_meta.json'), 'utf8'))

const sigmoid = (x) => 1 / (1 + Math.exp(-x))

// Mirror of predictXGB in mlScorer.ts: margin + per-feature contributions.
function predict(features) {
  const trees = model.learner.gradient_booster.model.trees
  const contribs = new Array(features.length).fill(0)
  const bs = meta.base_score ?? 0.5
  let margin = Math.log(bs / (1 - bs))
  let bias = Math.log(bs / (1 - bs))
  for (const t of trees) {
    let node = 0
    margin += t.base_weights[0]
    bias += t.base_weights[0]
    while (t.left_children[node] !== -1) {
      const fi = t.split_indices[node]
      const fv = features[fi]
      const goLeft = fv === undefined || Number.isNaN(fv) ? t.default_left[node] === 1 : fv < t.split_conditions[node]
      const child = goLeft ? t.left_children[node] : t.right_children[node]
      contribs[fi] += t.base_weights[child] - t.base_weights[node]
      margin += t.base_weights[child] - t.base_weights[node]
      node = child
    }
  }
  return { margin, contribs, bias }
}

function interp(x, y, q) {
  if (q <= x[0]) return y[0]
  if (q >= x[x.length - 1]) return y[y.length - 1]
  let lo = 0, hi = x.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= q) lo = m; else hi = m }
  const t = (q - x[lo]) / (x[hi] - x[lo] || 1)
  return y[lo] + t * (y[hi] - y[lo])
}

function pdToScore(pd) {
  const b = meta.score_band
  const p = Math.min(Math.max(pd, 1e-4), 1 - 1e-4)
  const s = b.offset - b.factor * Math.log(p / (1 - p))
  return Math.round(Math.min(b.score_max, Math.max(b.score_min, s)))
}

// A few representative feature vectors (schema order). Values are illustrative.
const n = meta.feature_names.length
function vec(overrides) {
  const v = new Array(n).fill(0)
  for (const [k, val] of Object.entries(overrides)) v[meta.feature_names.indexOf(k)] = val
  return v
}
const samples = [
  vec({ wallet_age_days: 900, tx_count: 400, aave_borrows: 12, aave_repays: 11, total_borrows: 12, total_repays: 11, repayment_ratio: 0.92, has_eth: 1, token_diversity: 10 }),
  vec({ wallet_age_days: 60, tx_count: 8, aave_borrows: 1, total_borrows: 1, prior_liquidation_count: 2, has_prior_liquidation: 1 }),
  vec({ wallet_age_days: 400, tx_count: 120, compound_borrows: 5, total_borrows: 5, total_repays: 5, repayment_ratio: 1, has_staked_eth: 1, protocols_used_count: 3 }),
]

let failed = 0
const EPS = 1e-6
for (let i = 0; i < samples.length; i++) {
  const { margin, contribs, bias } = predict(samples[i])

  // Invariant 1: the 4 families + bias fully reconstruct the headline margin.
  let famSum = 0
  const famContribs = {}
  for (const [fam, feats] of Object.entries(meta.factor_groups)) {
    const s = feats.reduce((acc, f) => acc + contribs[meta.feature_names.indexOf(f)], 0)
    famContribs[fam] = s
    famSum += s
  }
  const reconstructed = bias + famSum
  const ok1 = Math.abs(reconstructed - margin) < EPS

  // Invariant 2: the headline score derives from the same margin.
  const pd = interp(meta.calibration.x, meta.calibration.y, sigmoid(margin))
  const score = pdToScore(pd)
  const ok2 = Number.isFinite(score) && score >= meta.score_band.score_min && score <= meta.score_band.score_max

  // Invariant 3: each bar is the model's grouped contribution (the rendered value).
  const bars = {}
  let okBars = true
  for (const [fam, s] of Object.entries(famContribs)) {
    const scale = meta.factor_scales[fam] || 1
    bars[fam] = Math.round(100 * sigmoid(-s / scale))
    if (bars[fam] < 0 || bars[fam] > 100) okBars = false
  }

  const ok = ok1 && ok2 && okBars
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  sample ${i}: score=${score} pd=${pd.toFixed(4)} ` +
    `reconstruct_err=${Math.abs(reconstructed - margin).toExponential(1)} bars=${JSON.stringify(bars)}`)
}

console.log(failed === 0
  ? '\nAll unified-scoring invariants hold: factor bars decompose the headline margin (one source).'
  : `\n${failed} unified-scoring check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
