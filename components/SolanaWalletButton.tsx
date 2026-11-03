'use client'
import { stylesForGrade } from '@/lib/site/scoreTier'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useEffect } from 'react'
import { useWalletStore } from '@/lib/store'
import Link from 'next/link'

function SolScorePill({ score, grade }: { score: number; grade: string }) {
  const color = stylesForGrade(grade).pill
  return (
    <span className={`t-label inline-flex items-center gap-1 border px-2 py-1 ${color}`}>
      {score} <span className="opacity-60">{grade}</span>
    </span>
  )
}

export function SolanaWalletButton() {
  const { publicKey, connected, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const { solanaScore, setSolanaAddress, setSolanaScore, setLoadingSolanaScore } = useWalletStore()

  const address = publicKey?.toBase58() ?? null

  useEffect(() => {
    if (!connected || !address) {
      setSolanaAddress(null)
      setSolanaScore(null)
      return
    }
    setSolanaAddress(address)
    if (solanaScore?.address === address) return
    setLoadingSolanaScore(true)
    fetch(`/api/score/${address}?chain=solana`)
      .then((r) => r.json())
      .then((data) => { setSolanaScore(data); setLoadingSolanaScore(false) })
      .catch(() => setLoadingSolanaScore(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, connected])

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="t-label h-9 border border-text/25 px-3 text-muted transition-colors hover:border-text/60 hover:text-text"
      >
        Solana
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {solanaScore && !solanaScore.newWallet && (
        <Link href={`/score/${address}?chain=solana`}>
          <SolScorePill score={solanaScore.score} grade={solanaScore.grade} />
        </Link>
      )}
      <button
        onClick={() => disconnect()}
        className="t-label flex h-9 items-center gap-1.5 border border-text/25 px-3 text-muted transition-colors hover:border-text/60 hover:text-text"
        title="Disconnect Solana wallet"
      >
        <span className="inline-block h-1.5 w-1.5 bg-success" aria-hidden />
        {address?.slice(0, 4)}…{address?.slice(-4)}
      </button>
    </div>
  )
}
