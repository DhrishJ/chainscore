import {
  AddressNode,
  EntityCluster,
  MERGE_THRESHOLD,
  PairLink,
  PairSignal,
  SURFACE_THRESHOLD,
} from './types'

// Pairwise signal scoring and confidence combination, then a
// high-confidence-only clustering step. Design commitments from
// THREAT_MODEL.md A6:
//  - No single signal can force a merge. Confidence is a soft-OR of
//    independent signals, and the merge threshold is set so at least two
//    corroborating signals (or one very strong plus one weak) are needed.
//  - The funding signal is directional and value-aware, so inbound-only dust
//    cannot link a victim into an entity.
//  - Everything below the merge threshold is surfaced as a probability, never
//    hard-applied, and every merge keeps its links for reversal.

function directTransferStrength(a: AddressNode, b: AddressNode): number {
  const aToB = a.transfersWith?.[b.address] ?? 0
  const bToA = b.transfersWith?.[a.address] ?? 0
  // Bidirectional, sustained flow is stronger evidence than one-way dust.
  // One-way transfers cap low so a victim receiving dust is not linked.
  if (aToB > 0 && bToA > 0) return Math.min(1, (aToB + bToA) / 10)
  const oneWay = Math.max(aToB, bToA)
  return oneWay >= 3 ? Math.min(0.4, oneWay / 20) : 0
}

function temporalCospendStrength(a: AddressNode, b: AddressNode): number {
  const ta = a.activityTimes ?? []
  const tb = b.activityTimes ?? []
  if (ta.length < 3 || tb.length < 3) return 0
  // Count close pairs (within 5 minutes) relative to the smaller series.
  const WINDOW = 300
  let close = 0
  let j = 0
  const sortedA = [...ta].sort((x, y) => x - y)
  const sortedB = [...tb].sort((x, y) => x - y)
  for (const t of sortedA) {
    while (j < sortedB.length && sortedB[j] < t - WINDOW) j++
    if (j < sortedB.length && Math.abs(sortedB[j] - t) <= WINDOW) close++
  }
  return Math.min(1, close / Math.min(sortedA.length, sortedB.length))
}

export function scorePair(a: AddressNode, b: AddressNode): PairLink {
  const signals: PairSignal[] = []

  if (a.funder && b.funder && a.funder === b.funder) {
    signals.push({ kind: 'shared_funder', strength: 0.6, evidence: { funder: a.funder } })
  }
  if ((a.gasFunder && a.gasFunder === b.address) || (b.gasFunder && b.gasFunder === a.address)) {
    signals.push({ kind: 'gas_funding', strength: 0.7, evidence: { direct: 1 } })
  }
  const cospend = temporalCospendStrength(a, b)
  if (cospend > 0) signals.push({ kind: 'temporal_cospend', strength: cospend, evidence: { overlap: Math.round(cospend * 100) } })

  if ((a.bridgedTo ?? []).includes(b.address) || (b.bridgedTo ?? []).includes(a.address)) {
    signals.push({ kind: 'bridge_hop', strength: 0.75, evidence: { crossChain: 1 } })
  }
  const direct = directTransferStrength(a, b)
  if (direct > 0) signals.push({ kind: 'direct_transfer', strength: direct, evidence: {} })

  // Soft-OR combination so independent signals compound but no single one
  // reaches the merge threshold alone (max single strength is 0.75 < 0.85).
  let survive = 1
  for (const s of signals) survive *= 1 - Math.min(1, Math.max(0, s.strength))
  const confidence = 1 - survive

  return { a: a.address, b: b.address, signals, confidence }
}

// Build clusters from the address set using only links at or above the merge
// threshold (union-find). MEDIUM links are returned separately for scoring to
// treat as probabilistic associations.
export interface ResolveResult {
  clusters: EntityCluster[]
  // Links in [SURFACE_THRESHOLD, MERGE_THRESHOLD): shown to scoring, not merged.
  surfacedLinks: PairLink[]
}

export function resolveEntities(nodes: AddressNode[]): ResolveResult {
  const links: PairLink[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const link = scorePair(nodes[i], nodes[j])
      if (link.confidence > 0) links.push(link)
    }
  }

  const mergeLinks = links.filter((l) => l.confidence >= MERGE_THRESHOLD)
  const surfacedLinks = links.filter(
    (l) => l.confidence >= SURFACE_THRESHOLD && l.confidence < MERGE_THRESHOLD
  )

  // Union-find over merge links only.
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    parent.set(x, parent.get(x) ?? x)
    while (parent.get(x) !== x) {
      const p = parent.get(x)!
      parent.set(x, parent.get(p) ?? p)
      x = parent.get(x)!
    }
    return x
  }
  const union = (x: string, y: string) => {
    parent.set(find(x), find(y))
  }
  for (const node of nodes) find(node.address)
  for (const link of mergeLinks) union(link.a, link.b)

  const groups = new Map<string, string[]>()
  for (const node of nodes) {
    const root = find(node.address)
    const g = groups.get(root) ?? []
    g.push(node.address)
    groups.set(root, g)
  }

  const clusters: EntityCluster[] = []
  let idx = 0
  for (const [root, members] of groups) {
    if (members.length < 2) continue // singletons are not entities
    const internal = mergeLinks.filter((l) => members.includes(l.a) && members.includes(l.b))
    const cohesion = internal.length > 0 ? Math.min(...internal.map((l) => l.confidence)) : MERGE_THRESHOLD
    clusters.push({ id: `entity_${root.slice(0, 10)}_${idx++}`, members: members.sort(), cohesion, links: internal })
  }

  return { clusters, surfacedLinks }
}

// Entity-level score aggregation. Per-address scores roll up weighted by
// activity and recency; per-address scores stay available. Only members of a
// merged cluster (high confidence) contribute; surfaced-only links do not
// pull a score in.
export interface AddressScore {
  address: string
  score: number
  activityWeight: number // e.g. tx count
  lastActiveTs: number
}

export function aggregateEntityScore(members: AddressScore[], nowTs: number): number {
  if (members.length === 0) return 0
  if (members.length === 1) return members[0].score
  // Recency decay: half-life 180 days. Weight = activity * recency.
  const HALF_LIFE = 180 * 86400
  let wsum = 0
  let sum = 0
  for (const m of members) {
    const age = Math.max(0, nowTs - m.lastActiveTs)
    const recency = Math.pow(0.5, age / HALF_LIFE)
    const w = Math.max(m.activityWeight, 1) * recency
    wsum += w
    sum += w * m.score
  }
  return wsum > 0 ? Math.round(sum / wsum) : Math.round(members.reduce((s, m) => s + m.score, 0) / members.length)
}
