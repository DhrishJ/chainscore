import type { Metadata } from 'next'
import Link from 'next/link'
import { isAddress } from 'viem'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { ScoreGauge } from '@/components/ScoreGauge'
import { ScoreCountUp } from '@/components/ScoreCountUp'
import { FactorCard } from '@/components/FactorCard'
import { ImprovementTips } from '@/components/ImprovementTips'
import { ShareButton } from '@/components/ShareButton'
import { WalletInput } from '@/components/WalletInput'
import { getFirstTransaction, getTransactionHistory } from '@/lib/ingest/txHistory'
import { computeCompleteness } from '@/lib/ingest/completeness'
import { getTokenBalances } from '@/lib/data/alchemy'
import { getAaveActivity, getCompoundActivity, getUniswapActivity } from '@/lib/data/thegraph'
import { computeScore } from '@/lib/data/mlScorer'
import { recentScores } from '@/lib/recentScores'
import { getChain, CHAIN_LIST } from '@/lib/chains'
import { isSolanaAddress } from '@/lib/solanaAuth'
import {
  getSolanaTransactionHistory,
  getSolanaBalance,
  getSolanaTokenData,
  getSolanaDefiActivity,
} from '@/lib/data/helius'
import { computeSolanaScore } from '@/lib/data/solanaScorer'
import { env } from '@/lib/env.server'
import { clientEnv } from '@/lib/env.client'
import type { ScoreResult, RawWalletData } from '@/types'

interface Props {
  params: { address: string }
  searchParams: { chain?: string }
}

// ENS resolution is always on Ethereum mainnet
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(
    'https://eth-mainnet.g.alchemy.com/v2/' + env.ALCHEMY_API_KEY
  ),
})

async function resolveAndScore(input: string, chainSlug: string): Promise<ScoreResult | null> {
  const chain = getChain(chainSlug)
  let address = input

  if (input.endsWith('.eth')) {
    try {
      const resolved = await ensClient.getEnsAddress({ name: input })
      if (!resolved) return null
      address = resolved
    } catch {
      return null
    }
  }

  if (!isAddress(address)) return null

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

  const firstTxResult =
    firstTx.status === 'fulfilled' ? firstTx.value : { timestamp: null, error: 'fetch failed' }
  const txHistResult =
    txHistory.status === 'fulfilled'
      ? txHistory.value
      : { txCount: 0, txCount30d: 0, txCount90d: 0, txCount180d: 0, activeDaysCount: 0, activeMonthsLast12: 0, error: 'fetch failed' }
  const tokenResult =
    tokenData.status === 'fulfilled'
      ? tokenData.value
      : {
          totalPortfolioUSD: 0,
          stablecoinPct: 0,
          tokenDiversity: 0,
          hasETH: false,
          hasStakedETH: false,
          hasENS: false,
          hasAave: false,
          hasCompound: false,
          hasUniswapLP: false,
          isGnosisSafe: false,
          error: 'fetch failed',
        }
  const aaveResult =
    aaveData.status === 'fulfilled'
      ? aaveData.value
      : { borrows: 0, repays: 0, liquidations: 0, error: 'fetch failed' }
  const compoundResult =
    compoundData.status === 'fulfilled'
      ? compoundData.value
      : { borrows: 0, repays: 0, liquidations: 0, error: 'fetch failed' }
  const uniswapResult =
    uniswapData.status === 'fulfilled' ? uniswapData.value : { hasLP: false, error: 'fetch failed' }
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
    daysSinceFirstDefi: (firstTxResult.timestamp && (aaveResult.borrows > 0 || compoundResult.borrows > 0))
      ? Math.floor((Date.now() / 1000 - firstTxResult.timestamp) / 86400) : 0,
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
    ens:                ensName || (input.endsWith('.eth') ? input : null),
    errors,
  }

  const result = computeScore(rawData)
  result.address = address
  const completeness = computeCompleteness(errors)
  result.dataCompleteness = completeness.dataCompleteness
  result.degradedSources = completeness.degradedSources
  if (!result.noBorrowHistory && !result.newWallet) {
    recentScores.add({ address, score: result.score, timestamp: Date.now() })
  }
  return result
}

