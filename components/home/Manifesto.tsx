import { ManifestoWords } from './ManifestoWords'
import { SectionLabel } from './SectionLabel'

// The borrower gate, stated as a principle. The instrument turns on the
// right while this reads.

export function Manifesto() {
  return (
    <div data-mark="manifesto" className="frame relative min-h-[118svh] pt-[62svh] sm:pt-[22svh]">
      <div className="grid grid-cols-12 gap-x-[var(--gutter)]">
        <div className="col-span-12 -mx-[var(--gutter)] bg-background px-[var(--gutter)] py-6 sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 lg:col-span-7">
          <SectionLabel index="02" name="Principle" aside="The borrower gate" />
          <ManifestoWords
            text="Most wallets should not have a credit score."
            className="t-serif mt-10 max-w-[13ch] text-[clamp(2.9rem,6.3vw,7rem)] text-text"
          />
          <div className="mt-12 grid gap-x-[var(--gutter)] gap-y-6 sm:grid-cols-2">
            <p data-reveal className="t-body max-w-[36ch] text-muted">
              A credit score exists to measure how someone repays. Offchain bureaus do not score
              people who have never used credit, and neither do we. ChainScore only rates wallets
              with a real borrowing record.
            </p>
            <p data-reveal className="t-body max-w-[36ch] text-muted" style={{ ['--d' as string]: '120ms' }}>
              When a wallet has never borrowed, the API says exactly that, with a flag your
              underwriting logic can branch on. No invented numbers. That honesty is what makes the
              score worth pricing against.
            </p>
          </div>

          <div className="mt-14">
            <div className="relative">
              <span data-rule className="absolute inset-x-0 top-0 h-px bg-text/80" aria-hidden />
            </div>
            <dl>
              <div data-reveal className="grid grid-cols-[1fr] gap-2 border-b border-text/20 py-5 sm:grid-cols-[13rem_1fr_auto] sm:items-baseline sm:gap-6">
                <dt className="t-headline text-2xl text-text">Has borrowed onchain</dt>
                <dd className="t-body text-muted">
                  A full 300 to 850 score with calibrated default probability, factor breakdown, and
                  integrity signals.
                </dd>
                <dd className="t-label text-accent">score: 742</dd>
              </div>
              <div data-reveal className="grid grid-cols-[1fr] gap-2 border-b border-text/20 py-5 sm:grid-cols-[13rem_1fr_auto] sm:items-baseline sm:gap-6" style={{ ['--d' as string]: '100ms' }}>
                <dt className="t-headline text-2xl text-text">Never borrowed</dt>
                <dd className="t-body text-muted">
                  An explicit no-history flag instead of a misleading number, so your logic can branch
                  on it.
                </dd>
                <dd className="t-label text-text">noBorrowHistory: true</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
