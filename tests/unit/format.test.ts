import { describe, expect, it } from 'vitest'
import {
  formatPct,
  formatRelativeTime,
  formatScore,
  formatUsd,
  gradeColorClass,
  truncateAddress,
} from '@/lib/format'

describe('lib/format truncateAddress', () => {
  it('truncates a standard EVM address to lead...tail', () => {
    expect(truncateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA9604')).toBe('0xd8dA...9604')
  })

  it('truncates a non-0x Solana (base58) address the same way', () => {
    expect(truncateAddress('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1')).toBe('5Q544f...e4j1')
  })

  it('returns an empty string unchanged', () => {
    expect(truncateAddress('')).toBe('')
  })

  it('returns short strings as-is instead of truncating them', () => {
    expect(truncateAddress('0xAbC1')).toBe('0xAbC1')
  })

  it('returns the string as-is right at the boundary (length === lead+tail+1)', () => {
    // lead=6, tail=4 -> boundary length is 6+4+1 = 11, still shorter than 12
    const addr = '0123456789a' // length 11
    expect(truncateAddress(addr)).toBe(addr)
  })

  it('truncates once the string reaches lead+tail+2 length', () => {
    const addr = '0123456789ab' // length 12
    expect(truncateAddress(addr)).toBe('012345...89ab')
  })

  it('honors custom lead/tail values', () => {
    expect(truncateAddress('0x1234567890abcdef', 4, 2)).toBe('0x12...ef')
  })
})

describe('lib/format formatScore', () => {
  it('formats a positive score as an integer string', () => {
    expect(formatScore(742)).toBe('742')
  })

  it('rounds a non-integer score', () => {
    expect(formatScore(742.6)).toBe('743')
  })

  it('treats a score of 0 as "No score"', () => {
    expect(formatScore(0)).toBe('No score')
  })

  it('treats NaN as "No score"', () => {
    expect(formatScore(NaN)).toBe('No score')
  })
})

describe('lib/format formatRelativeTime', () => {
  const now = new Date('2026-07-04T12:00:00.000Z').getTime()

  it('returns "just now" for a timestamp under a minute old', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('just now')
  })

  it('returns "just now" for exactly now', () => {
    expect(formatRelativeTime(now, now)).toBe('just now')
  })

  it('handles a Date instance as input', () => {
    expect(formatRelativeTime(new Date(now - 30_000), now)).toBe('just now')
  })

  it('pluralizes minutes correctly', () => {
    expect(formatRelativeTime(now - 60_000, now)).toBe('1 minute ago')
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 minutes ago')
  })

  it('crosses the minute/hour boundary', () => {
    expect(formatRelativeTime(now - 59 * 60_000, now)).toBe('59 minutes ago')
    expect(formatRelativeTime(now - 60 * 60_000, now)).toBe('1 hour ago')
  })

  it('pluralizes hours correctly', () => {
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe('3 hours ago')
  })

  it('crosses the hour/day boundary', () => {
    expect(formatRelativeTime(now - 23 * 60 * 60_000, now)).toBe('23 hours ago')
    expect(formatRelativeTime(now - 24 * 60 * 60_000, now)).toBe('1 day ago')
  })

  it('pluralizes days correctly', () => {
    expect(formatRelativeTime(now - 5 * 24 * 60 * 60_000, now)).toBe('5 days ago')
  })

  it('crosses the day/month boundary', () => {
    const twentyNineDays = 29 * 24 * 60 * 60_000
    const thirtyDays = 30 * 24 * 60 * 60_000
    expect(formatRelativeTime(now - twentyNineDays, now)).toBe('29 days ago')
    expect(formatRelativeTime(now - thirtyDays, now)).toBe('1 month ago')
  })

  it('pluralizes months correctly', () => {
    const fourMonths = 4 * 30 * 24 * 60 * 60_000
    expect(formatRelativeTime(now - fourMonths, now)).toBe('4 months ago')
  })

  it('crosses the month/year boundary', () => {
    const elevenMonths = 11 * 30 * 24 * 60 * 60_000
    const oneYear = 365 * 24 * 60 * 60_000
    expect(formatRelativeTime(now - elevenMonths, now)).toBe('11 months ago')
    expect(formatRelativeTime(now - oneYear, now)).toBe('1 year ago')
  })

  it('pluralizes years correctly', () => {
    const threeYears = 3 * 365 * 24 * 60 * 60_000
    expect(formatRelativeTime(now - threeYears, now)).toBe('3 years ago')
  })

  it('treats a future timestamp as "just now" rather than negative', () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe('just now')
  })

  it('defaults `now` to the current time when omitted', () => {
    expect(formatRelativeTime(Date.now() - 1000)).toBe('just now')
  })
})

describe('lib/format formatUsd', () => {
  it('formats zero', () => {
    expect(formatUsd(0)).toBe('$0')
  })

  it('formats a plain 4-digit amount with thousands separators, uncompacted', () => {
    expect(formatUsd(1234)).toBe('$1,234')
  })

  it('formats a large 6-digit amount with thousands separators, still uncompacted', () => {
    expect(formatUsd(999999)).toBe('$999,999')
  })

  it('compacts to millions at the 1,000,000 boundary', () => {
    expect(formatUsd(1_000_000)).toBe('$1M')
  })

  it('compacts a non-round million value with one decimal place', () => {
    expect(formatUsd(1_500_000)).toBe('$1.5M')
  })

  it('drops a trailing .0 when the millions value is round', () => {
    expect(formatUsd(2_000_000)).toBe('$2M')
  })

  it('formats negative values with a leading minus before the dollar sign', () => {
    expect(formatUsd(-1234)).toBe('-$1,234')
  })

  it('treats NaN as $0', () => {
    expect(formatUsd(NaN)).toBe('$0')
  })
})

describe('lib/format formatPct', () => {
  it('formats a fraction as a whole-number percent by default', () => {
    expect(formatPct(0.517)).toBe('52%')
  })

  it('formats 0 as 0%', () => {
    expect(formatPct(0)).toBe('0%')
  })

  it('formats 1 as 100%', () => {
    expect(formatPct(1)).toBe('100%')
  })

  it('supports extra digits of precision', () => {
    expect(formatPct(0.517, 1)).toBe('51.7%')
  })

  it('guards against NaN', () => {
    expect(formatPct(NaN)).toBe('0%')
  })

  it('guards against Infinity', () => {
    expect(formatPct(Infinity)).toBe('0%')
  })
})

describe('lib/format gradeColorClass', () => {
  it('maps grade A to the accent color', () => {
    expect(gradeColorClass('A')).toBe('text-accent')
  })

  it('maps grade B to the accent color', () => {
    expect(gradeColorClass('B')).toBe('text-accent')
  })

  it('maps grade C to the warning color', () => {
    expect(gradeColorClass('C')).toBe('text-warning')
  })

  it('maps grade D to the warning color', () => {
    expect(gradeColorClass('D')).toBe('text-warning')
  })

  it('maps grade F to the danger color', () => {
    expect(gradeColorClass('F')).toBe('text-danger')
  })
})
