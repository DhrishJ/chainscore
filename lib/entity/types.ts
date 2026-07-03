// Cross-wallet entity resolution (Workstream D). Clusters addresses likely
// controlled by one actor so a score reflects real creditworthiness rather
// than one fragment of it, while never hard-merging on weak evidence: a wrong
// merge can defame a wallet, so confidence is first-class and merges are
// reversible.

export type SignalKind =
  | 'shared_funder' // both addresses first funded by the same source
  | 'gas_funding' // one address funded the other's gas
  | 'temporal_cospend' // repeated activity in tight time proximity
  | 'bridge_hop' // one bridged to the other across chains
  | 'direct_transfer' // sustained direct value flow between the two

export interface PairSignal {
  kind: SignalKind
  // 0..1 strength of this single piece of evidence.
  strength: number
  evidence: Record<string, number | string>
}

export interface AddressNode {
  address: string
  chain: string
  // Earliest inbound funder (lowercased) if known.
  funder?: string
  // Address that paid this wallet's first gas, if distinct from funder.
  gasFunder?: string
  // Activity timestamps for temporal co-spend comparison.
  activityTimes?: number[]
  // Direct counterparties with directed transfer counts.
  transfersWith?: Record<string, number>
  // Cross-chain bridge destinations claimed for this address.
  bridgedTo?: string[]
}

export interface PairLink {
  a: string
  b: string
  signals: PairSignal[]
  // Combined confidence this pair is the same actor, 0..1.
  confidence: number
}

export interface EntityCluster {
  id: string
  members: string[]
  // Minimum pairwise confidence holding the cluster together (its weakest
  // internal link); a cluster is only as trustworthy as its weakest edge.
  cohesion: number
  // How the cluster was formed, for the audit trail.
  links: PairLink[]
}

// Confidence bands. Only HIGH links merge; MEDIUM are surfaced to scoring as
// probabilistic associations but never hard-applied; LOW are logged only.
export const MERGE_THRESHOLD = 0.85
export const SURFACE_THRESHOLD = 0.5
