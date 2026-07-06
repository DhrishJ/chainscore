'use client'
import dynamic from 'next/dynamic'
import { useEvmGate } from './EvmGate'

// Critical-path half of the navbar connect button: NO static wagmi or
// RainbowKit imports allowed in this file (D-032). Until the deferred EVM
// subtree mounts, a static lookalike renders; a press arms the mount
// (pointerdown anywhere already does), and the real ConnectButton swaps in
// within the chunk-load time.

const WalletConnectButtonInner = dynamic(() => import('./WalletConnectButtonInner'), {
  ssr: false,
  loading: () => <ConnectPlaceholder />,
})

function ConnectPlaceholder({ onPress }: { onPress?: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="rounded-xl bg-[#0052FF] px-3.5 py-2 text-sm font-bold text-white transition-transform hover:scale-[1.025]"
    >
      Connect Wallet
    </button>
  )
}

export function WalletConnectButton() {
  const { ready, require } = useEvmGate()
  if (!ready) return <ConnectPlaceholder onPress={require} />
  return <WalletConnectButtonInner />
}
