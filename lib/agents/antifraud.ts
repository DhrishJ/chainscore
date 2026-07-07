// The anti-fraud check (G6): the second of the two automated brakes on the
// marketing agent, beside the facts validator. It blocks fabricated social
// proof - invented partnerships, endorsements, testimonials, impersonation -
// as a code error at the publish tool, never a human approval. Aggressive,
// contrarian, meme-heavy marketing passes; fabricated proof does not.
//
// Deterministic by design (a control, not a judgment call). The allowlists
// start EMPTY: until a partnership or testimonial is real and a human adds
// it here, every claim of one is blocked. That is the point.

// Real, verified partners/integrations a human has confirmed. Adding a name
// here is a human commit, reviewed like any code change.
export const VERIFIED_PARTNERS: string[] = []

// Real people who have given written consent to be quoted. Same rule.
export const VERIFIED_TESTIMONIAL_SOURCES: string[] = []

export interface FraudViolation {
  kind: 'partnership' | 'endorsement' | 'testimonial' | 'impersonation'
  match: string
  reason: string
}

export interface FraudCheckResult {
  ok: boolean
  violations: FraudViolation[]
}

// Phrases that assert a relationship with some named entity. The phrase
// matches case-insensitively (sentences start capitalized); the captured
// entity must itself look like a proper noun (checked in code) before it
// can be flagged, so "partnered with everyone who borrows" is not a hit.
const RELATIONSHIP_PATTERNS: Array<{ re: RegExp; kind: FraudViolation['kind'] }> = [
  { re: /\b(?:partner(?:ed|ship|ing)?\s+with|official\s+partner\s+of)\s+([\w.$-]+(?:\s+[A-Z][\w.$-]*)*)/gi, kind: 'partnership' },
  { re: /\b(?:backed|endorsed|approved|audited|vetted)\s+by\s+([\w.$-]+(?:\s+[A-Z][\w.$-]*)*)/gi, kind: 'endorsement' },
  { re: /\btrusted\s+by\s+([\w.$-]+(?:\s+[A-Z][\w.$-]*)*)/gi, kind: 'endorsement' },
  { re: /\b(?:integrated|integration)\s+with\s+([\w.$-]+(?:\s+[A-Z][\w.$-]*)*)/gi, kind: 'partnership' },
  { re: /\b(?:now\s+live|launching)\s+on\s+([\w.$-]+(?:\s+[A-Z][\w.$-]*)*)/gi, kind: 'partnership' },
  { re: /\bused\s+by\s+(?:teams\s+at\s+)?([\w.$-]+(?:\s+[A-Z][\w.$-]*)*)/gi, kind: 'endorsement' },
]

// The captured entity is only a fraud candidate when it reads as a proper
// noun (capitalized or ticker-like).
function looksLikeProperNoun(entity: string): boolean {
  return /^[A-Z0-9$]/.test(entity.trim())
}

// Quote attributed to a named person: "..." - Name / "..." said Name, Title.
const TESTIMONIAL_PATTERNS: RegExp[] = [
  /["“][^"”]{10,}["”]\s*[-,]{1,2}\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g,
  /\b(?:says|said)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[,:]/g,
]

// Claiming to BE someone else, or to speak for another project.
const IMPERSONATION_PATTERNS: RegExp[] = [
  /\bwe\s+are\s+(?:the\s+)?(?:team\s+behind|official)\s+(?!ChainScore\b)([A-Z][\w.$-]*)/gi,
  /\bon\s+behalf\s+of\s+(?!ChainScore\b)([A-Z][\w.$-]*)/gi,
]

// Chains/protocols the product actually reads are not "partners"; naming
// them factually is fine. Everything here is verifiable in coverage data.
const FACTUAL_COVERAGE_NAMES = new Set(
  [
    'aave', 'compound', 'ethereum', 'arbitrum', 'optimism', 'polygon', 'base',
    'avalanche', 'scroll', 'solana', 'chainscore',
  ].map((s) => s.toLowerCase())
)

function allowlisted(name: string, list: string[]): boolean {
  const normalized = name.trim().toLowerCase().replace(/[.,;:!?]+$/, '')
  if (FACTUAL_COVERAGE_NAMES.has(normalized)) return true
  return list.some((entry) => entry.toLowerCase() === normalized)
}

export function checkFraud(text: string): FraudCheckResult {
  const violations: FraudViolation[] = []

  for (const { re, kind } of RELATIONSHIP_PATTERNS) {
    for (const match of text.matchAll(re)) {
      const entity = match[1]
      if (!entity || !looksLikeProperNoun(entity) || allowlisted(entity, VERIFIED_PARTNERS)) continue
      violations.push({
        kind,
        match: match[0].slice(0, 120),
        reason: `Claims a ${kind} with "${entity}" which is not in VERIFIED_PARTNERS. Fabricated social proof is fraud, not marketing (G6). If this relationship is real, a human adds it to the allowlist.`,
      })
    }
  }

  for (const re of TESTIMONIAL_PATTERNS) {
    for (const match of text.matchAll(re)) {
      const person = match[1]
      if (!person || allowlisted(person, VERIFIED_TESTIMONIAL_SOURCES)) continue
      violations.push({
        kind: 'testimonial',
        match: match[0].slice(0, 120),
        reason: `Quote attributed to "${person}" who is not in VERIFIED_TESTIMONIAL_SOURCES. No testimonials without written consent on file.`,
      })
    }
  }

  for (const re of IMPERSONATION_PATTERNS) {
    for (const match of text.matchAll(re)) {
      violations.push({
        kind: 'impersonation',
        match: match[0].slice(0, 120),
        reason: 'Speaks as or for another project. ChainScore content speaks only for ChainScore (chainscore.dev).',
      })
    }
  }

  return { ok: violations.length === 0, violations }
}

// CAN-SPAM basics for email, enforced in code (G6): a working unsubscribe
// marker must be present; the send adapter substitutes the real link.
export const UNSUBSCRIBE_TOKEN = '{{unsubscribe_url}}'

export function checkEmailCompliance(body: string): FraudCheckResult {
  if (body.includes(UNSUBSCRIBE_TOKEN)) return { ok: true, violations: [] }
  return {
    ok: false,
    violations: [
      {
        kind: 'impersonation',
        match: 'missing unsubscribe',
        reason: `Email body must contain the ${UNSUBSCRIBE_TOKEN} token (CAN-SPAM: working unsubscribe, honest headers). The send adapter replaces it with a real link.`,
      },
    ],
  }
}
