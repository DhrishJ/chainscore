import { create } from 'zustand'
import type { ScoreResult } from '@/types'

interface WalletStore {
  // EVM
  address: string | null
  score: ScoreResult | null
  isLoadingScore: boolean
  setAddress: (address: string | null) => void
  setScore: (score: ScoreResult | null) => void
  setLoadingScore: (loading: boolean) => void
  // Solana
  solanaAddress: string | null
  solanaScore: ScoreResult | null
  isLoadingSolanaScore: boolean
  setSolanaAddress: (address: string | null) => void
  setSolanaScore: (score: ScoreResult | null) => void
  setLoadingSolanaScore: (loading: boolean) => void

  reset: () => void
}

export const useWalletStore = create<WalletStore>((set) => ({
  address: null,
  score: null,
  isLoadingScore: false,
  setAddress: (address) => set({ address }),
  setScore: (score) => set({ score }),
  setLoadingScore: (isLoadingScore) => set({ isLoadingScore }),

  solanaAddress: null,
  solanaScore: null,
  isLoadingSolanaScore: false,
  setSolanaAddress: (solanaAddress) => set({ solanaAddress }),
  setSolanaScore: (solanaScore) => set({ solanaScore }),
  setLoadingSolanaScore: (isLoadingSolanaScore) => set({ isLoadingSolanaScore }),

  reset: () => set({
    address: null, score: null, isLoadingScore: false,
    solanaAddress: null, solanaScore: null, isLoadingSolanaScore: false,
  }),
}))
