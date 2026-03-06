import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { getFirstTransaction, getTransactionHistory } from '@/lib/data/etherscan'
import { getTokenBalances } from '@/lib/data/alchemy'
import { getAaveActivity, getCompoundActivity, getUniswapActivity } from '@/lib/data/thegraph'
import { computeScore } from '@/lib/data/scorer'
import { getChain } from '@/lib/chains'
import type { RawWalletData } from '@/types'
import { recentScores } from '@/lib/recentScores'

export const revalidate = 3600

// ENS resolution is always on mainnet
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/' + (process.env.ALCHEMY_API_KEY || '')),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const chainSlug = req.nextUrl.searchParams.get('chain') || 'ethereum'
  const chain = getChain(chainSlug)

  let { address } = params

  // Resolve ENS name — only supported on Ethereum
  if (address.endsWith('.eth')) {
    try {
      const resolved = await ensClient.getEnsAddress({ name: address })
      if (!resolved) {
        return NextResponse.json({ error: 'ENS name not found' }, { status: 404 })
      }
      address = resolved
    } catch {
      return NextResponse.json({ error: 'Failed to resolve ENS name' }, { status: 400 })
    }
  }

  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid Ethereum address' }, { status: 400 })
  }

  const errors: Record<string, string> = {}

  const ensLookupPromise = chain.supportsENS
    ? ensClient.getEnsName({ address: address as `0x${string}` })
    : Promise.resolve(null)

  const [firstTx, txHistory, tokenData, aaveData, compoundData, uniswapData, ensLookup] =
    await Promise.allSettled([
      getFirstTransaction(address, chain.id),
      getTransactionHistory(address, chain.id),
      getTokenBalances(address, chain),
      getAaveActivity(address, chain.slug),
      getCompoundActivity(address, chain.slug),
      getUniswapActivity(address),
      ensLookupPromise,
    ])

  const firstTxResult = firstTx.status === 'fulfilled' ? firstTx.value : { timestamp: null, error: 'fetch failed' }
  const txHistResult = txHistory.status === 'fulfilled' ? txHistory.value : { txCount: 0, activeMonthsLast12: 0, error: 'fetch failed' }
  const tokenResult = tokenData.status === 'fulfilled' ? tokenData.value : { totalPortfolioUSD: 0, stablecoinPct: 0, hasETH: false, hasStakedETH: false, hasENS: false, hasAave: false, hasCompound: false, hasUniswapLP: false, isGnosisSafe: false, error: 'fetch failed' }
  const aaveResult = aaveData.status === 'fulfilled' ? aaveData.value : { borrows: 0, repays: 0, liquidations: 0, error: 'fetch failed' }
  const compoundResult = compoundData.status === 'fulfilled' ? compoundData.value : { borrows: 0, repays: 0, error: 'fetch failed' }
  const uniswapResult = uniswapData.status === 'fulfilled' ? uniswapData.value : { hasLP: false, error: 'fetch failed' }
  const ensName = ensLookup.status === 'fulfilled' ? ensLookup.value : null

  if (firstTxResult.error) errors.etherscan = firstTxResult.error
  if (tokenResult.error) errors.alchemy = tokenResult.error
  if (aaveResult.error) errors.aave = aaveResult.error
  if (compoundResult.error) errors.compound = compoundResult.error
  if (uniswapResult.error) errors.uniswap = uniswapResult.error

  const protocolsUsed: string[] = []
  if (aaveResult.borrows > 0 || aaveResult.repays > 0 || tokenResult.hasAave) protocolsUsed.push('Aave')
  if (compoundResult.borrows > 0 || compoundResult.repays > 0 || tokenResult.hasCompound) protocolsUsed.push('Compound')
  if (uniswapResult.hasLP || tokenResult.hasUniswapLP) protocolsUsed.push('Uniswap')
  if (tokenResult.hasStakedETH) protocolsUsed.push(chain.slug === 'ethereum' ? 'Lido' : 'Lido (wstETH)')

  const rawData: RawWalletData = {
    firstTxTimestamp: firstTxResult.timestamp,
    txCount: txHistResult.txCount,
    activeMonthsLast12: txHistResult.activeMonthsLast12,
    totalPortfolioUSD: tokenResult.totalPortfolioUSD,
    stablecoinPct: tokenResult.stablecoinPct,
    hasETH: tokenResult.hasETH,
    hasENS: tokenResult.hasENS || Boolean(ensName),
    isGnosisSafe: tokenResult.isGnosisSafe,
    hasAave: tokenResult.hasAave,
    hasCompound: tokenResult.hasCompound,
    aaveBorrows: aaveResult.borrows,
    aaveRepays: aaveResult.repays,
    aaveLiquidations: aaveResult.liquidations,
    compoundBorrows: compoundResult.borrows,
    compoundRepays: compoundResult.repays,
    hasUniswapLP: uniswapResult.hasLP || tokenResult.hasUniswapLP,
    hasStakedETH: tokenResult.hasStakedETH,
    hasGovernanceVote: false,
    protocolsUsed,
    ens: ensName || null,
    errors,
  }

  const result = computeScore(rawData)
  result.address = address

  recentScores.add({ address, score: result.score, timestamp: Date.now() })

  return NextResponse.json(result)
}
