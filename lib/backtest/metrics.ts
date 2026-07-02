// Evaluation metrics for backtests (Workstream C). Pure functions, no I/O.
//
// Every metric accepts per-sample weights so results can be reweighted from
// the balanced training sample to the true population base rate (9.09
// percent), matching how model/METRICS.md reports numbers. Pass weights of 1
// for unweighted metrics.

export interface Sample {
  // Model output being ranked (probability of the positive class).
  p: number
  // 1 = positive class (liquidated in the outcome window).
  label: 0 | 1
  weight: number
}

// Weights that reweight a sample with base rate p_sample to targetBaseRate.
export function baseRateWeights(labels: Array<0 | 1>, targetBaseRate: number): number[] {
  const n = labels.length
  const positives = labels.reduce<number>((sum, l) => sum + l, 0)
  const pSample = positives / Math.max(n, 1)
  if (pSample === 0 || pSample === 1) return labels.map(() => 1)
  const wPos = targetBaseRate / pSample
  const wNeg = (1 - targetBaseRate) / (1 - pSample)
  return labels.map((l) => (l === 1 ? wPos : wNeg))
}

// Weighted ROC-AUC: probability a random positive outranks a random negative,
// ties counted half. Computed by a single pass over samples sorted ascending
// by p, accumulating negative weight below each positive (tie groups handled
// exactly).
export function rocAuc(samples: Sample[]): number {
  const sorted = [...samples].sort((a, b) => a.p - b.p)
  let cumNegW = 0
  let pairs = 0
  let wins = 0
  let i = 0
  while (i < sorted.length) {
    // Group ties.
    let j = i
    let groupPosW = 0
    let groupNegW = 0
    while (j < sorted.length && sorted[j].p === sorted[i].p) {
      if (sorted[j].label === 1) groupPosW += sorted[j].weight
      else groupNegW += sorted[j].weight
      j++
    }
    wins += groupPosW * (cumNegW + groupNegW / 2)
    cumNegW += groupNegW
    i = j
  }
  const totPosW = samples.reduce((s, x) => s + (x.label === 1 ? x.weight : 0), 0)
  const totNegW = samples.reduce((s, x) => s + (x.label === 0 ? x.weight : 0), 0)
  pairs = totPosW * totNegW
  return pairs === 0 ? 0.5 : wins / pairs
}

// Weighted average precision (PR-AUC). Samples sorted descending by p; tie
// groups contribute their pooled precision. Equivalent to sklearn's
// average_precision_score with sample weights.
export function prAuc(samples: Sample[]): number {
  const sorted = [...samples].sort((a, b) => b.p - a.p)
  const totPosW = sorted.reduce((s, x) => s + (x.label === 1 ? x.weight : 0), 0)
  if (totPosW === 0) return 0
  let cumPosW = 0
  let cumTotW = 0
  let ap = 0
  let i = 0
  while (i < sorted.length) {
    let j = i
    let groupPosW = 0
    let groupTotW = 0
    while (j < sorted.length && sorted[j].p === sorted[i].p) {
      groupPosW += sorted[j].label === 1 ? sorted[j].weight : 0
      groupTotW += sorted[j].weight
      j++
    }
    const recallDelta = groupPosW / totPosW
    const precisionAtGroup = (cumPosW + groupPosW) / (cumTotW + groupTotW)
    ap += recallDelta * precisionAtGroup
    cumPosW += groupPosW
    cumTotW += groupTotW
    i = j
  }
  return ap
}

export function brier(samples: Sample[]): number {
  const totW = samples.reduce((s, x) => s + x.weight, 0)
  if (totW === 0) return 0
  const sum = samples.reduce((s, x) => s + x.weight * (x.p - x.label) ** 2, 0)
  return sum / totW
}

export interface ReliabilityBin {
  lo: number
  hi: number
  meanPredicted: number
  observedRate: number
  weight: number
  n: number
}

export function reliabilityBins(samples: Sample[], nBins = 10): ReliabilityBin[] {
  const bins: ReliabilityBin[] = Array.from({ length: nBins }, (_, i) => ({
    lo: i / nBins,
    hi: (i + 1) / nBins,
    meanPredicted: 0,
    observedRate: 0,
    weight: 0,
    n: 0,
  }))
  for (const s of samples) {
    const idx = Math.min(nBins - 1, Math.floor(s.p * nBins))
    const b = bins[idx]
    b.meanPredicted += s.weight * s.p
    b.observedRate += s.weight * s.label
    b.weight += s.weight
    b.n += 1
  }
  for (const b of bins) {
    if (b.weight > 0) {
      b.meanPredicted /= b.weight
      b.observedRate /= b.weight
    }
  }
  return bins
}

// Expected calibration error over the reliability bins.
export function ece(samples: Sample[], nBins = 10): number {
  const bins = reliabilityBins(samples, nBins)
  const totW = bins.reduce((s, b) => s + b.weight, 0)
  if (totW === 0) return 0
  return bins.reduce((s, b) => s + (b.weight / totW) * Math.abs(b.meanPredicted - b.observedRate), 0)
}

export interface OperatingPoint {
  threshold: number
  recall: number
  falsePositiveRate: number
  precision: number
  flaggedShare: number
}

// Confusion metrics given a per-sample flag decision (for example score
// below the D/F cutoff). `threshold` is echoed into the result for the report.
export function operatingPoint(samples: Sample[], flags: boolean[], threshold: number): OperatingPoint {
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const flagged = flags[i]
    if (s.label === 1) {
      if (flagged) tp += s.weight
      else fn += s.weight
    } else {
      if (flagged) fp += s.weight
      else tn += s.weight
    }
  }
  return {
    threshold,
    recall: tp + fn === 0 ? 0 : tp / (tp + fn),
    falsePositiveRate: fp + tn === 0 ? 0 : fp / (fp + tn),
    precision: tp + fp === 0 ? 0 : tp / (tp + fp),
    flaggedShare: (tp + fp) / Math.max(tp + fp + fn + tn, 1e-12),
  }
}
