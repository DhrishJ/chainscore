'use client'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useWalletStore } from '@/lib/store'
import { useSignMessage } from 'wagmi'
import { ScoreBadge } from '@/components/ScoreBadge'
import { calculateOfferedAPR } from '@/lib/apr'
import { calculateFee } from '@/lib/fees'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const CURRENCIES = ['USDC', 'USDT', 'DAI', 'ETH']

export default function CreateListingPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { score } = useWalletStore()
  const { signMessageAsync } = useSignMessage()

  const [form, setForm] = useState({
    amount: '',
    currency: 'USDC',
    minAPR: 5,
    maxAPR: 20,
    durationDays: 30,
    minBorrowerScore: 550,
    collateralRequired: 150,
    expiresAt: '',
    terms: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const fee = form.amount ? calculateFee(parseFloat(form.amount) || 0) : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!address || !isConnected) return
    setSubmitting(true)
    setError(null)

    try {
      const nonce = Math.random().toString(36).slice(2)
      const message = `ChainScore: Create Loan Listing\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString().split('T')[0]}`
      const signature = await signMessageAsync({ message })

      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature, message, listing: form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create listing')

      setSuccess(true)
      setTimeout(() => router.push(`/marketplace/${data.id}`), 1500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isConnected) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="rounded-2xl border border-border bg-card p-8 max-w-md w-full text-center">
          <p className="text-text font-grotesk font-semibold mb-2">Connect Your Wallet</p>
          <p className="text-muted text-sm">You need to connect a wallet to post a listing.</p>
        </div>
      </main>
    )
  }

  if (score && score.score < 500) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="rounded-2xl border border-border bg-card p-8 max-w-md w-full text-center">
          <p className="text-text font-grotesk font-semibold mb-2">Score Too Low</p>
          <p className="text-muted text-sm mb-4">
            A ChainScore of 500+ is required to post a listing. Your current score is{' '}
            {score.score}.
          </p>
          <Link href={`/score/${address}`} className="text-accent text-sm hover:underline">
            View your score breakdown →
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <Link
          href="/marketplace"
          className="text-muted text-sm hover:text-text transition-colors"
        >
          ← Back to Marketplace
        </Link>
        <h1 className="font-grotesk text-3xl font-bold text-text mt-2">Post a Loan Listing</h1>
        {score && (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted">
            Your score: <ScoreBadge score={score.score} grade={score.grade} size="sm" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-grotesk font-semibold text-text">Loan Terms</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted block mb-1.5">Amount</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 10000"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1.5">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1.5">
                  Min APR: {form.minAPR}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={form.minAPR}
                  onChange={(e) => setForm((f) => ({ ...f, minAPR: parseFloat(e.target.value) }))}
                  className="w-full accent-[#00FF94]"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1.5">
                  Max APR: {form.maxAPR}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={form.maxAPR}
                  onChange={(e) => setForm((f) => ({ ...f, maxAPR: parseFloat(e.target.value) }))}
                  className="w-full accent-[#00FF94]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted block mb-1.5">
                  Duration: {form.durationDays} days
                </label>
                <input
                  type="range"
                  min="7"
                  max="365"
                  value={form.durationDays}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, durationDays: parseInt(e.target.value) }))
                  }
                  className="w-full accent-[#00FF94]"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1.5">
                  Collateral: {form.collateralRequired}%
                </label>
                <input
                  type="range"
                  min="100"
                  max="200"
                  value={form.collateralRequired}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, collateralRequired: parseInt(e.target.value) }))
                  }
                  className="w-full accent-[#00FF94]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted block mb-1.5">
                Minimum Borrower Score: {form.minBorrowerScore}
              </label>
              <input
                type="range"
                min="300"
                max="850"
                value={form.minBorrowerScore}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minBorrowerScore: parseInt(e.target.value) }))
                }
                className="w-full accent-[#00FF94]"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>300 (F)</span>
                <span>550 (C)</span>
                <span>750 (A)</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted block mb-1.5">Listing Expires</label>
              <input
                type="datetime-local"
                required
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
              />
            </div>

            <div>
              <label className="text-xs text-muted block mb-1.5">
                Custom Terms (optional)
              </label>
              <textarea
                rows={3}
                placeholder="Any additional terms or requirements..."
                value={form.terms}
                onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
              />
            </div>
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}
          {success && (
            <p className="text-accent text-sm">Listing created! Redirecting to listing page...</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-accent text-background font-semibold py-3 text-sm hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing & Posting...' : 'Post Listing'}
          </button>
        </form>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-20 rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-grotesk font-semibold text-text text-sm">Preview</h2>
            <div className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-grotesk font-bold text-xl text-text">
                  {form.amount ? parseFloat(form.amount).toLocaleString() : '—'} {form.currency}
                </span>
                {score && (
                  <ScoreBadge score={score.score} grade={score.grade} size="sm" />
                )}
              </div>
              <div className="space-y-1.5 text-sm text-muted">
                <div className="flex justify-between">
                  <span>APR range</span>
                  <span className="text-text">
                    {form.minAPR}% – {form.maxAPR}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span className="text-text">{form.durationDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Collateral required</span>
                  <span className="text-text">{form.collateralRequired}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Min borrower score</span>
                  <span className="text-text">{form.minBorrowerScore}</span>
                </div>
                {form.amount && (
                  <div className="flex justify-between border-t border-border pt-2 mt-2">
                    <span>Origination fee (0.75%)</span>
                    <span className="text-warning">
                      {fee.toFixed(4)} {form.currency}
                    </span>
                  </div>
                )}
              </div>
              {form.amount && borrowerPreviewAPR(form) && (
                <p className="text-xs text-muted border-t border-border pt-2">
                  Borrower at min score pays{' '}
                  <span className="text-text">{form.maxAPR}% APR</span>
                  {' '}· at score 850 pays{' '}
                  <span className="text-accent">{form.minAPR}% APR</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function borrowerPreviewAPR(form: { amount: string }) {
  return form.amount && parseFloat(form.amount) > 0
}
