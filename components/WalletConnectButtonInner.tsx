'use client'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useEffect } from 'react'
import { useWalletStore } from '@/lib/store'
import { stylesForGrade } from '@/lib/site/scoreTier'
import Link from 'next/link'

// The wagmi/RainbowKit half of the navbar connect button. Must only be
// imported dynamically (see WalletConnectButton.tsx): a static import here
// would pull the whole EVM wallet tree back onto the critical path (D-032).

function ScorePill({ score, grade }: { score: number; grade: string }) {
  const color = stylesForGrade(grade).pill

  return (
    <span
      className={`t-label inline-flex items-center gap-1 border px-2 py-1 ${color}`}
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
      {/* RainbowKit's state machine, rendered in the house style. */}
      <ConnectButton.Custom>
        {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
          const ready = mounted
          const connected = ready && account && chain
          if (!ready) return <span className="block h-9 w-[8.5rem]" aria-hidden />
          if (!connected) {
            return (
              <button type="button" onClick={openConnectModal} className="btn btn-ink !min-h-[2.25rem] !gap-3 !px-3.5 !text-[11px]">
                <span>Connect wallet</span>
              </button>
            )
          }
          if (chain.unsupported) {
            return (
              <button type="button" onClick={openChainModal} className="btn btn-line !min-h-[2.25rem] !px-3.5 !text-[11px] !text-danger">
                <span>Wrong network</span>
              </button>
            )
          }
          return (
            <button
              type="button"
              onClick={openAccountModal}
              className="t-label flex h-9 items-center gap-2 border border-text/25 px-3 text-text transition-colors hover:border-text/60"
            >
              <span className="inline-block h-1.5 w-1.5 bg-success" aria-hidden />
              {account.displayName}
            </button>
          )
        }}
      </ConnectButton.Custom>
    </div>
  )
}
