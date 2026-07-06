// Pre-publish validator (G3). Scans outbound content (web copy, tweets,
// emails) for numeric claims and rejects the content if any claim is not
// backed by a verified Facts Registry entry.
//
// Scope and honesty about limits: this validator matches NUMBERS, not verbs.
// "250K+ borrowers analyzed" and "250K+ borrower records ingested" contain
// the same number; which wording is defensible is decided by a human when
// they verify the registry entry and pin its definition. The enforcement
// contract is: no number appears publicly unless a human has verified a
// registry entry whose magnitude backs it. Wording lives in `definition`
// and is reconciled at the gate, not guessed by a regex.

export interface FactRecord {
  key: string
  value: string
  numericValue: number | null
  unit: string | null
  verified: boolean
}

export interface NumericClaim {
  raw: string
  // Normalized magnitude: "250K+" -> 250000, "88%" -> 88, "0.849" -> 0.849
  magnitude: number
  isLowerBound: boolean
  isPercent: boolean
  index: number
}

export interface Violation {
  claim: string
  reason: string
}

export interface ValidationResult {
  ok: boolean
  claims: NumericClaim[]
  violations: Violation[]
}

// Patterns that look numeric but are not public metric claims.
const BENIGN_PATTERNS: RegExp[] = [
  /^(19|20)\d{2}$/, // bare years
  /^v\d+$/i, // version tokens like v5
  /^\d{1,2}:\d{2}$/, // times
]

const SUFFIX_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
}

// Matches numbers in prose: 7,720 | 40,000 | 250K+ | 88% | 0.849 | 850
const NUMBER_RE = /(\d[\d,]*(?:\.\d+)?)\s*([kKmMbB])?\s*(\+)?\s*(%|percent)?/g

export function extractNumericClaims(text: string): NumericClaim[] {
  const claims: NumericClaim[] = []
  // Strip URLs and code spans first: query params and hashes are not claims.
  const stripped = text.replace(/https?:\/\/\S+/g, ' ').replace(/`[^`]*`/g, ' ')

  for (const match of stripped.matchAll(NUMBER_RE)) {
    const [raw, digits, suffix, plus, percent] = match
    if (!digits) continue
    // Skip digits glued to an identifier: v5, 0x8894..., chunk-2117, #42.
    const prev = stripped[(match.index ?? 0) - 1]
    if (prev !== undefined && /[A-Za-z0-9_#@/-]/.test(prev)) continue
    const bare = digits.replace(/,/g, '')
    if (BENIGN_PATTERNS.some((re) => re.test(bare)) && !suffix && !percent && !plus) continue

    let magnitude = Number.parseFloat(bare)
    if (!Number.isFinite(magnitude)) continue
    if (suffix) magnitude *= SUFFIX_MULTIPLIER[suffix.toLowerCase()] ?? 1

    claims.push({
      raw: raw.trim(),
      magnitude,
      isLowerBound: Boolean(plus),
      isPercent: Boolean(percent),
      index: match.index ?? 0,
    })
  }
  return claims
}

// A claim is backed when a verified fact's magnitude matches it at the
// precision the claim displays. Percent claims also match ratio-unit facts
// (fact 0.8815 backs "88%"). Lower-bound claims ("20K+") are backed when a
// verified fact is at least the bound and the bound is not understated by
// more than half (so "1+ wallets" cannot launder a big-sounding nothing).
function claimBacked(claim: NumericClaim, facts: FactRecord[]): boolean {
  for (const fact of facts) {
    if (!fact.verified || fact.numericValue === null) continue
    const candidates = [fact.numericValue]
    if (claim.isPercent && fact.unit === 'ratio') candidates.push(fact.numericValue * 100)

    for (const candidate of candidates) {
      if (claim.isLowerBound) {
        if (candidate >= claim.magnitude && claim.magnitude >= candidate * 0.5) return true
        continue
      }
      // Match at the claim's displayed precision: "88" backs 88.15; "0.849"
      // backs 0.8489; "7,720" backs only 7720.
      const decimals = (claim.raw.split('.')[1] ?? '').replace(/\D/g, '').length
      const tolerance = decimals > 0 ? Math.pow(10, -decimals) : 0.5
      if (Math.abs(candidate - claim.magnitude) <= tolerance) return true
    }
  }
  return false
}

export function validateContent(text: string, facts: FactRecord[]): ValidationResult {
  const claims = extractNumericClaims(text)
  const violations: Violation[] = []

  for (const claim of claims) {
    if (!claimBacked(claim, facts)) {
      violations.push({
        claim: claim.raw,
        reason: `No verified Facts Registry entry backs "${claim.raw}". Register the metric (a human must verify it) or remove the number.`,
      })
    }
  }

  return { ok: violations.length === 0, claims, violations }
}
