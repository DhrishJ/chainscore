'use client'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useEffect } from 'react'
import { useWalletStore } from '@/lib/store'
import Link from 'next/link'

// The wagmi/RainbowKit half of the navbar connect button. Must only be
// imported dynamically (see WalletConnectButton.tsx): a static import here
// would pull the whole EVM wallet tree back onto the critical path (D-032).

function ScorePill({ score, grade }: { score: number; grade: string }) {
  const color =
    grade === 'A' || grade === 'B'
      ? 'text-accent border-accent/30 bg-accent/10'
      : grade === 'C' || grade === 'D'
      ? 'text-warning border-warning/30 bg-warning/10'
      : 'text-danger border-danger/30 bg-danger/10'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {score}{' '}
      <span className="opacity-60">{grade}</span>
    </span>
  )
}

export default function WalletConnectButtonInner() {
  const { address, isConnected } = useAccount()
  const { score, setScore, setLoadingScore, setAddress } = useWalletStore()

  useEffect(() => {
    if (!isConnected || !address) {
      setAddress(null)
      setScore(null)
      return
    }
    setAddress(address)
    // Skip if already loaded for this address
    if (score?.address.toLowerCase() === address.toLowerCase()) return

    setLoadingScore(true)
    fetch(`/api/score/${address}`)
      .then((r) => r.json())
      .then((data) => {
        setScore(data)
        setLoadingScore(false)
      })
      .catch(() => setLoadingScore(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected])

  return (
    <div className="flex items-center gap-2">
      {isConnected && score && (
        <Link href={`/score/${address}`}>
          <ScorePill score={score.score} grade={score.grade} />
        </Link>
      )}
      <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
    </div>
  )
}
