'use client'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wagmi'
import { useTheme } from '@/lib/theme'
import '@rainbow-me/rainbowkit/styles.css'

// The heavy EVM wallet subtree: wagmi + viem + RainbowKit + react-query,
// roughly 900 KB of transfer. Never import this module statically from
// anything on the critical path; it is loaded on demand by EvmGate
// (DECISIONS.md D-032).

const queryClient = new QueryClient()

function RainbowWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const rkTheme =
    theme === 'dark'
      ? darkTheme({ accentColor: '#0052FF', accentColorForeground: 'white' })
      : lightTheme({ accentColor: '#0052FF', accentColorForeground: 'white' })
  return <RainbowKitProvider theme={rkTheme}>{children}</RainbowKitProvider>
}

export function EvmProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowWrapper>{children}</RainbowWrapper>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
