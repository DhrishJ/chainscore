import Link from 'next/link'
import { addressParamSchema } from '@/lib/validation'
import { clientEnv } from '@/lib/env.client'

// NOTE: this route intentionally relies on the global `X-Frame-Options:
// SAMEORIGIN` header set in next.config.js and does not override it here.
// That means this widget can currently only be iframed from chainscore's own
// origin. True third-party embedding (partners iframing this on their own
// domains) will require a later hardening pass that relaxes/replaces the
// frame-ancestors policy for this specific route.
export const dynamic = 'force-dynamic'

interface ScoreResult {
  score: number
  grade: string
  ens?: string | null
  percentile?: number
}

function tierLabel(grade: string): string {
  switch (grade) {
    case 'A': return 'Excellent'
    case 'B': return 'Good'
    case 'C': return 'Fair'
    case 'D': return 'Poor'
    default: return 'Very Poor'
  }
}

function tierClasses(grade: string): string {
  switch (grade) {
    case 'A':
    case 'B':
      return 'text-accent border-accent/30 bg-accent/10'
    case 'C':
    case 'D':
      return 'text-warning border-warning/30 bg-warning/10'
    default:
      return 'text-danger border-danger/30 bg-danger/10'
  }
}

async function getScore(address: string): Promise<ScoreResult | null> {
  const base = clientEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/score/${address}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as ScoreResult
  } catch {
    return null
  }
}

export default async function EmbedPage({
  params,
}: {
  params: { address: string }
}) {
  const parsed = addressParamSchema.safeParse(params.address)

  if (!parsed.success) {
    return (
      <div className="flex items-center justify-center min-h-[120px] p-4 font-sans">
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted">
          Invalid address
        </div>
      </div>
    )
  }

  const score = await getScore(params.address)

  if (!score) {
    return (
      <div className="flex items-center justify-center min-h-[120px] p-4 font-sans">
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted">
          Score unavailable
        </div>
      </div>
    )
  }

  const displayName =
    score.ens || `${params.address.slice(0, 6)}...${params.address.slice(-4)}`

  return (
    <div className="p-3 font-sans">
      <div className="rounded-xl border border-border bg-card p-4 max-w-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted truncate">{displayName}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono tabular-nums text-2xl font-bold text-text">
                {score.score}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tierClasses(score.grade)}`}
              >
                {score.grade} · {tierLabel(score.grade)}
              </span>
            </div>
            {typeof score.percentile === 'number' && (
              <p className="mt-1 text-xs text-muted">
                <span className="font-mono tabular-nums">{score.percentile}</span>th percentile
              </p>
            )}
          </div>
        </div>
        <Link
          href={`/score/${params.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-center text-xs text-accent hover:underline"
        >
          Powered by ChainScore
        </Link>
      </div>
    </div>
  )
}
