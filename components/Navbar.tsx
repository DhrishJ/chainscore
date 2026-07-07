'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { WalletConnectButton } from './WalletConnectButton'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { LazySolanaButton } from './LazySolanaButton'
import { CommandPalette } from './CommandPalette'

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <CommandPalette />
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
              Marketplace (preview)
            </Link>
            <Link href="/dashboard" className="hover:text-text transition-colors">
              Dashboard
            </Link>
            <Link href="/pricing" className="hover:text-text transition-colors">
              Pricing
            </Link>
            <Link href="/retrospective" className="hover:text-text transition-colors">
              Retrospective
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LazySolanaButton />
          <NotificationBell />
          <WalletConnectButton />
          <button
            className="sm:hidden p-1 text-muted hover:text-text transition-colors"
            onClick={() => setMobileOpen(prev => !prev)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="sm:hidden border-t border-border bg-background px-4 py-3 flex flex-col gap-3 text-sm text-muted">
          <Link href="/marketplace" className="hover:text-text transition-colors" onClick={() => setMobileOpen(false)}>
            Marketplace (preview)
          </Link>
          <Link href="/dashboard" className="hover:text-text transition-colors" onClick={() => setMobileOpen(false)}>
            Dashboard
          </Link>
          <Link href="/pricing" className="hover:text-text transition-colors" onClick={() => setMobileOpen(false)}>
            Pricing
          </Link>
          <Link href="/retrospective" className="hover:text-text transition-colors" onClick={() => setMobileOpen(false)}>
            Retrospective
          </Link>
        </div>
      )}
    </nav>
  )
}
