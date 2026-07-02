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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = resolveIp(request)
  const bucket = isExpensiveRoute(pathname)
    ? 'expensive'
    : pathname.startsWith('/api/solana-rpc')
      ? 'rpc'
      : 'default'
  const limiter =
    bucket === 'expensive' ? expensiveLimiter : bucket === 'rpc' ? rpcLimiter : defaultLimiter
  const key = `${bucket}:${ip}`

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
