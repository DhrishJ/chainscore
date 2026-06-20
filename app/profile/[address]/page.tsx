import { notFound } from 'next/navigation'
import { ScoreGauge } from '@/components/ScoreGauge'
import { ScoreBadge } from '@/components/ScoreBadge'
import Link from 'next/link'
import type { Factor } from '@/types'

export const dynamic = 'force-dynamic'

async function getProfileData(address: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const [profileRes, scoreRes] = await Promise.allSettled([
    fetch(`${baseUrl}/api/profile/${address}`, { cache: 'no-store' }),
    fetch(`${baseUrl}/api/score/${address}`, { cache: 'no-store' }),
  ])

  const profile =
    profileRes.status === 'fulfilled' && profileRes.value.ok
      ? await profileRes.value.json()
      : null
  const score =
    scoreRes.status === 'fulfilled' && scoreRes.value.ok
      ? await scoreRes.value.json()
      : null

  return { profile, score }
}

export default async function ProfilePage({
  params,
}: {
  params: { address: string }
}) {
  const { profile, score } = await getProfileData(params.address)
  if (!score) notFound()

  const displayName =
    score.ens ||
    `${params.address.slice(0, 6)}...${params.address.slice(-4)}`
  const stats = profile?.stats

  return (
    <main className="min-h-screen px-4 py-8 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Score & Reputation */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <div className="w-32 h-32 mx-auto mb-4">
              <ScoreGauge score={score.score} />
            </div>
            <h1 className="font-grotesk font-bold text-xl tracking-[-0.02em] text-text">{displayName}</h1>
            <div className="mt-2 flex justify-center">
              <ScoreBadge score={score.score} grade={score.grade} size="lg" />
            </div>
            <p className="text-muted text-sm mt-2">
              <span className="font-mono tabular-nums">{score.percentile}</span>th percentile
            </p>
            <Link
              href={`/score/${params.address}`}
              className="mt-3 inline-block text-accent text-xs hover:underline"
            >
              Full score breakdown →
            </Link>
          </div>

          {stats && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-grotesk font-semibold text-sm text-text">
                Marketplace Reputation
              </h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Loans as Lender</span>
                  <span className="font-mono tabular-nums text-text">{stats.completedLoansAsLender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Loans as Borrower</span>
                  <span className="font-mono tabular-nums text-text">{stats.completedLoansAsBorrower}</span>
                </div>
                {stats.avgRating != null && (
                  <div className="flex justify-between">
                    <span className="text-muted">Avg Rating</span>
                    <span className="font-mono tabular-nums text-accent">
                      {stats.avgRating.toFixed(1)}/5
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted">Reviews</span>
                  <span className="font-mono tabular-nums text-text">{stats.reviewCount}</span>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* Right: Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Score Factor Bars */}
          {score.factors && score.factors.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-grotesk font-semibold text-text mb-4">Score Breakdown</h2>
              <div className="space-y-4">
                {score.factors.map((f: Factor) => (
                  <div key={f.name}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-text">{f.name}</span>
                      <span className="font-mono tabular-nums text-muted">
                        {f.rawScore}/100 × {Math.round(f.weight * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${f.rawScore}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Listings */}
          {profile?.activeListings && (profile.activeListings as unknown[]).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-grotesk font-semibold text-text mb-4">Active Listings</h2>
              <div className="space-y-3">
                {(
                  profile.activeListings as Array<{
                    id: string
                    amount: number
                    currency: string
                    minAPR: number
                    maxAPR: number
                    durationDays: number
                  }>
                ).map((l) => (
                  <Link
                    key={l.id}
                    href={`/marketplace/${l.id}`}
                    className="block rounded-lg border border-border bg-background p-3 transition-all hover:border-accent/40 active:translate-y-px"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-text">
                        <span className="font-mono tabular-nums">{l.amount.toLocaleString()}</span> {l.currency}
                      </span>
                      <span className="font-mono tabular-nums text-muted">
                        {l.minAPR} to {l.maxAPR}% APR · {l.durationDays}d
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          {profile?.reviews && (profile.reviews as unknown[]).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-grotesk font-semibold text-text mb-4">Reviews</h2>
              <div className="space-y-3">
                {(
                  profile.reviews as Array<{
                    id: string
                    rating: number
                    comment: string | null
                    createdAt: string
                    reviewer: { address: string; ens: string | null }
                  }>
                ).map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted">
                        {r.reviewer.ens ||
                          `${r.reviewer.address.slice(0, 6)}...${r.reviewer.address.slice(-4)}`}
                      </span>
                      <span className="text-accent text-sm">
                        {'⭐'.repeat(r.rating)}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="text-pretty text-sm text-text">{r.comment}</p>
                    )}
                    <p className="font-mono tabular-nums text-xs text-muted mt-1">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