async function resolveAndScoreSolana(address: string): Promise<ScoreResult | null> {
  if (!isSolanaAddress(address)) return null

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
  if (!result.noBorrowHistory && !result.newWallet) {
    recentScores.add({ address, score: result.score, timestamp: Date.now() })
  }
  return result
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL || 'https://chainscore.dev'
  const { address } = params

  return {
    title: `ChainScore | ${address.endsWith('.eth') ? address : address.slice(0, 10) + '...'}`,
    openGraph: {
      images: [`${appUrl}/api/og/${address}`],
    },
    twitter: {
      card: 'summary_large_image',
      images: [`${appUrl}/api/og/${address}`],
    },
  }
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-accent border-accent/30 bg-accent/10'
    case 'B':
      return 'text-blue-400 border-blue-400/30 bg-blue-400/10'
    case 'C':
      return 'text-warning border-warning/30 bg-warning/10'
    case 'D':
      return 'text-orange-400 border-orange-400/30 bg-orange-400/10'
    default:
      return 'text-danger border-danger/30 bg-danger/10'
  }
}

function scoreTextColor(score: number): string {
  if (score >= 750) return 'text-accent'
  if (score >= 650) return 'text-blue-400'
  if (score >= 550) return 'text-warning'
  if (score >= 450) return 'text-orange-400'
  return 'text-danger'
}

