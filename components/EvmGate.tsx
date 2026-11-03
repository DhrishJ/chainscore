'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'

// Defers the ~900 KB EVM wallet subtree (wagmi + viem + RainbowKit) off the
// critical path (DECISIONS.md D-032). Until the subtree mounts, children
// render WITHOUT wagmi context, so anything calling wagmi hooks must first
// check useEvmReady() (navbar widgets show placeholders) or call
// useRequireEvm() (wallet-dependent pages, which mount the subtree
// immediately and show a skeleton for the brief load).
//
// Mount triggers, whichever comes first:
//  - a page that needs wallets calls useRequireEvm()
//  - the visitor's first pointerdown/keydown anywhere
//  - an idle fallback timer, so returning users' autoconnect still happens
//    shortly after load without any interaction
//
// The module is swapped in via a manual import + state (not next/dynamic):
// dynamic() renders a loading fallback INSTEAD of children while the chunk
// downloads, which would blank the whole app at swap time. Here children
// stay mounted contextless until the module arrives, then remount once
// under the providers.

type EvmProvidersComponent = ComponentType<{ children: ReactNode }>

interface EvmGateContextValue {
  ready: boolean
  require: () => void
}

const EvmGateContext = createContext<EvmGateContextValue>({
  ready: false,
  require: () => {},
})

// True once wagmi context exists below EvmGate. Safe to call anywhere.
export function useEvmReady(): boolean {
  return useContext(EvmGateContext).ready
}

// Returns readiness and a trigger, for widgets that want to arm the mount
// from a user gesture (the navbar connect placeholder).
export function useEvmGate(): EvmGateContextValue {
  return useContext(EvmGateContext)
}

// For pages that need wallet hooks: requests the subtree on mount and
// reports readiness. Render a skeleton until it returns true; only then may
// components using wagmi hooks render.
export function useRequireEvm(): boolean {
  const { ready, require } = useContext(EvmGateContext)
  useEffect(() => {
    require()
  }, [require])
  return ready
}

const IDLE_MOUNT_MS = 3500

// Editorial routes mount the wallet stack only on an explicit wallet press.
// Swapping in the providers remounts the whole page (see above), which on
// these routes would tear down and rebuild the WebGL stages a few seconds
// after load, and, if the trigger was a click into the score field, drop
// that field's focus and whatever was typed. Nothing on these pages needs
// wagmi until the visitor reaches for a wallet button. App routes keep the
// eager first-interaction / idle mount (D-032).
function isEditorialRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname === '/' ||
    pathname === '/retrospective' ||
    pathname === '/pricing' ||
    pathname.startsWith('/score/')
  )
}

export function EvmGate({ children }: { children: ReactNode }) {
  const [Providers, setProviders] = useState<EvmProvidersComponent | null>(null)
  const [requested, setRequested] = useState(false)
  const pathname = usePathname()
  const editorial = isEditorialRoute(pathname)

  const require = useCallback(() => setRequested(true), [])

  useEffect(() => {
    if (requested || editorial) return
    const timer = window.setTimeout(require, IDLE_MOUNT_MS)
    const onFirstInput = () => require()
    window.addEventListener('pointerdown', onFirstInput, { once: true, passive: true })
    window.addEventListener('keydown', onFirstInput, { once: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onFirstInput)
      window.removeEventListener('keydown', onFirstInput)
    }
  }, [requested, require, editorial])

  useEffect(() => {
    if (!requested || Providers) return
    let cancelled = false
    import('./EvmProviders').then((m) => {
      if (!cancelled) setProviders(() => m.EvmProviders)
    })
    return () => {
      cancelled = true
    }
  }, [requested, Providers])

  const value = useMemo(() => ({ ready: Providers !== null, require }), [Providers, require])

  return (
    <EvmGateContext.Provider value={value}>
      {Providers ? <Providers>{children}</Providers> : children}
    </EvmGateContext.Provider>
  )
}
