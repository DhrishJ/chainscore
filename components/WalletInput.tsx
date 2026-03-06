'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAddress } from 'viem'
import { CHAIN_LIST } from '@/lib/chains'

export function WalletInput({
  placeholder = 'Enter wallet address or ENS name',
  defaultChain = 'ethereum',
}: {
  placeholder?: string
  defaultChain?: string
}) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [chain, setChain] = useState(defaultChain)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate(input: string): boolean {
    const trimmed = input.trim()
    if (!trimmed) {
      setError('Please enter a wallet address or ENS name.')
      return false
    }
    if (trimmed.endsWith('.eth')) {
      return true
    }
    if (!isAddress(trimmed)) {
      setError('Invalid address. Please check and try again.')
      return false
    }
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = value.trim()

    if (!validate(trimmed)) return

    setLoading(true)
    router.push(`/score/${trimmed}?chain=${chain}`)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex gap-2">
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            disabled={loading}
            className="px-3 py-3 rounded-xl bg-card border border-border text-text text-sm outline-none focus:border-accent/60 transition-all cursor-pointer"
          >
            {CHAIN_LIST.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError('')
            }}
            placeholder={placeholder}
            className={`flex-1 px-4 py-3 rounded-xl bg-card border text-text placeholder-muted outline-none transition-all text-sm sm:text-base
              ${error ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/60'}`}
            disabled={loading}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="px-6 py-3 rounded-xl bg-accent text-background font-semibold text-sm sm:text-base transition-all
            hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap font-grotesk"
        >
          {loading ? 'Loading…' : 'Check Score'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-danger text-sm">{error}</p>
      )}
    </form>
  )
}
