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
    <div className="border-t border-text/15 pt-5">
      <h3 className="t-headline text-[1.6rem] text-text">How to improve this score</h3>
      <p className="t-label mt-1 text-muted">Weakest factor first.</p>
      <ul className="mt-5">
        {weakest.map((factor) => (
          <li key={factor.name} className="border-t border-text/10 py-4 first:border-t-0 first:pt-0">
            <p className="text-[0.95rem] font-medium text-text">{factor.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{tipsByFactor[factor.name] || factor.explanation}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
