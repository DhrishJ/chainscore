import { NextRequest, NextResponse } from 'next/server'
import { createRateLimiter, type RateLimitResult } from '@/lib/rateLimit'
import { createDurableRateLimiter, keyMaxRedisKey } from '@/lib/rateLimitDurable'
import { env } from '@/lib/env.server'

// When Upstash Redis credentials are present (Vercel Marketplace injects the
// KV_* names, a hand-created database the UPSTASH_* names), every bucket
// below becomes a durable shared quota across all serverless/edge instances
// (D-013). Without them, the per-instance in-memory limiter still applies as
// best-effort abuse damping.
const upstashUrl =
  env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL ?? env.Chainscore_KV_REST_API_URL
const upstashToken =
  env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN ?? env.Chainscore_KV_REST_API_TOKEN
const durableConfig =
  upstashUrl && upstashToken ? { restUrl: upstashUrl, restToken: upstashToken } : null

interface AnyLimiter {
  limit(key: string, opts?: { maxRedisKey?: string }): RateLimitResult | Promise<RateLimitResult>
}

// SHA-256 hex via WebCrypto (edge-safe). Matches lib/apiKey.ts hashKey, so
// the v1 bucket and the D-019 per-key mirror key derive from the same hash
// and no bearer-token material appears in Redis.
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function makeLimiter(prefix: string, windowMs: number, max: number): AnyLimiter {
  if (durableConfig) {
    return createDurableRateLimiter({ ...durableConfig, prefix, windowMs, max })
  }
  return createRateLimiter({ windowMs, max })
}

// Expensive routes fan out to paid third-party APIs (Etherscan, Alchemy,
// TheGraph, Helius, @vercel/og rendering), so they get a tighter budget.
const expensiveLimiter = makeLimiter('expensive', 60_000, 20)
// The Solana RPC proxy serves the wallet UI, which polls; give it headroom
// without opening the default bucket wider.
const rpcLimiter = makeLimiter('rpc', 60_000, 120)
// Everything else under /api gets a looser default budget.
const defaultLimiter = makeLimiter('default', 60_000, 60)

function resolveIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  if (request.ip) return request.ip
  return 'unknown'
}

function isExpensiveRoute(pathname: string): boolean {
  return pathname.startsWith('/api/score') || pathname.startsWith('/api/og')
}

// Authenticated partner routes. Limited per API key (by bearer token) rather
// than per IP so a key cannot multiply its budget across many IPs. The exact
// per-key ceiling stored on ApiKey.rateLimitPerMin is enforced in the route;
// this middleware bucket is a coarse abuse cap.
const v1Limiter = makeLimiter('v1', 60_000, 120)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = resolveIp(request)

  const isV1 = pathname.startsWith('/api/v1')
  const bucket = isV1
    ? 'v1'
    : isExpensiveRoute(pathname)
      ? 'expensive'
      : pathname.startsWith('/api/solana-rpc')
        ? 'rpc'
        : 'default'
  const limiter =
    bucket === 'v1'
      ? v1Limiter
      : bucket === 'expensive'
        ? expensiveLimiter
        : bucket === 'rpc'
          ? rpcLimiter
          : defaultLimiter

  // For v1, key on (a hash of) the bearer token so limiting follows the key
  // across IPs, and read the key's exact mirrored ceiling in the same Redis
  // round trip (D-019).
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  let key = `${bucket}:${ip}`
  let maxRedisKey: string | undefined
  if (isV1 && bearer) {
    const bearerHash = await sha256Hex(bearer)
    key = `v1:key:${bearerHash.slice(0, 16)}`
    maxRedisKey = keyMaxRedisKey(bearerHash)
  }

  const result = await limiter.limit(key, maxRedisKey ? { maxRedisKey } : undefined)

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfterSeconds),
          'X-RateLimit-Remaining': String(result.remaining),
        },
      }
    )
  }

  const response = NextResponse.next({
    headers: {
      'X-RateLimit-Remaining': String(result.remaining),
    },
  })
  return response
}

export const config = {
  matcher: ['/api/:path*'],
}
