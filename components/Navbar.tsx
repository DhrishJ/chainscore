'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { WalletConnectButton } from './WalletConnectButton'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { LazySolanaButton } from './LazySolanaButton'
import { CommandPalette } from './CommandPalette'
import { Wordmark } from './site/Logo'

const LINKS = [
  { href: '/retrospective', label: 'Retrospective' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/#api', label: 'API' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/marketplace', label: 'Marketplace', note: 'Preview' },
]

// Transparent over the page, a paper strip once scrolled. It steps out of
// the way while reading down and returns on the first scroll up.
export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  // One set of wallet widgets at a time: in the bar from `sm` up, in the
  // menu below it. Two mounted Solana providers could double-connect.
  const [wide, setWide] = useState<boolean | null>(null)
  const lastY = useRef(0)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const y = window.scrollY
        setScrolled(y > 8)
        const delta = y - lastY.current
        if (y < 120) setHidden(false)
        else if (delta > 6) setHidden(true)
        else if (delta < -6) setHidden(false)
        lastY.current = y
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => setMobileOpen(false), [pathname])

  useEffect(() => {
    document.documentElement.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [mobileOpen])

  const isActive = (href: string) => !href.includes('#') && (pathname === href || pathname.startsWith(href + '/'))

  return (
    <>
      <nav
        aria-label="Primary"
        className={`fixed inset-x-0 top-0 z-50 transition-[transform,background-color,border-color] duration-500 ease-out ${
          hidden && !mobileOpen ? '-translate-y-full' : 'translate-y-0'
        } ${
          scrolled || mobileOpen
            ? 'border-b border-text/10 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70'
            : 'border-b border-transparent'
        }`}
      >
        <CommandPalette />
        <div className="frame flex h-[var(--nav-h)] items-center justify-between gap-6">
          <div className="flex items-center gap-10">
            <Link href="/" className="text-text transition-colors hover:text-accent" aria-label="ChainScore home">
              <Wordmark />
            </Link>
            <ul className="hidden items-center gap-7 lg:flex">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={isActive(l.href) ? 'page' : undefined}
                    className={`t-label link-u py-1 transition-colors ${isActive(l.href) ? 'text-text' : 'text-muted hover:text-text'}`}
                  >
                    {isActive(l.href) && <span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px bg-accent" aria-hidden />}
                    {l.label}
                    {l.note && <span className="ml-1.5 text-muted/80">({l.note})</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            {wide && <LazySolanaButton />}
            <NotificationBell />
            {wide && <WalletConnectButton />}
            <button
              className="grid h-9 w-9 place-items-center text-text lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
            >
              <span className="relative block h-3 w-5" aria-hidden>
                <span
                  className={`absolute left-0 h-px w-5 bg-current transition-transform duration-500 ease-out ${
                    mobileOpen ? 'top-1.5 rotate-45' : 'top-0'
                  }`}
                />
                <span
                  className={`absolute left-0 h-px w-5 bg-current transition-transform duration-500 ease-out ${
                    mobileOpen ? 'top-1.5 -rotate-45' : 'top-3'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Full-screen menu for small screens. */}
      <div
        id="mobile-menu"
        className={`fixed inset-0 z-40 bg-background transition-[clip-path] duration-700 ease-in-out-quart lg:hidden ${
          mobileOpen ? '[clip-path:inset(0_0_0_0)]' : 'pointer-events-none [clip-path:inset(0_0_100%_0)]'
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="frame flex h-full flex-col pb-8 pt-[calc(var(--nav-h)+2rem)]">
          <ul className="border-t border-text/80">
            {LINKS.map((l, i) => (
              <li key={l.href} className="border-b border-text/15">
                <Link
                  href={l.href}
                  tabIndex={mobileOpen ? 0 : -1}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-baseline gap-4 py-3"
                >
                  <span className="t-label text-muted">0{i + 1}</span>
                  <span className="t-display text-[clamp(2.75rem,12vw,4.5rem)] text-text">{l.label}</span>
                  {l.note && <span className="t-label text-muted">({l.note})</span>}
                </Link>
              </li>
            ))}
          </ul>
          {wide === false && mobileOpen && (
            <div className="mt-auto flex flex-wrap items-center gap-3">
              <WalletConnectButton />
              <LazySolanaButton />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