export default async function ScorePage({ params, searchParams }: Props) {
  const { address } = params
  const isSol = isSolanaAddress(address)
  const chainSlug = searchParams.chain || (isSol ? 'solana' : 'ethereum')
  const chain = isSol || chainSlug === 'solana' ? null : getChain(chainSlug)
  const result = isSol || chainSlug === 'solana'
    ? await resolveAndScoreSolana(address)
    : await resolveAndScore(address, chainSlug)
  const displayAddress = result?.ens || address

  return (
    <main className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-muted text-sm hover:text-text transition-colors mb-8"
      >
        <span>←</span> ChainScore
      </Link>

      {/* Chain selector tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {isSol ? (
          <Link
            href={`/score/${address}?chain=solana`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold font-grotesk border transition-all bg-accent text-white border-accent"
          >
            Solana
          </Link>
        ) : (
          CHAIN_LIST.map((c) => {
            const isActive = c.slug === chainSlug
            return (
              <Link
                key={c.slug}
                href={`/score/${address}?chain=${c.slug}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-grotesk border transition-all ${
                  isActive
                    ? 'bg-accent text-white border-accent'
                    : 'text-muted border-border hover:border-accent/40 hover:text-text'
                }`}
              >
                {c.name}
              </Link>
            )
          })
        )}
      </div>

      {!result ? (
        <div className="rounded-2xl bg-card border border-border p-8 text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <h1 className="font-grotesk text-xl font-semibold text-text mb-2">
            Unable to Score Wallet
          </h1>
          <p className="text-muted text-sm mb-6">
            This address could not be resolved or scored. Check that it&apos;s a valid EVM
            address or ENS name.
          </p>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm"
          >
            Try Another Wallet
          </Link>
        </div>
      ) : result.noBorrowHistory ? (
        <div className="rounded-2xl bg-card border border-border p-8 sm:p-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
            <span className="font-mono text-2xl text-muted">?</span>
          </div>
          <h1 className="font-grotesk text-2xl font-bold text-text mb-3">
            No Borrowing History
          </h1>
          <p className="text-muted text-xs font-mono mb-5">
            {displayAddress.length > 20
              ? `${displayAddress.slice(0, 10)}...${displayAddress.slice(-8)}`
              : displayAddress}
          </p>
          <p className="text-text/80 text-sm leading-relaxed mb-6 max-w-md mx-auto">
            ChainScore is a credit score for borrowers. It only rates wallets that have an
            onchain borrowing record, because repayment behavior is what a credit score
            measures. We did not find any borrowing activity for this wallet on the lending
            protocols we track ({chain?.name ?? 'Solana'}).
          </p>
          <p className="text-muted text-sm leading-relaxed mb-7 max-w-md mx-auto">
            Borrow and repay on a supported lending protocol to build a credit history, then
            check back to see your score.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-colors"
          >
            Check Another Wallet
          </Link>
        </div>
      ) : result.newWallet ? (
        <div className="rounded-2xl bg-card border border-border p-8 text-center">
          <div className="text-5xl font-bold font-grotesk text-muted mb-4">300</div>
          <h1 className="font-grotesk text-xl font-semibold text-text mb-2">
            No On-Chain History
          </h1>
          <p className="text-muted text-xs font-mono mb-4">
            {displayAddress.length > 20
              ? `${displayAddress.slice(0, 10)}...${displayAddress.slice(-8)}`
              : displayAddress}
          </p>
          <p className="text-muted text-sm mb-6 max-w-sm mx-auto">
            This wallet has no transaction history on {chain?.name ?? 'Solana'}. Start using it to build
            your onchain credit profile.
          </p>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm"
          >
            Check Another Wallet
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Header card */}
          <div className="rounded-2xl bg-card border border-border p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-shrink-0">
                <ScoreGauge score={result.score} />
              </div>

              <div className="flex-1 text-center sm:text-left">
                <p className="text-muted text-xs font-mono mb-1">
                  {result.ens
                    ? result.ens
                    : `${result.address.slice(0, 10)}...${result.address.slice(-8)}`}
                </p>

                <ScoreCountUp
                  target={result.score}
                  className={`text-5xl sm:text-6xl font-bold font-grotesk ${scoreTextColor(result.score)}`}
                />

                <div className="flex items-center gap-3 mt-3 justify-center sm:justify-start">
                  <span
                    className={`px-3 py-1 rounded-full border text-lg font-bold font-grotesk ${gradeColor(result.grade)}`}
                  >
                    {result.grade}
                  </span>
                  <span className="text-muted text-sm">
                    Better than {result.percentile}% of wallets
                  </span>
                </div>

                <div className="flex flex-wrap gap-4 mt-4 justify-center sm:justify-start">
                  <div>
                    <p className="text-muted text-xs">Network</p>
                    <p className="text-text text-sm font-medium">{chain?.name ?? 'Solana'}</p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Wallet Age</p>
                    <p className="text-text text-sm font-medium">
                      {result.walletAge > 365
                        ? `${Math.floor(result.walletAge / 365)}y ${Math.floor(
                            (result.walletAge % 365) / 30
                          )}m`
                        : `${Math.floor(result.walletAge / 30)}m`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Transactions</p>
                    <p className="text-text text-sm font-medium">
                      {result.totalTxns.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Protocols</p>
                    <p className="text-text text-sm font-medium">
                      {result.protocolsUsed.length > 0
                        ? result.protocolsUsed.join(', ')
                        : 'None detected'}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <ShareButton
                    address={result.address}
                    score={result.score}
                    grade={result.grade}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Factor breakdown */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-grotesk font-semibold text-muted text-xs uppercase tracking-wider">
                What Drives Your Score
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs border border-accent/20 font-medium">
                ML model
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {result.factors.map((factor) => (
                <FactorCard key={factor.name} factor={factor} />
              ))}
            </div>
          </div>

          <ImprovementTips factors={result.factors} />

          <div className="rounded-2xl bg-card border border-border p-6">
            <h2 className="font-grotesk font-semibold text-text mb-4">Check Another Wallet</h2>
            <WalletInput placeholder="Enter address or ENS name" defaultChain={chainSlug} />
          </div>
        </div>
      )}
    </main>
  )
}
