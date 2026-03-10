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
import { getFirstTransaction, getTransactionHistory } from '@/lib/data/etherscan'
import { getTokenBalances } from '@/lib/data/alchemy'
import { getAaveActivity, getCompoundActivity, getUniswapActivity } from '@/lib/data/thegraph'
import { computeScore } from '@/lib/data/mlScorer'
import { recentScores } from '@/lib/recentScores'
import { getChain, CHAIN_LIST } from '@/lib/chains'
import type { ScoreResult, RawWalletData } from '@/types'

interface Props {
  params: { address: string }
  searchParams: { chain?: string }
}

// ENS resolution is always on Ethereum mainnet
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(
    'https://eth-mainnet.g.alchemy.com/v2/' + (process.env.ALCHEMY_API_KEY || '')
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
      : { txCount: 0, activeMonthsLast12: 0, error: 'fetch failed' }
  const tokenResult =
    tokenData.status === 'fulfilled'
      ? tokenData.value
      : {
          totalPortfolioUSD: 0,
          stablecoinPct: 0,
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
    compoundLiquidations: compoundResult.liquidations,
    hasUniswapLP: uniswapResult.hasLP || tokenResult.hasUniswapLP,
    hasStakedETH: tokenResult.hasStakedETH,
    hasGovernanceVote: false,
    protocolsUsed,
    ens: ensName || (input.endsWith('.eth') ? input : null),
    errors,
  }

  const result = computeScore(rawData)
  result.address = address
  recentScores.add({ address, score: result.score, timestamp: Date.now() })
  return result
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chainscore.xyz'
  const { address } = params

  return {
    title: `ChainScore — ${address.endsWith('.eth') ? address : address.slice(0, 10) + '...'}`,
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
      return 'text-green-400 border-green-400/30 bg-green-400/10'
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
  if (score >= 650) return 'text-green-400'
  if (score >= 550) return 'text-warning'
  if (score >= 450) return 'text-orange-400'
  return 'text-danger'
}

export default async function ScorePage({ params, searchParams }: Props) {
  const { address } = params
  const chainSlug = searchParams.chain || 'ethereum'
  const chain = getChain(chainSlug)
  const result = await resolveAndScore(address, chainSlug)
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
        {CHAIN_LIST.map((c) => {
          const isActive = c.slug === chainSlug
          return (
            <Link
              key={c.slug}
              href={`/score/${address}?chain=${c.slug}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-grotesk border transition-all ${
                isActive
                  ? 'bg-accent text-background border-accent'
                  : 'text-muted border-border hover:border-accent/40 hover:text-text'
              }`}
            >
              {c.name}
            </Link>
          )
        })}
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
            className="px-5 py-2.5 rounded-xl bg-accent text-background font-semibold text-sm"
          >
            Try Another Wallet
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
            This wallet has no transaction history on {chain.name}. Start using it to build
            your on-chain credit profile.
          </p>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl bg-accent text-background font-semibold text-sm"
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
                    <p className="text-text text-sm font-medium">{chain.name}</p>
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
            <h2 className="font-grotesk font-semibold text-muted mb-3 text-xs uppercase tracking-wider">
              Score Breakdown
            </h2>
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
