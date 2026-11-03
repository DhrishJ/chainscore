import Link from 'next/link'
import { WalletInput } from '@/components/WalletInput'

// First screen. The headline is the LCP element: server rendered, visible
// on first paint, and it enters on transform alone (D-032). CS-1 renders
// behind it from the instrument stage.

export function Hero({ modelVersion, backtestMonth }: { modelVersion: string; backtestMonth: string }) {
  return (
    <div id="top" data-mark="hero" className="frame relative flex min-h-[100svh] flex-col pb-8 pt-[calc(var(--nav-h)+1.25rem)] lg:pb-10">
      <div className="grid grid-cols-12 gap-x-[var(--gutter)] border-t border-text/80 pt-3">
        <p className="t-label col-span-6 text-text sm:col-span-3">(01) Instrument</p>
        <p className="t-label col-span-6 hidden text-muted sm:col-span-5 sm:block">
          ChainScore CS-1 · onchain credit risk
        </p>
        <p className="t-label col-span-6 text-right text-muted sm:col-span-4">
          Model {modelVersion} · backtest {backtestMonth}
        </p>
      </div>

      {/* Phones: keep the upper half clear for the instrument. */}
      <div className="h-[44svh] shrink-0 sm:hidden" aria-hidden />

      {/* On phones the copy is a solid sheet that slides over the instrument. */}
      <div className="relative mt-auto -mx-[var(--gutter)] bg-background px-[var(--gutter)] pb-6 sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0">
      <h1 className="t-display relative max-w-[9ch] text-[clamp(4rem,min(12.4vw,19.5svh),15rem)] text-text sm:pt-10">
        <span className="cs-rise-lcp block" style={{ ['--d' as string]: '40ms' }}>
          Onchain
        </span>
        <span className="cs-rise-lcp block" style={{ ['--d' as string]: '110ms' }}>
          credit,
        </span>
        <span className="cs-rise-lcp block" style={{ ['--d' as string]: '180ms' }}>
          measured<span className="text-accent">.</span>
        </span>
      </h1>

      <div className="mt-8 grid grid-cols-12 items-end gap-x-[var(--gutter)] gap-y-7 lg:mt-10">
        <p className="t-body cs-rise-lcp col-span-12 max-w-[38ch] text-muted sm:col-span-6 lg:col-span-4" style={{ ['--d' as string]: '260ms' }}>
          ChainScore reads a wallet&apos;s borrowing, repayment, and liquidation history and returns a
          300 to 850 score with a calibrated probability of default. One API call per underwriting
          decision, and a backtest we publish with the misses left in.
        </p>
        <div className="cs-rise-lcp col-span-12 sm:col-span-6 lg:col-span-5" style={{ ['--d' as string]: '320ms' }}>
          <p className="t-label mb-2.5 text-muted">Check any wallet, free. No connection, no KYC.</p>
          <WalletInput />
          <div className="t-label mt-4 flex flex-wrap gap-x-6 gap-y-2 text-text">
            <a href="#api" className="link-u">
              Get the API ↗
            </a>
            <Link href="/retrospective" className="link-u">
              Read the backtest →
            </Link>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
