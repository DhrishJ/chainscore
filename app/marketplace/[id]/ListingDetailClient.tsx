'use client'
import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useWalletStore } from '@/lib/store'
import { gradeForScore } from '@/lib/site/scoreTier'
import { useRequireEvm } from '@/components/EvmGate'
import { ScoreBadge } from '@/components/ScoreBadge'
import { ScoreGauge } from '@/components/ScoreGauge'
import { calculateOfferedAPR } from '@/lib/apr'
import { calculateFee } from '@/lib/fees'
import { requestNonce } from '@/lib/authClient'
import Link from 'next/link'

interface ScoreHistoryEntry {
  score: number
  timestamp: string
}

interface LenderProfile {
  address: string
  ens: string | null
  score: number
  grade: string
  percentile: number
  scoreHistory: ScoreHistoryEntry[]
}

interface Application {
  id: string
  borrowerAddress: string
  borrowerScore: number
  requestedAmount: number
  message: string | null
  status: string
  createdAt: string
  borrower: { address: string; ens: string | null; score: number; grade: string }
}

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
  expiresAt: string
  terms: string
  lender: LenderProfile
  applications: Application[]
}



export function ListingDetailClient({ listing }: { listing: Listing }) {
  // Wallet-dependent page: mount the deferred EVM subtree immediately and
  // hold a shell until wagmi context exists (D-032).
  const evmReady = useRequireEvm()
  if (!evmReady) return <main className="min-h-screen" />
  return <ListingDetailInner listing={listing} />
}

