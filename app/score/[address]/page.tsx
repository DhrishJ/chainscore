import type { Metadata } from 'next'
import Link from 'next/link'
import { isAddress } from 'viem'
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { ScoreGauge } from '@/components/ScoreGauge'
import { ScoreCountUp } from '@/components/ScoreCountUp'
import { FactorCard } from '@/components/FactorCard'
import { RadarFactors } from '@/components/explain/RadarFactors'
import { ContributionWaterfall } from '@/components/explain/ContributionWaterfall'
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

  const shortAddress = displayAddress.length > 20 ? `${displayAddress.slice(0, 10)}...${displayAddress.slice(-8)}` : displayAddress
  const networkName = chain?.name ?? 'Solana'

  return (
    <main className="frame relative max-w-[1240px] pb-24 pt-10 sm:pt-14">
      {/* Running header, as on every editorial page. */}
      <div className="grid grid-cols-12 gap-x-[var(--gutter)] border-t border-text/80 pt-3">
        <p className="t-label col-span-6 text-text sm:col-span-4">
          <Link href="/" className="link-u">
            ← ChainScore
          </Link>
        </p>
        <p className="t-label col-span-6 truncate text-right text-muted sm:col-span-8">{shortAddress}</p>
      </div>

      {/* Network tabs */}
      <nav aria-label="Network" className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-b border-text/15">
        {isSol ? (
          <Link
            href={`/score/${address}?chain=solana`}
            aria-current="page"
            className="t-label -mb-px border-b-2 border-accent pb-3 text-text"
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
                aria-current={isActive ? 'page' : undefined}
                className={`t-label -mb-px border-b-2 pb-3 transition-colors ${
                  isActive ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {c.name}
              </Link>
            )
          })
        )}
      </nav>

      {!result ? (
        <section className="py-16 sm:py-24">
          <p className="t-label text-danger">Error · not scored</p>
          <h1 className="t-display mt-5 text-[clamp(3rem,7vw,6.5rem)] text-text">
            Unable to score this wallet<span className="text-accent">.</span>
          </h1>
          <p className="t-body mt-6 max-w-[52ch] text-muted">
            This address could not be resolved or scored. Check that it&apos;s a valid EVM address or
            ENS name.
          </p>
          <Link href="/" className="btn btn-ink mt-10">
            <span>Try another wallet</span>
            <span className="btn-arrow" aria-hidden>
              →
            </span>
          </Link>
        </section>
      ) : result.noBorrowHistory ? (
        <section className="grid gap-x-[var(--gutter)] gap-y-10 py-16 sm:py-24 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="t-label text-muted">No score · {networkName}</p>
            <h1 className="t-display mt-5 text-[clamp(3rem,7vw,6.5rem)] text-text">
              No borrowing history<span className="text-accent">.</span>
            </h1>
            <p className="t-label mt-6 text-muted">{shortAddress}</p>
            <p className="t-body mt-6 max-w-[56ch] text-text">
              ChainScore is a credit score for borrowers. It only rates wallets that have an onchain
              borrowing record, because repayment behavior is what a credit score measures. We did not
              find any borrowing activity for this wallet on the lending protocols we track (
              {networkName}).
            </p>
            <p className="t-body mt-4 max-w-[56ch] text-muted">
              Borrow and repay on a supported lending protocol to build a credit history, then check
              back to see your score.
            </p>
            <Link href="/" className="btn btn-ink mt-10">
              <span>Check another wallet</span>
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </Link>
          </div>
          <div className="lg:col-span-4 lg:col-start-9">
            <div className="border border-text/20 bg-ink p-5 text-ink-fg">
              <p className="t-label text-ink-muted">What the API returns</p>
              <pre className="mt-4 font-mono text-[12.5px] leading-[1.8]">
                <code>
                  {'{\n  "noBorrowHistory": '}
                  <span className="text-ink-amber">true</span>
                  {',\n  "score": '}
                  <span className="text-ink-accent">0</span>
                  {',\n  "factors": []\n}'}
                </code>
              </pre>
            </div>
          </div>
        </section>
      ) : result.newWallet ? (
        <section className="py-16 sm:py-24">
          <p className="t-label text-muted">No history · {networkName}</p>
          <h1 className="t-display mt-5 text-[clamp(3rem,7vw,6.5rem)] text-text">
            No onchain history<span className="text-accent">.</span>
          </h1>
          <p className="t-label mt-6 text-muted">{shortAddress}</p>
          <p className="t-body mt-6 max-w-[52ch] text-muted">
            This wallet has no transaction history on {networkName}. Start using it to build your
            onchain credit profile.
          </p>
          <Link href="/" className="btn btn-ink mt-10">
            <span>Check another wallet</span>
            <span className="btn-arrow" aria-hidden>
              →
            </span>
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-16 pt-10">
          {/* Reading */}
          <section className="grid items-center gap-x-[var(--gutter)] gap-y-8 lg:grid-cols-12" aria-label="Score">
            <div className="flex justify-center lg:col-span-5 lg:justify-start">
              <ScoreGauge score={result.score} />
            </div>

            <div className="lg:col-span-7">
              <p className="t-label text-muted">{result.ens ? result.ens : shortAddress}</p>

              <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
                <ScoreCountUp
                  target={result.score}
                  className={`t-display tnum text-[clamp(5.5rem,11vw,9.5rem)] leading-none ${scoreTextColor(result.score)}`}
                />
                <div className="pb-3">
                  <span className={`t-headline inline-block border px-3 py-1 text-2xl ${gradeColor(result.grade)}`}>
                    {result.grade}
                  </span>
                  <p className="t-label mt-2 text-muted">Better than {result.percentile}% of wallets</p>
                </div>
              </div>

              <dl className="mt-8 grid grid-cols-2 gap-x-[var(--gutter)] sm:grid-cols-4">
                {[
                  ['Network', networkName],
                  [
                    'Wallet age',
                    result.walletAge > 365
                      ? `${Math.floor(result.walletAge / 365)}y ${Math.floor((result.walletAge % 365) / 30)}m`
                      : `${Math.floor(result.walletAge / 30)}m`,
                  ],
                  ['Transactions', result.totalTxns.toLocaleString()],
                  ['Protocols', result.protocolsUsed.length > 0 ? result.protocolsUsed.join(', ') : 'None detected'],
                ].map(([k, v]) => (
                  <div key={k} className="border-t border-text/20 py-3">
                    <dt className="t-label text-muted">{k}</dt>
                    <dd className="t-body mt-1 text-[0.95rem] text-text">{v}</dd>
                  </div>
                ))}
              </dl>

              {/* Provenance: every displayed score names the model that
                  produced it, when it was computed, and, when a data source
                  was degraded, how complete the inputs were. Real values
                  from the scoring result, never placeholders. */}
              <div className="t-label mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                {result.modelVersion && (
                  <span title="The versioned model that produced this score">
                    Model <span className="text-text">{result.modelVersion}</span>
                  </span>
                )}
                <span aria-hidden="true">·</span>
                <span title="When this score was computed from onchain data">
                  Scored {new Date(result.timestamp).toISOString().replace('T', ' ').slice(0, 16)} UTC
                </span>
                {typeof result.calibratedPD === 'number' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span title="Calibrated probability of default the score is derived from">
                      PD {(result.calibratedPD * 100).toFixed(1)}%
                    </span>
                  </>
                )}
                {typeof result.dataCompleteness === 'number' && result.dataCompleteness < 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-warning">{Math.round(result.dataCompleteness * 100)}% data completeness</span>
                  </>
                )}
              </div>
              {/* Degraded-state notice (Phase 6): the coverage table promises
                  we say so when data is thinner; a hover tooltip is not
                  saying so. Visible, named sources, no hiding. */}
              {typeof result.dataCompleteness === 'number' && result.dataCompleteness < 1 && (
                <div className="mt-4 flex items-start gap-3 border-l-2 border-warning bg-warning/10 px-4 py-3">
                  <p className="t-body text-[0.9rem] text-text">
                    Reduced data coverage on this score
                    {(result.degradedSources ?? []).length > 0 && <> ({(result.degradedSources ?? []).join(', ')})</>}. The
                    model saw less history than usual; treat the score with wider error bars.
                  </p>
                </div>
              )}

              <div className="mt-6">
                <ShareButton address={result.address} score={result.score} grade={result.grade} />
              </div>
            </div>
          </section>

          {/* Factor breakdown */}
          <section aria-labelledby="factors-heading">
            <div className="flex items-baseline justify-between gap-6 border-t border-text/80 pt-3">
              <h2 id="factors-heading" className="t-label text-text">
                What drives this score
              </h2>
              <span className="t-label text-accent">Model contributions</span>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              {result.factors.map((factor) => (
                <FactorCard key={factor.name} factor={factor} />
              ))}
            </div>

            {result.factors.length > 0 && !result.newWallet && !result.noBorrowHistory && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <RadarFactors factors={result.factors} />
                <ContributionWaterfall contributions={result.topContributions} />
              </div>
            )}
          </section>

          <ImprovementTips factors={result.factors} />

          <section aria-labelledby="another-heading" className="border-t border-text/80 pt-3">
            <h2 id="another-heading" className="t-label text-text">
              Measure another wallet
            </h2>
            <div className="mt-6 max-w-3xl">
              <WalletInput placeholder="Wallet address or ENS name" defaultChain={chainSlug} />
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

