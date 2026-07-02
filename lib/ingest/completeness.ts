// Data-completeness scoring (Workstream B): every scored wallet reports how
// much of its feature input actually arrived. The frontend degraded banner
// and API consumers read this instead of a hardcoded chain list.

// Weights mirror how much of the feature vector each source group feeds.
const WEIGHTS: Record<string, number> = {
  etherscan: 0.4, // tx history + first tx: age, activity, velocity features
  alchemy: 0.2, // portfolio, identity flags
  aave: 0.2, // lending history
  compound: 0.1, // lending history
  uniswap: 0.1, // LP flag
}

export interface CompletenessReport {
  // 0..1, 1 means every source group answered.
  dataCompleteness: number
  // Source groups that failed and degraded the feature vector.
  degradedSources: string[]
}

export function computeCompleteness(errors: Record<string, string>): CompletenessReport {
  let lost = 0
  const degradedSources: string[] = []
  for (const [group, weight] of Object.entries(WEIGHTS)) {
    if (errors[group]) {
      lost += weight
      degradedSources.push(group)
    }
  }
  return {
    dataCompleteness: Math.round((1 - lost) * 100) / 100,
    degradedSources,
  }
}
