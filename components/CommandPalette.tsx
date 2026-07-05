'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Home,
  Store,
  LayoutDashboard,
  History,
  Wallet,
  Link2,
} from 'lucide-react'
import { truncateAddress } from '@/lib/format'

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const ENS_RE = /\.eth$/i
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function isRoutableAddress(query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return false
  if (EVM_ADDRESS_RE.test(trimmed)) return true
  if (ENS_RE.test(trimmed)) return true
  if (!trimmed.startsWith('0x') && SOLANA_ADDRESS_RE.test(trimmed)) return true
  return false
}

interface NavItem {
  id: string
  label: string
  href: string
  icon: typeof Home
}

const NAV_ITEMS: NavItem[] = [
  { id: 'nav-home', label: 'Home', href: '/', icon: Home },
  { id: 'nav-marketplace', label: 'Marketplace', href: '/marketplace', icon: Store },
  { id: 'nav-dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { id: 'nav-retrospective', label: 'Retrospective', href: '/retrospective', icon: History },
]

interface ChainItem {
  id: string
  label: string
  slug: string
}

const CHAIN_ITEMS: ChainItem[] = [
  { id: 'chain-ethereum', label: 'Ethereum', slug: 'ethereum' },
  { id: 'chain-polygon', label: 'Polygon', slug: 'polygon' },
  { id: 'chain-arbitrum', label: 'Arbitrum', slug: 'arbitrum' },
  { id: 'chain-optimism', label: 'Optimism', slug: 'optimism' },
  { id: 'chain-base', label: 'Base', slug: 'base' },
  { id: 'chain-avalanche', label: 'Avalanche', slug: 'avalanche' },
  { id: 'chain-bnb', label: 'BNB', slug: 'bnb' },
]

type PaletteItem =
  | { kind: 'address'; id: string; label: string; disabled: false; hint?: string }
  | { kind: 'nav'; id: string; label: string; href: string; icon: typeof Home; disabled: false; hint?: string }
  | { kind: 'chain'; id: string; label: string; slug: string; disabled: boolean; hint?: string }

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmedQuery = query.trim()
  const addressIsRoutable = isRoutableAddress(trimmedQuery)

  const items: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = []
    const lowerQuery = trimmedQuery.toLowerCase()

    if (addressIsRoutable) {
      list.push({
        kind: 'address',
        id: 'address-action',
        label: `View score for ${truncateAddress(trimmedQuery)}`,
        disabled: false,
      })
    }

    for (const navItem of NAV_ITEMS) {
      if (lowerQuery && !navItem.label.toLowerCase().includes(lowerQuery)) continue
      list.push({
        kind: 'nav',
        id: navItem.id,
        label: navItem.label,
        href: navItem.href,
        icon: navItem.icon,
        disabled: false,
      })
    }

    for (const chainItem of CHAIN_ITEMS) {
      if (lowerQuery && !chainItem.label.toLowerCase().includes(lowerQuery)) continue
      list.push({
        kind: 'chain',
        id: chainItem.id,
        label: chainItem.label,
        slug: chainItem.slug,
        disabled: !addressIsRoutable,
        hint: addressIsRoutable ? undefined : 'enter an address first',
      })
    }

    return list
  }, [trimmedQuery, addressIsRoutable])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setHighlightedIndex(0)
  }, [])

  const selectItem = useCallback(
    (item: PaletteItem) => {
      if (item.disabled) return
      if (item.kind === 'address') {
        router.push(`/score/${encodeURIComponent(trimmedQuery)}`)
      } else if (item.kind === 'nav') {
        router.push(item.href)
      } else if (item.kind === 'chain') {
        router.push(`/score/${encodeURIComponent(trimmedQuery)}?chain=${item.slug}`)
      }
      close()
    },
    [router, trimmedQuery, close]
  )

  // Global open/close shortcut listener.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMetaK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (isMetaK) {
        event.preventDefault()
        setOpen(prev => !prev)
        return
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, close])

  // Autofocus the input whenever the palette opens.
  useEffect(() => {
    if (open) {
      setHighlightedIndex(0)
      const id = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [open])

  // Keep the highlighted index in range as the filtered list changes.
  useEffect(() => {
    setHighlightedIndex(prev => {
      if (items.length === 0) return 0
      return Math.min(prev, items.length - 1)
    })
  }, [items])

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex(prev => (items.length === 0 ? 0 : (prev + 1) % items.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex(prev => (items.length === 0 ? 0 : (prev - 1 + items.length) % items.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[highlightedIndex]
      if (item) selectItem(item)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-24 px-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search a wallet, chain, or page..."
          aria-label="Search a wallet, chain, or page"
          autoFocus
          className="w-full bg-transparent border-b border-border px-4 py-3 text-sm text-text placeholder:text-muted focus:outline-none"
        />
        <ul role="listbox" aria-label="Command palette results" className="max-h-80 overflow-y-auto py-2">
          {items.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted text-center">No matches</li>
          )}
          {items.map((item, index) => {
            const highlighted = index === highlightedIndex
            const baseClasses =
              'flex w-full items-center gap-3 px-4 py-2 text-sm text-left transition-colors'
            const stateClasses = item.disabled
              ? 'text-muted/60 cursor-not-allowed'
              : highlighted
                ? 'bg-accent/10 text-text cursor-pointer'
                : 'text-muted hover:bg-accent/5 hover:text-text cursor-pointer'

            return (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={highlighted}
                  disabled={item.disabled}
                  className={`${baseClasses} ${stateClasses}`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectItem(item)}
                >
                  {item.kind === 'address' && <Wallet size={16} className="shrink-0" />}
                  {item.kind === 'nav' && <item.icon size={16} className="shrink-0" />}
                  {item.kind === 'chain' && <Link2 size={16} className="shrink-0" />}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-xs text-muted shrink-0">{item.hint}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
