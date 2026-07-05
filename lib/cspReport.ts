import { z } from 'zod'

// Normalization for CSP violation reports (consumed by
// app/api/csp-report/route.ts; separate module because Next route files may
// only export HTTP handlers).
//
// Two wire formats arrive, depending on browser and directive:
//   report-uri:  { "csp-report": { "blocked-uri": ..., ... } }  (one object)
//   report-to:   [ { "type": "csp-violation", "body": { ... } }, ... ]
// Both normalize to the same compact shape. Everything is untrusted input:
// schema-filtered, size-capped upstream, never echoed back.

// Keep only the fields the ratchet decision needs; drop the rest.
const reportFields = z
  .object({
    'document-uri': z.string().max(512).optional(),
    documentURL: z.string().max(512).optional(),
    'violated-directive': z.string().max(256).optional(),
    'effective-directive': z.string().max(256).optional(),
    effectiveDirective: z.string().max(256).optional(),
    'blocked-uri': z.string().max(512).optional(),
    blockedURL: z.string().max(512).optional(),
    disposition: z.string().max(32).optional(),
    'source-file': z.string().max(512).optional(),
    sourceFile: z.string().max(512).optional(),
    'line-number': z.number().optional(),
    lineNumber: z.number().optional(),
  })
  .loose()

export type NormalizedCspReport = {
  directive: string
  blocked: string
  document: string
  disposition: string
  source: string
}

function normalize(raw: unknown): NormalizedCspReport | null {
  const parsed = reportFields.safeParse(raw)
  if (!parsed.success) return null
  const r = parsed.data
  return {
    directive:
      r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? 'unknown',
    blocked: r['blocked-uri'] ?? r.blockedURL ?? 'unknown',
    document: r['document-uri'] ?? r.documentURL ?? 'unknown',
    disposition: r.disposition ?? 'unknown',
    source: r['source-file'] ?? r.sourceFile ?? '',
  }
}

export function extractReports(body: unknown): NormalizedCspReport[] {
  if (Array.isArray(body)) {
    // report-to batch: [{ type: "csp-violation", body: {...} }]
    return body
      .filter(
        (item): item is { body: unknown } =>
          typeof item === 'object' &&
          item !== null &&
          'body' in item &&
          (item as { type?: unknown }).type === 'csp-violation'
      )
      .map((item) => normalize(item.body))
      .filter((r): r is NormalizedCspReport => r !== null)
  }
  if (typeof body === 'object' && body !== null && 'csp-report' in body) {
    const one = normalize((body as Record<string, unknown>)['csp-report'])
    return one ? [one] : []
  }
  return []
}
