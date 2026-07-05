'use client'
import { SolanaWalletProvider } from '@/components/SolanaWalletProvider'
import { SolanaWalletButton } from '@/components/SolanaWalletButton'

// The Solana wallet subsystem (adapter tree + modal + CSS) bundled behind one
// module boundary so it can be code-split out of the initial page load. The
// entire @solana/wallet-adapter dependency tree lives downstream of this file;
// loading it lazily is what removes it from first paint on the perf-critical
// home and score pages (Workstream A perf foundation).
export default function SolanaWalletIsland() {
  return (
    <SolanaWalletProvider>
      <SolanaWalletButton />
    </SolanaWalletProvider>
  )
}
