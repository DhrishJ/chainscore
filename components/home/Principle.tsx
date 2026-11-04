import { Plate } from '@/components/site/Plate'
import { Drift } from '@/components/site/Drift'

// The borrower gate, stated as a principle, next to the part of the
// calibre that works the same way: the escapement holds the train still
// until the balance swings through it.

const ROWS = [
  {
    who: 'Has borrowed onchain',
    gets: 'A score from 300 to 850, a calibrated default probability, the factor breakdown and integrity checks.',
    code: '"score": 742',
  },
  {
    who: 'Has never borrowed',
    gets: 'No score. A flag your underwriting logic can branch on, instead of a number we made up.',
    code: '"noBorrowHistory": true',
  },
]

export function Principle() {
  return (
    <section aria-labelledby="principle-heading" className="relative">
      <div className="frame pb-[10svh] pt-[18svh] lg:pt-[24svh]">
        <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-10 lg:grid-cols-12">
          <h2 id="principle-heading" className="t-display text-[clamp(2.6rem,5.4vw,6.2rem)] text-text lg:col-span-8">
            Most wallets should not have a credit score.
          </h2>
          <div className="space-y-5 lg:col-span-4 lg:pt-3">
            <p className="t-body text-muted">
              A credit score measures how someone repays. Offchain bureaus do not score people who have never used
              credit, and neither do we: ChainScore only rates wallets with a real borrowing record.
            </p>
            <p className="t-body text-muted">
              That is most of what makes the number worth pricing against. It is learned from what borrowers did,
              not guessed from what a wallet holds.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-end gap-x-[var(--gutter)] gap-y-10 lg:grid-cols-12">
        <figure className="relative lg:col-span-8">
          <div className="relative aspect-[16/10] overflow-hidden">
            <Drift speed={0.07} className="absolute inset-[-6%_0]">
              <Plate
                name="calibre-escapement"
                sizes="(min-width: 1024px) 66vw, 100vw"
                imgClassName="h-full w-full object-cover"
              />
            </Drift>
          </div>
          <figcaption className="t-label mt-4 max-w-[60ch] px-[var(--gutter)] text-muted">
            The escapement holds the gear train still until the balance swings through it. Nothing in the movement
            advances on its own.
          </figcaption>
        </figure>

        <dl className="frame lg:col-span-4 lg:pl-0">
          {ROWS.map((r) => (
            <div key={r.who} className="border-t border-text/15 py-6">
              <dt className="t-headline text-[1.6rem] text-text">{r.who}</dt>
              <dd className="t-body mt-2 text-[0.98rem] text-muted">{r.gets}</dd>
              <dd className="t-code mt-3 text-text">{r.code}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
