import Link from 'next/link'
import { WalletConnectButton } from './WalletConnectButton'
import { NotificationBell } from './NotificationBell'

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="font-grotesk font-bold text-text hover:text-accent transition-colors"
          >
            Chain<span className="text-accent">Score</span>
          </Link>
          <div className="hidden sm:flex items-center gap-4 text-sm text-muted">
            <Link href="/marketplace" className="hover:text-text transition-colors">
              Marketplace
            </Link>
            <Link href="/dashboard" className="hover:text-text transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <WalletConnectButton />
        </div>
      </div>
    </nav>
  )
}
