/**
 * lib/format.ts
 *
 * Shared, pure, dependency-free formatting helpers used across the frontend.
 * No React, no DOM, no network access, safe to import from server or client
 * code and to unit test in isolation.
 */

/**
 * Truncate an address-like string to a lead...tail form, e.g. '0x1234...abcd'.
 * Works for EVM (0x-prefixed) and Solana (base58, no prefix) addresses alike,
 * since it operates on the raw string without assuming a particular format.
 *
 * - Empty string returns ''.
 * - If the string is shorter than lead + tail + 2 (the length a truncation
 *   would produce, including the '...' separator not being a size win), it
 *   is returned unchanged since truncating would not shorten it meaningfully.
 */
export function truncateAddress(addr: string, lead = 6, tail = 4): string {
  if (!addr) return ''
  if (addr.length < lead + tail + 2) return addr
  return `${addr.slice(0, lead)}...${addr.slice(addr.length - tail)}`
}

/**
 * Format a numeric score as an integer string. A score of exactly 0 is
 * treated as "no score yet" (e.g. a brand new wallet) rather than a real
 * zero value, matching the placeholder-key/new-wallet convention used by
 * the scoring pipeline.
 */
export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return 'No score'
  if (score === 0) return 'No score'
  return String(Math.round(score))
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

/**
 * Format a timestamp as a coarse, human relative time string, e.g.
 * '5 minutes ago'. Deterministic: pass `now` explicitly to avoid relying on
 * the system clock (defaults to Date.now() when omitted).
 */
export function formatRelativeTime(from: number | Date, now: number = Date.now()): string {
  const fromMs = from instanceof Date ? from.getTime() : from
  const diff = Math.max(0, now - fromMs)

  if (diff < MINUTE_MS) return 'just now'
  if (diff < HOUR_MS) {
    const minutes = Math.floor(diff / MINUTE_MS)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  if (diff < DAY_MS) {
    const hours = Math.floor(diff / HOUR_MS)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  if (diff < MONTH_MS) {
    const days = Math.floor(diff / DAY_MS)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
  if (diff < YEAR_MS) {
    const months = Math.floor(diff / MONTH_MS)
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  const years = Math.floor(diff / YEAR_MS)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

/**
 * Format a number as compact USD currency: whole dollars for small values,
 * K/M suffixes for larger ones, no cents ever (this is for display of
 * scores/limits/volumes, not precise accounting).
 */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)

  if (abs >= 1_000_000) {
    return `${sign}$${trimTrailingZero(abs / 1_000_000)}M`
  }
  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
  }
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

function trimTrailingZero(value: number): string {
  // One decimal place, but drop it when it's a trailing .0 (e.g. 2.0M -> 2M).
  const rounded = Math.round(value * 10) / 10
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)
}

/**
 * Format a 0..1 fraction as a whole-number-by-default percentage string,
 * e.g. 0.517 -> '52%'. Non-finite input (NaN, Infinity) is treated as 0%.
 */
export function formatPct(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return '0%'
  return `${(fraction * 100).toFixed(digits)}%`
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

/**
 * Map a risk grade to the Tailwind text color utility class used
 * throughout the app (see components/ScoreBadge.tsx for the canonical
 * grade -> color mapping this mirrors).
 */
export function gradeColorClass(grade: Grade): string {
  if (grade === 'A' || grade === 'B') return 'text-accent'
  if (grade === 'C' || grade === 'D') return 'text-warning'
  return 'text-danger'
}
