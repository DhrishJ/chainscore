import Link from 'next/link'
import { WalletInput } from '@/components/WalletInput'
import { Plate } from '@/components/site/Plate'
import { Drift } from '@/components/site/Drift'

// First screen. The calibre photograph is the backdrop on desktop and sits
// above the copy on phones; text never lies on the metal. The headline is
// server rendered and never animates. The plate settles once on load and
// then drifts with the scroll, transform only.

export function Hero({ alta }: { alta: string }) {
  return (
    <section id="top" aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
      <div className="relative h-[calc(var(--nav-h)+70vw)] overflow-hidden sm:h-[calc(var(--nav-h)+56vw)] lg:absolute lg:inset-0 lg:-z-10 lg:h-auto">
        <Drift speed={0.14} className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[calc(var(--nav-h)-8vw)] w-[132vw] -translate-x-[51%] sm:w-[100vw] sm:-translate-x-1/2 lg:left-auto lg:right-[-30vw] lg:top-[2svh] lg:w-[min(96vw,160svh)] lg:translate-x-0">
            <Plate
              name="calibre-hero"
              priority
              sizes="(min-width: 1024px) 96vw, 132vw"
              imgClassName="cs-settle h-auto w-full"
            />
          </div>
        </Drift>
      </div>

      <div className="frame relative flex flex-col pb-8 lg:min-h-[100svh] lg:justify-end lg:pb-10 lg:pt-[calc(var(--nav-h)+2rem)]">
        <div className="lg:max-w-[min(38rem,41vw)]">
          <h1 id="hero-heading" className="t-display text-[clamp(3rem,6.1vw,7.4rem)] text-text">
            Credit scores for onchain borrowers.
          </h1>
          <p className="t-body mt-6 max-w-[44ch] text-muted lg:mt-8">
            ChainScore reads a wallet&apos;s borrowing, repayment and liquidation history and returns a score from 300
            to 850 with a calibrated probability of default. Lenders call it through an API; anyone can check a wallet
            here, free.
          </p>
          <div className="mt-8">
            <WalletInput />
            <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[0.9375rem]">
              <Link href="/retrospective" className="link-u text-text">
                Read the backtest
              </Link>
              <a href="#api" className="link-u text-text">
                See the API
              </a>
              <span className="text-muted">No wallet connection, no KYC.</span>
            </div>
          </div>
        </div>

        <p className="t-label mt-12 border-t border-text/15 pt-4 text-muted lg:mt-16">{alta}</p>
      </div>
    </section>
  )
}
