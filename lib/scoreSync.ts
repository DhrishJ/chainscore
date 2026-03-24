import { prisma } from './db'
import type { ScoreResult } from '@/types'

export async function syncWalletScore(result: ScoreResult): Promise<void> {
  try {
    await prisma.wallet.upsert({
      where: { address: result.address.toLowerCase() },
      update: {
        score: result.score,
        grade: result.grade,
        percentile: result.percentile,
        ens: result.ens,
      },
      create: {
        address: result.address.toLowerCase(),
        score: result.score,
        grade: result.grade,
        percentile: result.percentile,
        ens: result.ens,
      },
    })
    await prisma.scoreSnapshot.create({
      data: {
        walletAddress: result.address.toLowerCase(),
        score: result.score,
      },
    })
  } catch (e) {
    // Non-fatal: DB may not be connected yet
    console.warn('[scoreSync] Failed to sync wallet score:', e)
  }
}
