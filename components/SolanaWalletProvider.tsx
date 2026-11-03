'use client'
import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
// Vendored copy without the remote Google Fonts @import (see file header):
// a blocked font request used to crash the whole app via ChunkLoadError.
import './solana-wallet-adapter.css'

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  )

  // RPC calls go through the server-side proxy so no API key ships in the
  // client bundle. Connection requires an absolute URL; during SSR the
  // placeholder origin is never actually fetched.
  const endpoint = useMemo(() => {
    if (typeof window !== 'undefined') return `${window.location.origin}/api/solana-rpc`
    return 'https://chainscore.dev/api/solana-rpc'
  }, [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
