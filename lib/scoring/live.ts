import { createPublicClient, http, isAddress } from 'viem'
import { mainnet } from 'viem/chains'
import { env } from '@/lib/env.server'
import { getFirstTransaction, getEnrichedTransactionHistory } from '@/lib/ingest/txHistory'
import { computeCompleteness } from '@/lib/ingest/completeness'
import { getTokenBalances } from '@/lib/data/alchemy'
import { getAaveActivity, getCompoundActivity, getUniswapActivity } from '@/lib/data/thegraph'
import { computeScore } from '@/lib/data/mlScorer'
import { getChain } from '@/lib/chains'
import type { RawWalletData } from '@/types'
import { buildEnvelope, getCachedEnvelope, getLastKnownGood, putEnvelope, ScoreEnvelope } from './service'

// Shared live EVM scoring path used by the versioned API. Produces the full
// envelope (model score + integrity penalty + provenance), reading from the
// resilient ingest layer and running the integrity detectors on the tx
// records already fetched. Wash-trading and burst-timing detectors are active
// on live data here; instant-repay and Sybil need richer lending-event and
// entity data that the live fan-out does not yet retain, so those detectors
// receive no input and contribute zero (documented, not silently dropped).

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/' + env.ALCHEMY_API_KEY),
})

export interface LiveScoreResult {
  envelope: ScoreEnvelope | null
  error?: { status: number; message: string }
}

export async function resolveEvmAddress(input: string): Promise<string | null> {
  if (input.endsWith('.eth')) {
    try {
      const resolved = await ensClient.getEnsAddress({ name: input })
      return resolved ?? null
    } catch {
      return null
    }
  }
  return isAddress(input) ? input : null
}

export async function scoreEvmWallet(inputAddress: string, chainSlug: string): Promise<LiveScoreResult> {
  const chain = getChain(chainSlug)

  const evmAddress = await resolveEvmAddress(inputAddress)
  if (!evmAddress) return { envelope: null, error: { status: 400, message: 'Invalid or unresolvable address' } }

  // Serve a fresh or usably-stale cached envelope without a provider round trip.
  const cached = getCachedEnvelope(evmAddress, chain.slug)
  if (cached && !cached.stale) return { envelope: cached }

  const errors: Record<string, string> = {}
  const ensLookupPromise = chain.supportsENS
    ? ensClient.getEnsName({ address: evmAddress as `0x${string}` })
    : Promise.resolve(null)

  const [firstTx, txHistory, tokenData, aaveData, compoundData, uniswapData, ensLookup] = await Promise.allSettled([
    getFirstTransaction(evmAddress, chain.id),
    getEnrichedTransactionHistory(evmAddress, chain.id),
    getTokenBalances(evmAddress, chain),
    getAaveActivity(evmAddress, chain.slug),
    getCompoundActivity(evmAddress, chain.slug),
    getUniswapActivity(evmAddress),
    ensLookupPromise,
  ])

  const firstTxResult = firstTx.status === 'fulfilled' ? firstTx.value : { timestamp: null, error: 'fetch failed' }
  const txHistResult =
    txHistory.status === 'fulfilled'
      ? txHistory.value
      : { txCount: 0, txCount30d: 0, txCount90d: 0, txCount180d: 0, activeDaysCount: 0, activeMonthsLast12: 0, records: [], error: 'fetch failed' }
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

  // Every source failed: degrade to last-known-good rather than an empty score.
  const totalSourcesFailed = Object.keys(errors).length
  if (totalSourcesFailed >= 4) {
    const lkg = getLastKnownGood(evmAddress, chain.slug)
    if (lkg) return { envelope: lkg }
  }

  const protocolsUsed: string[] = []
  if (aaveResult.borrows > 0 || aaveResult.repays > 0 || tokenResult.hasAave) protocolsUsed.push('Aave')
  if (compoundResult.borrows > 0 || compoundResult.repays > 0 || tokenResult.hasCompound) protocolsUsed.push('Compound')
  if (uniswapResult.hasLP || tokenResult.hasUniswapLP) protocolsUsed.push('Uniswap')
  if (tokenResult.hasStakedETH) protocolsUsed.push(chain.slug === 'ethereum' ? 'Lido' : 'Lido (wstETH)')

  const rawData: RawWalletData = {
    firstTxTimestamp: firstTxResult.timestamp,
    txCount: txHistResult.txCount,
    txCount30d: txHistResult.txCount30d ?? 0,
    txCount90d: txHistResult.txCount90d ?? 0,
    txCount180d: txHistResult.txCount180d ?? 0,
    activeDaysCount: txHistResult.activeDaysCount ?? 0,
    activeMonthsLast12: txHistResult.activeMonthsLast12,
    daysSinceFirstDefi: 0,
    totalPortfolioUSD: tokenResult.totalPortfolioUSD,
    stablecoinPct: tokenResult.stablecoinPct,
    tokenDiversity: tokenResult.tokenDiversity ?? 0,
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
    compoundLiquidations: compoundResult.liquidations,
    hasUniswapLP: uniswapResult.hasLP || tokenResult.hasUniswapLP,
    hasStakedETH: tokenResult.hasStakedETH,
    hasGovernanceVote: false,
    protocolsUsed,
    ens: ensName || null,
    errors,
  }
  if (firstTxResult.timestamp && (aaveResult.borrows > 0 || compoundResult.borrows > 0)) {
    rawData.daysSinceFirstDefi = Math.floor((Date.now() / 1000 - firstTxResult.timestamp) / 86400)
  }

  const result = computeScore(rawData)
  result.address = evmAddress
  const completeness = computeCompleteness(errors)
  result.dataCompleteness = completeness.dataCompleteness
  result.degradedSources = completeness.degradedSources

  const records = 'records' in txHistResult ? txHistResult.records : []
  const envelope = buildEnvelope(result, chain.slug, { txs: records })
  putEnvelope(envelope)
  return { envelope }
}
