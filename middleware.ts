import { NextRequest, NextResponse } from 'next/server'
import { createRateLimiter } from '@/lib/rateLimit'

// Expensive routes fan out to paid third-party APIs (Etherscan, Alchemy,
// TheGraph, Helius, @vercel/og rendering), so they get a tighter budget.
const expensiveLimiter = createRateLimiter({ windowMs: 60_000, max: 20 })
// The Solana RPC proxy serves the wallet UI, which polls; give it headroom
// without opening the default bucket wider.
const rpcLimiter = createRateLimiter({ windowMs: 60_000, max: 120 })
// Everything else under /api gets a looser default budget.
const defaultLimiter = createRateLimiter({ windowMs: 60_000, max: 60 })

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
// this middleware bucket is a coarse abuse cap. A durable, key-specific
// limiter needs a shared store (DECISIONS.md D-013).
const v1Limiter = createRateLimiter({ windowMs: 60_000, max: 120 })

export function middleware(request: NextRequest) {
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

  // For v1, key on the bearer token if present so limiting follows the key.
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').slice(0, 24)
  const key = isV1 && bearer ? `v1:key:${bearer}` : `${bucket}:${ip}`

  const result = limiter.limit(key)

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
