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
      className="btn btn-ink !min-h-[2.25rem] !gap-3 !px-3.5 !text-[11px]"
    >
      <span>Connect wallet</span>
    </button>
  )
}

export function WalletConnectButton() {
  const { ready, require } = useEvmGate()
  if (!ready) return <ConnectPlaceholder onPress={require} />
  return <WalletConnectButtonInner />
}
