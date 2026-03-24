'use client'
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useWalletStore } from '@/lib/store'
import { ScoreBadge } from '@/components/ScoreBadge'
import Link from 'next/link'
import { calculateOfferedAPR } from '@/lib/apr'

interface Listing {
  id: string
  lenderAddress: string
  lenderScore: number
  amount: number
  currency: string
  minAPR: number
  maxAPR: number
  durationDays: number
  minBorrowerScore: number
  collateralRequired: number
  status: string
  createdAt: string
  expiresAt: string
  terms: string
  lender: { ens: string | null; score: number }
}

const CURRENCIES = ['All', 'USDC', 'USDT', 'DAI', 'ETH']
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'lowest_apr', label: 'Lowest APR' },
  { value: 'highest_lender_score', label: 'Highest Lender Score' },
  { value: 'amount', label: 'Highest Amount' },
]

function gradeFromScore(score: number): string {
  if (score >= 750) return 'A'
  if (score >= 650) return 'B'
  if (score >= 550) return 'C'
  if (score >= 450) return 'D'
  return 'F'
}

function timeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days}d ${hours}h left`
  return `${hours}h left`
}

export function MarketplaceClient() {
  const { score } = useWalletStore()
  const { isConnected } = useAccount()

  const [listings, setListings] = useState<Listing[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [currency, setCurrency] = useState('All')
  const [sort, setSort] = useState('newest')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [minLenderScore, setMinLenderScore] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort, page: String(page) })
    if (currency !== 'All') params.set('currency', currency)
    if (minAmount) params.set('minAmount', minAmount)
    if (maxAmount) params.set('maxAmount', maxAmount)
    if (minLenderScore) params.set('minLenderScore', minLenderScore)

    fetch(`/api/listings?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setListings(data.listings || [])
        setTotal(data.total || 0)
      })
      .catch(() => setListings([]))
      .finally(() => setLoading(false))
  }, [currency, sort, page, minAmount, maxAmount, minLenderScore])

  const borrowerScore = score?.score
  const pages = Math.ceil(total / 20)

  return (
    <div className="flex gap-6">
      {/* Filter Sidebar */}
      <aside className="hidden lg:block w-56 flex-shrink-0">
        <div className="rounded-xl border border-border bg-card p-4 space-y-5">
          <h3 className="font-grotesk font-semibold text-text text-sm">Filters</h3>

          <div>
            <label className="text-xs text-muted mb-2 block">Currency</label>
            <div className="flex flex-wrap gap-1.5">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCurrency(c); setPage(1) }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    currency === c
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-border text-muted hover:border-text/40'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-2 block">Amount Range</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={minAmount}
                onChange={(e) => { setMinAmount(e.target.value); setPage(1) }}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
              <input
                type="number"
                placeholder="Max"
                value={maxAmount}
                onChange={(e) => { setMaxAmount(e.target.value); setPage(1) }}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-2 block">Min Lender Score</label>
            <input
              type="number"
              placeholder="e.g. 600"
              value={minLenderScore}
              onChange={(e) => { setMinLenderScore(e.target.value); setPage(1) }}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
          </div>

          {(currency !== 'All' || minAmount || maxAmount || minLenderScore) && (
            <button
              onClick={() => {
                setCurrency('All')
                setMinAmount('')
                setMaxAmount('')
                setMinLenderScore('')
                setPage(1)
              }}
              className="text-xs text-muted hover:text-text transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Sort bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted">
            {total} listing{total !== 1 ? 's' : ''}
            {!isConnected && (
              <span className="ml-2 text-xs">
                — connect wallet to see your eligible rate
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Sort:</span>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1) }}
              className="rounded-lg border border-border bg-card text-text text-xs px-2.5 py-1.5 focus:outline-none focus:border-accent/50"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && (
          <div className="grid gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 rounded-xl border border-border bg-card animate-pulse"
              />
            ))}
          </div>
        )}

        {!loading && listings.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-muted text-sm">No listings match your filters.</p>
            <Link
              href="/marketplace/create"
              className="mt-4 inline-block text-accent text-sm hover:underline"
            >
              Be the first to post a listing →
            </Link>
          </div>
        )}

        {!loading && listings.length > 0 && (
          <div className="grid gap-4">
            {listings.map((listing) => {
              const grade = gradeFromScore(listing.lenderScore)
              const scoreTooLow =
                borrowerScore != null && borrowerScore < listing.minBorrowerScore
              const offeredAPR =
                borrowerScore != null
                  ? calculateOfferedAPR(
                      borrowerScore,
                      listing.minBorrowerScore,
                      listing.minAPR,
                      listing.maxAPR
                    )
                  : null

              return (
                <Link key={listing.id} href={`/marketplace/${listing.id}`}>
                  <div
                    className={`rounded-xl border bg-card p-5 hover:border-accent/30 transition-colors cursor-pointer ${
                      scoreTooLow ? 'opacity-60 border-border' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="font-grotesk font-bold text-xl text-text">
                            {listing.amount.toLocaleString()} {listing.currency}
                          </span>
                          {scoreTooLow && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/10 text-danger px-2 py-0.5 text-xs font-medium">
                              🔒 Score too low
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                          <span>
                            {listing.minAPR}–{listing.maxAPR}% APR
                          </span>
                          <span>·</span>
                          <span>{listing.durationDays}d</span>
                          <span>·</span>
                          <span>{listing.collateralRequired}% collateral</span>
                          <span>·</span>
                          <span>Min score {listing.minBorrowerScore}</span>
                        </div>
                        {offeredAPR != null && !scoreTooLow && (
                          <p className="mt-2 text-xs text-accent">
                            Your rate: {offeredAPR}% APR
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <ScoreBadge score={listing.lenderScore} grade={grade} size="sm" />
                        <span className="text-xs text-muted">
                          {timeRemaining(listing.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:border-text/40 disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-muted">
              {page} / {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted hover:border-text/40 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
