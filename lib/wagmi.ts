'use client'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { mainnet, polygon, arbitrum, optimism, base } from 'wagmi/chains'
import { clientEnv } from '@/lib/env.client'

export const wagmiConfig = getDefaultConfig({
  appName: 'ChainScore',
  projectId: clientEnv.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'chainscore',
  chains: [mainnet, polygon, arbitrum, optimism, base],
  ssr: true,
})
