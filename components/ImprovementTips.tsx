import type { Factor } from '@/types'

interface ImprovementTipsProps {
  factors: Factor[]
}

// Keyed to the model factor families (see mlScorer.ts factor_groups).
const tipsByFactor: Record<string, string> = {
  'Lending History':
    'Borrow and repay on Aave or Compound, repay promptly, and avoid liquidations. A full repayment record with zero liquidations is the highest scoring outcome.',
  'Wallet History':
    'Keep using your wallet consistently over time. Aim to stay active across at least 8 months a year. Age and steady activity are signals you cannot shortcut.',
  'DeFi Activity':
    'Use more of DeFi: supply liquidity on Uniswap, stake ETH, or earn yield onchain. Each new protocol you use adds breadth to your profile.',
  'Portfolio & Identity':
    'Register an ENS name, hold ETH, and consider a Gnosis Safe multisig. A stablecoin allocation above 10 percent of your portfolio also signals stability.',
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
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent border border-accent/30 flex items-center justify-center font-mono text-xs font-bold tabular-nums">
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
