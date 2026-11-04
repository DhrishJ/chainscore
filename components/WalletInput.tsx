'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAddress } from 'viem'
import { CHAIN_LIST } from '@/lib/chains'
import { isSolanaAddress } from '@/lib/solanaAuth'

// One ruled field: chain, address, action.

export function WalletInput({
  placeholder = 'Wallet address or ENS name',
  defaultChain = 'ethereum',
}: {
  placeholder?: string
  defaultChain?: string
}) {
  const router = useRouter()
  const id = useId()
  const [value, setValue] = useState('')
  const [chain, setChain] = useState(defaultChain)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate(input: string): boolean {
    const trimmed = input.trim()
    if (!trimmed) {
      setError('Enter a wallet address or ENS name.')
      return false
    }
    if (chain === 'solana') {
      if (!isSolanaAddress(trimmed)) {
        setError('That is not a valid Solana address.')
        return false
      }
      return true
    }
    if (trimmed.endsWith('.eth')) return true
    if (!isAddress(trimmed)) {
      setError('That is not a valid address. Check it and try again.')
      return false
    }
    return true
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = value.trim()
    if (!validate(trimmed)) return
    setLoading(true)
    router.push(`/score/${trimmed}?chain=${chain}`)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" noValidate>
      <div className="flex flex-col border border-text/25 bg-background transition-colors focus-within:border-text sm:flex-row">
        <label htmlFor={`${id}-chain`} className="sr-only">
          Chain
        </label>
        <div className="relative border-b border-text/20 sm:border-b-0 sm:border-r">
          <select
            id={`${id}-chain`}
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            disabled={loading}
            className="h-12 w-full cursor-pointer appearance-none bg-transparent pl-4 pr-9 text-[0.9375rem] text-text outline-none sm:w-auto"
          >
            {CHAIN_LIST.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
            <option value="solana">Solana</option>
          </select>
          <span
            className="pointer-events-none absolute right-3.5 top-1/2 h-1.5 w-1.5 -translate-y-[70%] rotate-45 border-b border-r border-text/70"
            aria-hidden
          />
        </div>
        <label htmlFor={`${id}-address`} className="sr-only">
          Wallet address or ENS name
        </label>
        <input
          id={`${id}-address`}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError('')
          }}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-12 min-w-0 flex-none bg-transparent px-4 font-mono text-sm text-text outline-none placeholder:text-muted sm:flex-1"
          disabled={loading}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn btn-ink h-12 shrink-0 sm:min-w-[11.5rem]"
        >
          <span>{loading ? 'Scoring' : 'Score this wallet'}</span>
          <span className="btn-arrow" aria-hidden>
            →
          </span>
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="t-label mt-2 text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
