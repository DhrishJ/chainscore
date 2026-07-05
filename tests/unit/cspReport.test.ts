import { describe, expect, it } from 'vitest'
import { extractReports } from '@/lib/cspReport'

describe('csp-report extractReports', () => {
  it('normalizes a legacy report-uri payload', () => {
    const body = {
      'csp-report': {
        'document-uri': 'https://chainscore.dev/score/0xabc',
        'violated-directive': 'connect-src',
        'effective-directive': 'connect-src',
        'blocked-uri': 'https://evil.example',
        disposition: 'report',
        'source-file': 'https://chainscore.dev/_next/static/chunks/app.js',
        'line-number': 12,
      },
    }
    const reports = extractReports(body)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toEqual({
      directive: 'connect-src',
      blocked: 'https://evil.example',
      document: 'https://chainscore.dev/score/0xabc',
      disposition: 'report',
      source: 'https://chainscore.dev/_next/static/chunks/app.js',
    })
  })

  it('normalizes a report-to batch and ignores non-csp entries', () => {
    const body = [
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://chainscore.dev/',
          effectiveDirective: 'script-src',
          blockedURL: 'eval',
          disposition: 'enforce',
        },
      },
      { type: 'deprecation', body: { id: 'whatever' } },
    ]
    const reports = extractReports(body)
    expect(reports).toHaveLength(1)
    expect(reports[0].directive).toBe('script-src')
    expect(reports[0].blocked).toBe('eval')
    expect(reports[0].disposition).toBe('enforce')
  })

  it('returns empty for junk shapes instead of throwing', () => {
    expect(extractReports(null)).toEqual([])
    expect(extractReports('string')).toEqual([])
    expect(extractReports(42)).toEqual([])
    expect(extractReports({})).toEqual([])
    expect(extractReports({ 'csp-report': 'not-an-object' })).toEqual([])
    expect(extractReports([{ type: 'csp-violation' }])).toEqual([])
  })

  it('falls back to violated-directive when effective-directive is absent', () => {
    const reports = extractReports({
      'csp-report': { 'violated-directive': 'frame-src https:' },
    })
    expect(reports).toHaveLength(1)
    expect(reports[0].directive).toBe('frame-src https:')
    expect(reports[0].blocked).toBe('unknown')
  })
})
