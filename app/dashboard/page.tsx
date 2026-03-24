'use client'
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useWalletStore } from '@/lib/store'
import { ScoreBadge } from '@/components/ScoreBadge'
import { ScoreGauge } from '@/components/ScoreGauge'
import Link from 'next/link'

const TABS = ['Overview', 'My Listings', 'My Applications', 'Active Loans', 'History'] as const
type Tab = (typeof TABS)[number]

interface DashboardStats {
  totalLent: number
  totalBorrowed: number
  completedLoans: number
  avgRating: number | null
  totalListings: number
}

interface Listing {
  id: string
  amount: number
  currency: string
  status: string
  _count: { applications: number }
}

interface Application {
  id: string
  requestedAmount: number
  status: string
  listing: {
    id: string
    amount: number
    currency: string
    lender: { ens: string | null; score: number }
  }
}

interface ActiveLoan {
  id: string
  amount: number
  currency: string
  APR: number
  dueDate: string
  lenderAddress: string
  borrower: { address: string; ens: string | null }
  lender: { address: string; ens: string | null }
}

interface HistoricalLoan {
  id: string
  amount: number
  currency: string
  status: string
  startDate: string
}

interface DashboardData {
  stats: DashboardStats
  listings: Listing[]
  applications: Application[]
  activeLoans: ActiveLoan[]
  loanHistory: HistoricalLoan[]
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount()
  const { score } = useWalletStore()
  const [tab, setTab] = useState<Tab>('Overview')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) return
    setLoading(true)
    fetch(`/api/dashboard/${address}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  if (!isConnected) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="rounded-2xl border border-border bg-card p-8 max-w-md w-full text-center">
          <p className="text-text font-grotesk font-semibold mb-2">Connect Your Wallet</p>
          <p className="text-muted text-sm">Connect your wallet to view your dashboard.</p>
        </div>
      </main>
    )
  }

  const stats = data?.stats
  const listings = data?.listings || []
  const applications = data?.applications || []
  const activeLoans = data?.activeLoans || []
  const loanHistory = data?.loanHistory || []

  return (
    <main className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      <h1 className="font-grotesk text-3xl font-bold text-text mb-6">Dashboard</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-muted animate-pulse text-sm">Loading dashboard...</div>
      )}

      {!loading && tab === 'Overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {score && (
              <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4 sm:col-span-2">
                <div className="w-20 h-20 flex-shrink-0">
                  <ScoreGauge score={score.score} />
                </div>
                <div>
                  <p className="text-muted text-xs mb-1">Your ChainScore</p>
                  <div className="flex items-center gap-2">
                    <span className="font-grotesk text-3xl font-bold text-text">
                      {score.score}
                    </span>
                    <ScoreBadge score={score.score} grade={score.grade} size="sm" />
                  </div>
                  <p className="text-xs text-muted mt-1">{score.percentile}th percentile</p>
                </div>
              </div>
            )}
            {[
              {
                label: 'Total Lent',
                value: stats?.totalLent ? `$${stats.totalLent.toLocaleString()}` : '—',
              },
              {
                label: 'Total Borrowed',
                value: stats?.totalBorrowed ? `$${stats.totalBorrowed.toLocaleString()}` : '—',
              },
              {
                label: 'Loans Completed',
                value: stats?.completedLoans ?? '—',
              },
              {
                label: 'Avg Rating',
                value:
                  stats?.avgRating != null ? `${stats.avgRating.toFixed(1)}/5 ⭐` : '—',
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs text-muted mb-1">{stat.label}</p>
                <p className="font-grotesk text-2xl font-bold text-text">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/marketplace/create"
              className="rounded-xl bg-accent text-background font-semibold px-5 py-2.5 text-sm hover:bg-accent/90 transition-colors"
            >
              Post a Listing
            </Link>
            <Link
              href="/marketplace"
              className="rounded-xl border border-border text-text font-medium px-5 py-2.5 text-sm hover:border-accent/30 transition-colors"
            >
              Browse Loans
            </Link>
            <Link
              href={`/score/${address}`}
              className="rounded-xl border border-border text-muted font-medium px-5 py-2.5 text-sm hover:border-accent/30 hover:text-text transition-colors"
            >
              View Score Details
            </Link>
          </div>
        </div>
      )}

      {!loading && tab === 'My Listings' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted">
              {listings.length} listing{listings.length !== 1 ? 's' : ''}
            </p>
            <Link
              href="/marketplace/create"
              className="text-accent text-sm hover:underline"
            >
              + New listing
            </Link>
          </div>
          {listings.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-muted text-sm">No listings yet.</p>
              <Link
                href="/marketplace/create"
                className="mt-3 inline-block text-accent text-sm hover:underline"
              >
                Post your first listing →
              </Link>
            </div>
          ) : (
            listings.map((l) => (
              <div
                key={l.id}
                className="rounded-xl border border-border bg-card p-4 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-text">
                    {l.amount.toLocaleString()} {l.currency}
                  </span>
                  <span className="ml-3 text-xs text-muted">
                    {l._count.applications} application
                    {l._count.applications !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      l.status === 'OPEN'
                        ? 'border-accent/30 text-accent'
                        : 'border-border text-muted'
                    }`}
                  >
                    {l.status}
                  </span>
                  <Link
                    href={`/marketplace/${l.id}`}
                    className="text-accent text-xs hover:underline"
                  >
                    View →
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'My Applications' && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-muted text-sm">No applications yet.</p>
              <Link
                href="/marketplace"
                className="mt-3 inline-block text-accent text-sm hover:underline"
              >
                Browse loans →
              </Link>
            </div>
          ) : (
            applications.map((app) => (
              <div
                key={app.id}
                className="rounded-xl border border-border bg-card p-4 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-text">
                    {app.requestedAmount.toLocaleString()} {app.listing.currency}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    from{' '}
                    {app.listing.lender.ens ||
                      `Score ${app.listing.lender.score}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      app.status === 'PENDING'
                        ? 'border-warning/30 text-warning'
                        : app.status === 'ACCEPTED'
                        ? 'border-accent/30 text-accent'
                        : 'border-border text-muted'
                    }`}
                  >
                    {app.status}
                  </span>
                  <Link
                    href={`/marketplace/${app.listing.id}`}
                    className="text-accent text-xs hover:underline"
                  >
                    View →
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'Active Loans' && (
        <div className="space-y-4">
          {activeLoans.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-muted text-sm">No active loans.</p>
            </div>
          ) : (
            activeLoans.map((loan) => {
              const isLender =
                loan.lenderAddress.toLowerCase() === address?.toLowerCase()
              const counterparty = isLender ? loan.borrower : loan.lender
              const daysLeft = Math.ceil(
                (new Date(loan.dueDate).getTime() - Date.now()) / 86400000
              )
              return (
                <div
                  key={loan.id}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-grotesk font-bold text-text">
                        {loan.amount.toLocaleString()} {loan.currency}
                      </span>
                      <span className="ml-2 text-sm text-muted">at {loan.APR}% APR</span>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        daysLeft <= 3
                          ? 'text-danger'
                          : daysLeft <= 7
                          ? 'text-warning'
                          : 'text-muted'
                      }`}
                    >
                      {daysLeft > 0 ? `${daysLeft} days remaining` : 'Overdue'}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {isLender ? 'Borrower' : 'Lender'}:{' '}
                    {counterparty.ens ||
                      `${counterparty.address.slice(0, 6)}...${counterparty.address.slice(-4)}`}
                  </p>
                </div>
              )
            })
          )}
        </div>
      )}

      {!loading && tab === 'History' && (
        <div className="space-y-4">
          {loanHistory.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-muted text-sm">No completed loans yet.</p>
            </div>
          ) : (
            loanHistory.map((loan) => (
              <div
                key={loan.id}
                className="rounded-xl border border-border bg-card p-4 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-text">
                    {loan.amount.toLocaleString()} {loan.currency}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {new Date(loan.startDate).toLocaleDateString()}
                  </span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    loan.status === 'REPAID'
                      ? 'border-accent/30 text-accent'
                      : 'border-danger/30 text-danger'
                  }`}
                >
                  {loan.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  )
}
