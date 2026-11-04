import Link from 'next/link'
import { WalletInput } from '@/components/WalletInput'

// First screen: what ChainScore is, and the product itself (the score
// check). On wide screens the instrument sits beside this column; on
// phones it is placed into [data-instrument-slot] below the input.

export function Hero({ alta }: { alta: string }) {
  return (
    <section id="top" data-stop="hero" aria-labelledby="hero-heading" className="flex min-h-[calc(100svh-var(--nav-h))] flex-col justify-center pb-12 pt-10 lg:pb-20">
      <h1 id="hero-heading" className="t-display max-w-[16ch] text-[clamp(2.4rem,4.6vw,4.4rem)] text-text">
        Credit scores for onchain borrowers
      </h1>
      <p className="t-body mt-6 max-w-[52ch] text-[1.0625rem] text-muted">
        ChainScore turns a wallet&apos;s borrowing, repayment and liquidation history into a score from 300 to 850,
        with a calibrated probability of default. Lenders call it from their underwriting code. Anyone can check a
        wallet here.
      </p>
      <div className="mt-8 max-w-[40rem]">
        <WalletInput />
        <p className="t-label mt-3 text-muted">Free. No wallet connection or sign-up.</p>
      </div>
      <div data-instrument-slot className="mt-10 lg:hidden" />
      <div className="mt-10 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[0.9375rem] lg:mt-14">
        <a href="#report" className="link-u text-text">
          See a full report
        </a>
        <Link href="/retrospective" className="link-u text-text">
          Read the backtest
        </Link>
        <a href="#api" className="link-u text-text">
          API reference
        </a>
      </div>
      <p className="t-label mt-10 text-muted">{alta}</p>
    </section>
  )
}
