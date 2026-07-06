'use client'
import dynamic from 'next/dynamic'
import { useEvmReady } from './EvmGate'

// Critical-path half of the notification bell: NO static wagmi imports in
// this file (D-032). Nothing renders before the wallet subtree mounts; the
// bell only matters once a wallet is connected, which cannot be true yet.

const NotificationBellInner = dynamic(() => import('./NotificationBellInner'), {
  ssr: false,
  loading: () => null,
})

export function NotificationBell() {
  if (!useEvmReady()) return null
  return <NotificationBellInner />
}
