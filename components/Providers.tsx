'use client'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wagmi'
import { ThemeProvider, useTheme } from '@/lib/theme'
import { SolanaWalletProvider } from '@/components/SolanaWalletProvider'
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

function RainbowWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const rkTheme =
    theme === 'dark'
      ? darkTheme({ accentColor: '#0052FF', accentColorForeground: 'white' })
      : lightTheme({ accentColor: '#0052FF', accentColorForeground: 'white' })
  return <RainbowKitProvider theme={rkTheme}>{children}</RainbowKitProvider>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowWrapper>
            <SolanaWalletProvider>
              {children}
            </SolanaWalletProvider>
          </RainbowWrapper>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
