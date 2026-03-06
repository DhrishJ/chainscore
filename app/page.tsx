import { WalletInput } from '@/components/WalletInput'
import { RecentScoresTicker } from '@/components/RecentScoresTicker'

const features = [
  {
    title: 'What We Measure',
    description:
      'Wallet age, transaction consistency, DeFi protocol usage (Aave, Compound, Uniswap, Lido), and on-chain loan repayment behavior — five factors, one score. Supports Ethereum, Polygon, Arbitrum, Optimism, and Base.',
    icon: '◎',
  },
  {
    title: 'Why It Matters',
    description:
      'DeFi lending, NFT collateral, and on-chain identity all benefit from a verifiable credit signal. Your score is computed from public blockchain data — no KYC required.',
    icon: '⬡',
  },
  {
    title: 'Who Uses It',
    description:
      'DeFi protocols evaluating loan risk, DAOs assessing member trust, and individuals who want to understand and improve their on-chain financial reputation.',
    icon: '△',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-accent text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          5 Chains • Free • No KYC
        </div>

        <h1 className="font-grotesk text-4xl sm:text-5xl md:text-6xl font-bold text-text leading-tight max-w-3xl">
          Your On-Chain Wallet{' '}
          <span className="text-accent">Credit Score</span>
        </h1>

        <p className="mt-5 text-muted text-base sm:text-lg max-w-xl">
          Paste any EVM wallet address or ENS name. Get a 300–850 score based on
          on-chain history, DeFi activity, and repayment behavior — across Ethereum,
          Polygon, Arbitrum, Optimism, and Base.
        </p>

        <div className="mt-10 w-full">
          <WalletInput />
        </div>

        {/* Recent scores */}
        <div className="mt-8">
          <RecentScoresTicker />
        </div>
      </section>

      {/* Feature cards */}
      <section className="px-4 pb-24 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-3"
            >
              <span className="text-accent text-2xl">{f.icon}</span>
              <h2 className="font-grotesk font-semibold text-text">{f.title}</h2>
              <p className="text-muted text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-6 text-center text-muted text-xs">
        ChainScore uses public on-chain data only. Scores are for informational purposes and not
        financial advice.
      </footer>
    </main>
  )
}
