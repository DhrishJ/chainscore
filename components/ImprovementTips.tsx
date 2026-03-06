import type { Factor } from '@/types'

interface ImprovementTipsProps {
  factors: Factor[]
}

const tipsByFactor: Record<string, string> = {
  'Wallet Age':
    'Keep using your wallet consistently over time. Age is the single most reliable signal of a trustworthy on-chain history — you cannot shortcut this.',
  'Transaction Volume':
    'Make regular, meaningful transactions. Aim to be active in at least 8 months per year. Consistency matters more than volume.',
  'DeFi Protocol Breadth':
    'Explore DeFi: supply liquidity on Uniswap, stake ETH via Lido, or earn yield on Aave. Each new protocol you use adds breadth to your profile.',
  'Repayment Behavior':
    'If you use lending protocols, repay loans promptly and avoid liquidations. A 100% repayment rate with zero liquidations is the highest-scoring outcome.',
  'Portfolio Stability':
    'Register an ENS name, hold ETH long-term, and consider using a Gnosis Safe multisig. Stablecoins above 10% of your portfolio also signal stability.',
}

export function ImprovementTips({ factors }: ImprovementTipsProps) {
  const weakest = [...factors]
    .sort((a, b) => a.rawScore - b.rawScore)
    .slice(0, 3)

  if (weakest.length === 0) return null

  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <h3 className="font-semibold text-text font-grotesk mb-4">How to Improve Your Score</h3>
      <div className="flex flex-col gap-4">
        {weakest.map((factor, i) => (
          <div key={factor.name} className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent border border-accent/30 flex items-center justify-center text-xs font-bold">
              {i + 1}
            </div>
            <div>
              <p className="text-text text-sm font-medium">{factor.name}</p>
              <p className="text-muted text-xs mt-1 leading-relaxed">
                {tipsByFactor[factor.name] || factor.explanation}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