function ListingDetailInner({ listing }: { listing: Listing }) {
  const { address, isConnected } = useAccount()
  const { score } = useWalletStore()
  const { signMessageAsync } = useSignMessage()

  const [requestedAmount, setRequestedAmount] = useState(String(listing.amount))
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)

  const isLender = address?.toLowerCase() === listing.lenderAddress.toLowerCase()
  const borrowerScore = score?.score
  const scoreTooLow = borrowerScore != null && borrowerScore < listing.minBorrowerScore
  const offeredAPR =
    borrowerScore != null
      ? calculateOfferedAPR(
          borrowerScore,
          listing.minBorrowerScore,
          listing.minAPR,
          listing.maxAPR
        )
      : null
  const collateralNeeded =
    (parseFloat(requestedAmount) || 0) * (listing.collateralRequired / 100)
  const fee = calculateFee(parseFloat(requestedAmount) || 0)

  const lenderDisplayName =
    listing.lender.ens ||
    `${listing.lenderAddress.slice(0, 6)}...${listing.lenderAddress.slice(-4)}`

  async function handleApply(e: React.FormEvent) {
    e.preventDefault()
    if (!address) return
    setApplying(true)
    setApplyError(null)
    try {
      const { nonceId, message } = await requestNonce(address, 'apply_listing')
      const signature = await signMessageAsync({ message })
      const res = await fetch(`/api/listings/${listing.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          signature,
          nonceId,
          requestedAmount,
          applicationMessage,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setApplySuccess(true)
    } catch (e: unknown) {
      setApplyError(e instanceof Error ? e.message : 'Application failed')
    } finally {
      setApplying(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      <Link href="/marketplace" className="text-muted text-sm hover:text-text transition-colors">
        ← Back to Marketplace
      </Link>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Listing Header */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-grotesk text-3xl font-bold text-text">
                  {listing.amount.toLocaleString()} {listing.currency}
                </h1>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  <span>
                    {listing.minAPR}–{listing.maxAPR}% APR
                  </span>
                  <span>·</span>
                  <span>{listing.durationDays} days</span>
                  <span>·</span>
                  <span>{listing.collateralRequired}% collateral required</span>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium border flex-shrink-0 ${
                  listing.status === 'OPEN'
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-border bg-card text-muted'
                }`}
              >
                {listing.status}
              </span>
            </div>

            {listing.terms && (
              <div className="mt-4 p-3 rounded-lg bg-background border border-border">
                <p className="text-xs text-muted font-medium mb-1">Lender Terms</p>
                <p className="text-sm text-text">{listing.terms}</p>
              </div>
            )}

            <div className="mt-4 p-3 rounded-lg bg-background border border-border text-sm text-muted">
              <span className="text-warning font-medium">0.75% origination fee</span> applies
              to all matched loans — shown transparently before you confirm.
            </div>
          </div>

          {/* Lender Profile */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-grotesk font-semibold text-text mb-4">Lender Profile</h2>
            <div className="flex items-start gap-6">
              <div className="w-24 h-24 flex-shrink-0">
                <ScoreGauge score={listing.lender.score} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <Link
                    href={`/profile/${listing.lenderAddress}`}
                    className="font-grotesk font-semibold text-text hover:text-accent transition-colors"
                  >
                    {lenderDisplayName}
                  </Link>
                  <ScoreBadge
                    score={listing.lender.score}
                    grade={listing.lender.grade}
                    size="sm"
                  />
                </div>
                <p className="text-sm text-muted">{listing.lender.percentile}th percentile</p>
                {listing.lender.scoreHistory.length > 1 && (
                  <p className="text-xs text-muted mt-2">
                    Score trend:{' '}
                    {listing.lender.scoreHistory
                      .slice(0, 5)
                      .map((s) => s.score)
                      .join(' → ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Applications — lender only */}
          {isLender && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-grotesk font-semibold text-text mb-4">
                Applications ({listing.applications.length})
              </h2>
              {listing.applications.length === 0 ? (
                <p className="text-muted text-sm">No applications yet.</p>
              ) : (
                <div className="space-y-3">
                  {listing.applications.map((app) => (
                    <div
                      key={app.id}
                      className="rounded-lg border border-border bg-background p-4 flex items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/profile/${app.borrowerAddress}`}
                            className="text-sm font-medium text-text hover:text-accent transition-colors"
                          >
                            {app.borrower.ens ||
                              `${app.borrowerAddress.slice(0, 6)}...${app.borrowerAddress.slice(-4)}`}
                          </Link>
                          <ScoreBadge
                            score={app.borrowerScore}
                            grade={app.borrower.grade}
                            size="sm"
                          />
                        </div>
                        <p className="text-xs text-muted">
                          Requesting {app.requestedAmount.toLocaleString()} {listing.currency}
                        </p>
                        {app.message && (
                          <p className="text-xs text-muted mt-1 italic">
                            &ldquo;{app.message}&rdquo;
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full border flex-shrink-0 ${
                          app.status === 'PENDING'
                            ? 'border-warning/30 bg-warning/10 text-warning'
                            : app.status === 'ACCEPTED'
                            ? 'border-accent/30 bg-accent/10 text-accent'
                            : 'border-border text-muted'
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Application Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-xl border border-border bg-card p-5 space-y-4">
            {!isConnected ? (
              <div className="text-center py-6">
                <p className="text-sm font-medium text-text mb-1">Connect to Apply</p>
                <p className="text-xs text-muted">
                  Connect your wallet to apply for this loan.
                </p>
              </div>
            ) : isLender ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted">This is your listing.</p>
                <Link
                  href="/dashboard"
                  className="mt-2 block text-accent text-sm hover:underline"
                >
                  Manage in Dashboard →
                </Link>
              </div>
            ) : applySuccess ? (
              <div className="text-center py-6">
                <p className="text-accent font-semibold">Application submitted!</p>
                <p className="text-sm text-muted mt-1">
                  You&apos;ll be notified when the lender responds.
                </p>
                <Link
                  href="/dashboard"
                  className="mt-3 block text-accent text-sm hover:underline"
                >
                  View in Dashboard →
                </Link>
              </div>
            ) : (
              <>
                <h3 className="font-grotesk font-semibold text-text">Apply to This Loan</h3>

                {score && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Your score</span>
                    <ScoreBadge score={score.score} grade={score.grade} size="sm" />
                  </div>
                )}

                {scoreTooLow ? (
                  <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
                    <p className="text-danger text-sm font-medium">Score too low</p>
                    <p className="text-xs text-muted mt-1">
                      Minimum required: {listing.minBorrowerScore}. Your score:{' '}
                      {borrowerScore}.
                    </p>
                    <Link
                      href={`/score/${address}`}
                      className="mt-2 block text-accent text-xs hover:underline"
                    >
                      See how to improve your score →
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleApply} className="space-y-3">
                    {offeredAPR != null && (
                      <div className="rounded-lg bg-accent/5 border border-accent/20 p-3 space-y-1">
                        <p className="text-xs text-muted">Your offered APR</p>
                        <p className="text-accent font-bold text-2xl">{offeredAPR}%</p>
                        <p className="text-xs text-muted">
                          Based on your score of {borrowerScore}
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-muted block mb-1.5">
                        Requested Amount
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={requestedAmount}
                          max={listing.amount}
                          onChange={(e) => setRequestedAmount(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text pr-14 focus:outline-none focus:border-accent/50"
                        />
                        <span className="absolute right-3 top-2 text-xs text-muted">
                          {listing.currency}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-muted space-y-1.5 bg-background rounded-lg border border-border p-3">
                      <div className="flex justify-between">
                        <span>Collateral needed</span>
                        <span className="text-text">{collateralNeeded.toFixed(4)} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Origination fee</span>
                        <span className="text-warning">
                          {fee.toFixed(4)} {listing.currency}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted block mb-1.5">
                        Message to Lender (optional)
                      </label>
                      <textarea
                        rows={2}
                        value={applicationMessage}
                        onChange={(e) => setApplicationMessage(e.target.value)}
                        placeholder="Briefly describe your use case..."
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
                      />
                    </div>

                    {applyError && (
                      <p className="text-danger text-xs">{applyError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={applying}
                      className="w-full rounded-xl bg-accent text-background font-semibold py-2.5 text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {applying ? 'Signing...' : 'Apply Now'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
