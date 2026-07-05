import { z } from 'zod'
import { NextResponse } from 'next/server'

// Reusable zod schemas and helpers for validating input on read-only (GET)
// API routes. Keeping these centralized means every route applies the same
// shape checks, instead of each route hand-rolling its own regex.

// ── Address schemas ─────────────────────────────────────────────────────────

// Shape-only check, lowercased for consistent lookups (e.g. Prisma `address`
// columns are stored lowercase). Does not checksum-validate.
export const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address')
  .transform((value) => value.toLowerCase())

// Base58, 32-44 characters, and never 0x-prefixed (the base58 alphabet
// already excludes '0', so the explicit check is a defense-in-depth
// backstop rather than a functional necessity).
export const solanaAddressSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address')
  .refine((value) => !value.startsWith('0x'), { message: 'Invalid Solana address' })

// ENS names are matched case-insensitively but not normalized here, callers
// that need the resolved address should still perform ENS resolution
// themselves.
export const ensNameSchema = z
  .string()
  .max(64, 'Invalid ENS name')
  .regex(/^[a-z0-9-]+\.eth$/i, 'Invalid ENS name')

// Accepts an EVM address, a Solana address, or an ENS name. Used by routes
// that resolve ENS names themselves (e.g. the score route).
export const addressParamSchema = z.union([evmAddressSchema, solanaAddressSchema, ensNameSchema])

// Accepts an EVM address or a Solana address, no ENS. Used by routes that
// look wallets up directly (profile, dashboard, notifications).
export const evmOrSolanaAddressSchema = z.union([evmAddressSchema, solanaAddressSchema])

// Loose cuid-like identifier check for Prisma `cuid()` primary keys.
export const cuidSchema = z.string().regex(/^[a-z0-9]{20,32}$/, 'Invalid id')

// ── Chain schema ─────────────────────────────────────────────────────────

export const CHAIN_SLUGS = [
  'ethereum',
  'polygon',
  'arbitrum',
  'optimism',
  'base',
  'avalanche',
  'bnb',
  'solana',
] as const

export type ChainSlug = (typeof CHAIN_SLUGS)[number]

export const chainSlugSchema = z.enum(CHAIN_SLUGS).default('ethereum')

// ── Pagination ───────────────────────────────────────────────────────────

// Coerces, clamps to [1, 10000], and silently falls back to 1 on anything
// unparseable, missing, or out of range. Intended for query params where a
// bad value should degrade gracefully rather than 400.
export const paginationSchema = z.coerce.number().int().min(1).max(10000).catch(1)

// ── Listings query ───────────────────────────────────────────────────────

// Query params for GET /api/listings. currency/amount/APR/duration/score are
// intentionally strict (bad values 400), while sort/page degrade to sane
// defaults so a malformed sort or page never blocks browsing the market.
export const listingsQuerySchema = z.object({
  currency: z
    .string()
    .max(16, 'Invalid currency')
    .regex(/^[A-Za-z0-9]+$/, 'Invalid currency')
    .optional(),
  minAmount: z.coerce.number().finite('Invalid minAmount').min(0, 'Invalid minAmount').optional(),
  maxAmount: z.coerce.number().finite('Invalid maxAmount').min(0, 'Invalid maxAmount').optional(),
  minAPR: z.coerce.number().finite('Invalid minAPR').min(0, 'Invalid minAPR').optional(),
  maxAPR: z.coerce.number().finite('Invalid maxAPR').min(0, 'Invalid maxAPR').optional(),
  minDuration: z.coerce.number().int('Invalid minDuration').min(0, 'Invalid minDuration').optional(),
  maxDuration: z.coerce.number().int('Invalid maxDuration').min(0, 'Invalid maxDuration').optional(),
  minLenderScore: z.coerce
    .number()
    .int('Invalid minLenderScore')
    .min(0, 'Invalid minLenderScore')
    .max(1000, 'Invalid minLenderScore')
    .optional(),
  chain: z.enum(['EVM', 'SOLANA']).optional(),
  sort: z.enum(['newest', 'lowest_apr', 'highest_lender_score', 'amount']).catch('newest'),
  page: paginationSchema,
})

// ── Result helper ────────────────────────────────────────────────────────

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

export function parseOrError<T>(schema: z.ZodType<T>, data: unknown): ParseResult<T> {
  const result = schema.safeParse(data)
  if (result.success) {
    return { ok: true, data: result.data }
  }
  const message = result.error.issues[0]?.message ?? 'Invalid input'
  return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) }
}
