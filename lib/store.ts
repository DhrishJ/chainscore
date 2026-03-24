import { create } from 'zustand'
import type { ScoreResult } from '@/types'

interface WalletStore {
  address: string | null
  score: ScoreResult | null
  isLoadingScore: boolean
  setAddress: (address: string | null) => void
  setScore: (score: ScoreResult | null) => void
  setLoadingScore: (loading: boolean) => void
  reset: () => void
}

export const useWalletStore = create<WalletStore>((set) => ({
  address: null,
  score: null,
  isLoadingScore: false,
  setAddress: (address) => set({ address }),
  setScore: (score) => set({ score }),
  setLoadingScore: (isLoadingScore) => set({ isLoadingScore }),
  reset: () => set({ address: null, score: null, isLoadingScore: false }),
}))
