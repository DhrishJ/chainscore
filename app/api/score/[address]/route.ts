import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { getFirstTransaction, getTransactionHistory } from '@/lib/ingest/txHistory'
import { computeCompleteness } from '@/lib/ingest/completeness'
import { getTokenBalances } from '@/lib/data/alchemy'
import { getAaveActivity, getCompoundActivity, getUniswapActivity } from '@/lib/data/thegraph'
import { computeScore } from '@/lib/data/mlScorer'
import { computeSolanaScore } from '@/lib/data/solanaScorer'
import {
  getSolanaTransactionHistory,
  getSolanaBalance,
  getSolanaTokenData,
  getSolanaDefiActivity,
} from '@/lib/data/helius'
import { getChain } from '@/lib/chains'
import { isSolanaAddress } from '@/lib/solanaAuth'
import type { RawWalletData } from '@/types'
import { recentScores } from '@/lib/recentScores'
import { env } from '@/lib/env.server'
import { addressParamSchema, chainSlugSchema } from '@/lib/validation'

export const revalidate = 3600

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/' + env.ALCHEMY_API_KEY),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const chainSlugParsed = chainSlugSchema.safeParse(req.nextUrl.searchParams.get('chain') ?? undefined)
  const chainSlug = chainSlugParsed.success ? chainSlugParsed.data : 'ethereum'
  const { address } = params

  // Shape check before any provider call, including the ENS resolution call
  // below, so malformed input never reaches an external API. The specific
  // error message still depends on which chain the caller targeted, mirrored
  // from the branching logic further down so the public contract is
  // unchanged for valid input.
  if (!addressParamSchema.safeParse(address).success) {
    return NextResponse.json(
      { error: chainSlug === 'solana' ? 'Invalid Solana address' : 'Invalid address' },
      { status: 400 }
    )
  }

  // ── Solana path ──────────────────────────────────────────────────────────
  if (chainSlug === 'solana' || isSolanaAddress(address)) {
    if (!isSolanaAddress(address)) {
      return NextResponse.json({ error: 'Invalid Solana address' }, { status: 400 })
    }

    const [txHistory, balance, tokenData, defiData] = await Promise.allSettled([
      getSolanaTransactionHistory(address),
      getSolanaBalance(address),
      getSolanaTokenData(address),
      getSolanaDefiActivity(address),
    ])

    const tx = txHistory.status === 'fulfilled' ? txHistory.value : { txCount: 0, activeMonthsLast12: 0, firstTimestamp: null }
    const bal = balance.status === 'fulfilled' ? balance.value : { solBalance: 0 }
    const tok = tokenData.status === 'fulfilled' ? tokenData.value : { hasMSOL: false, hasJitoSOL: false, hasBSOL: false, tokenCount: 0 }
    const defi = defiData.status === 'fulfilled' ? defiData.value : { hasJupiter: false, hasKamino: false, hasSolend: false, hasMarginfi: false, hasMarinade: false, borrowCount: 0, repayCount: 0 }

    const result = computeSolanaScore({
      firstTimestamp: tx.firstTimestamp ?? null,
      txCount: tx.txCount,
      activeMonthsLast12: tx.activeMonthsLast12,
      solBalance: bal.solBalance,
      tokenCount: tok.tokenCount,
      hasMSOL: tok.hasMSOL,
      hasJitoSOL: tok.hasJitoSOL,
      hasBSOL: tok.hasBSOL,
      hasJupiter: defi.hasJupiter,
      hasKamino: defi.hasKamino,
      hasSolend: defi.hasSolend,
      hasMarginfi: defi.hasMarginfi,
      hasMarinade: defi.hasMarinade,
      borrowCount: defi.borrowCount,
      repayCount: defi.repayCount,
    })

    result.address = address
    recentScores.add({ address, score: result.score, timestamp: Date.now() })
    return NextResponse.json(result)
  }

  // ── EVM path ─────────────────────────────────────────────────────────────
  const chain = getChain(chainSlug)
  let evmAddress = address

  if (evmAddress.endsWith('.eth')) {
    try {
      const resolved = await ensClient.getEnsAddress({ name: evmAddress })
      if (!resolved) return NextResponse.json({ error: 'ENS name not found' }, { status: 404 })
      evmAddress = resolved
    } catch {
      return NextResponse.json({ error: 'Failed to resolve ENS name' }, { status: 400 })
    }
  }

  if (!isAddress(evmAddress)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const errors: Record<string, string> = {}
  const ensLookupPromise = chain.supportsENS
    ? ensClient.getEnsName({ address: evmAddress as `0x${string}` })
    : Promise.resolve(null)

  const [firstTx, txHistory, tokenData, aaveData, compoundData, uniswapData, ensLookup] =
    await Promise.allSettled([
      getFirstTransaction(evmAddress, chain.id),
      getTransactionHistory(evmAddress, chain.id),
      getTokenBalances(evmAddress, chain),
      getAaveActivity(evmAddress, chain.slug),
      getCompoundActivity(evmAddress, chain.slug),
      getUniswapActivity(evmAddress),
      ensLookupPromise,
    ])

  const firstTxResult = firstTx.status === 'fulfilled' ? firstTx.value : { timestamp: null, error: 'fetch failed' }
  const txHistResult = txHistory.status === 'fulfilled' ? txHistory.value : { txCount: 0, txCount30d: 0, txCount90d: 0, txCount180d: 0, activeDaysCount: 0, activeMonthsLast12: 0, error: 'fetch failed' }
  const tokenResult = tokenData.status === 'fulfilled' ? tokenData.value : { totalPortfolioUSD: 0, stablecoinPct: 0, tokenDiversity: 0, hasETH: false, hasStakedETH: false, hasENS: false, hasAave: false, hasCompound: false, hasUniswapLP: false, isGnosisSafe: false, error: 'fetch failed' }
  const aaveResult = aaveData.status === 'fulfilled' ? aaveData.value : { borrows: 0, repays: 0, liquidations: 0, error: 'fetch failed' }
  const compoundResult = compoundData.status === 'fulfilled' ? compoundData.value : { borrows: 0, repays: 0, liquidations: 0, error: 'fetch failed' }
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
    firstTxTimestamp:   firstTxResult.timestamp,
    txCount:            txHistResult.txCount,
    txCount30d:         txHistResult.txCount30d   ?? 0,
    txCount90d:         txHistResult.txCount90d   ?? 0,
    txCount180d:        txHistResult.txCount180d  ?? 0,
    activeDaysCount:    txHistResult.activeDaysCount ?? 0,
    activeMonthsLast12: txHistResult.activeMonthsLast12,
    daysSinceFirstDefi: 0,  // populated below
    totalPortfolioUSD:  tokenResult.totalPortfolioUSD,
    stablecoinPct:      tokenResult.stablecoinPct,
    tokenDiversity:     tokenResult.tokenDiversity ?? 0,
    hasETH:             tokenResult.hasETH,
    hasENS:             tokenResult.hasENS || Boolean(ensName),
    isGnosisSafe:       tokenResult.isGnosisSafe,
    hasAave:            tokenResult.hasAave,
    hasCompound:        tokenResult.hasCompound,
    aaveBorrows:        aaveResult.borrows,
    aaveRepays:         aaveResult.repays,
    aaveLiquidations:   aaveResult.liquidations,
    compoundBorrows:    compoundResult.borrows,
    compoundRepays:     compoundResult.repays,
    compoundLiquidations: compoundResult.liquidations,
    hasUniswapLP:       uniswapResult.hasLP || tokenResult.hasUniswapLP,
    hasStakedETH:       tokenResult.hasStakedETH,
    hasGovernanceVote:  false,
    protocolsUsed,
    ens:                ensName || null,
    errors,
  }

  // daysSinceFirstDefi: estimate from first borrow event if any DeFi activity exists
  if (firstTxResult.timestamp && (aaveResult.borrows > 0 || compoundResult.borrows > 0)) {
    rawData.daysSinceFirstDefi = Math.floor((Date.now() / 1000 - firstTxResult.timestamp) / 86400)
  }

  const result = computeScore(rawData)
  result.address = evmAddress
  const completeness = computeCompleteness(errors)
  result.dataCompleteness = completeness.dataCompleteness
  result.degradedSources = completeness.degradedSources
  recentScores.add({ address: evmAddress, score: result.score, timestamp: Date.now() })
  return NextResponse.json(result)
}
