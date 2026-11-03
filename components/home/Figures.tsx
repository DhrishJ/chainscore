import Link from 'next/link'
import type { PublicStat } from '@/lib/site/publicFacts'
import { RollingNumber } from './RollingNumber'
import { SectionLabel } from './SectionLabel'

// The four registry-backed figures, set as a table of figures. Every value
// renders from lib/site/publicFacts (pinned to the Facts Registry by test).
// Markup stays a valid description list: each row is a <div> holding one
// <dt> and one <dd>; a figure with a source links from its label.

const NOTES: Record<string, string> = {
  training_wallets: 'Borrowers in the labelled training population.',
  backtest_recall_operating: 'Recall at the operating cutoff, on a holdout the model never saw.',
  evm_chains_covered: 'Avalanche and Scroll run with reduced transaction history. Solana is site only.',
  score_range: 'Points-to-double-odds band over calibrated probability of default.',
}

export function Figures({ stats }: { stats: PublicStat[] }) {
  return (
    <section className="frame relative pb-[14svh] pt-[6svh]" aria-labelledby="figures-heading">
      <SectionLabel index="05" name="Figures" aside="From the Facts Registry" />
      <h2 id="figures-heading" className="sr-only">
        ChainScore by the numbers
      </h2>
      <dl className="mt-6">
        {stats.map((s, i) => {
          const note = (s.registryKey && NOTES[s.registryKey]) || ''
          return (
            <div
              key={s.label}
              data-reveal
              style={{ ['--d' as string]: `${i * 80}ms` }}
              className="grid grid-cols-1 gap-3 border-t border-text/25 py-7 lg:grid-cols-12 lg:gap-[var(--gutter)] lg:py-6"
            >
              <dt className="order-2 lg:order-none lg:col-span-4 lg:self-end lg:pb-3">
                {s.href ? (
                  <Link href={s.href} className="group t-headline block text-[1.65rem] text-text">
                    <span className="link-u">{s.label}</span>
                    <span className="ml-2 inline-block text-accent transition-transform duration-500 ease-out group-hover:translate-x-1" aria-hidden>
                      →
                    </span>
                  </Link>
                ) : (
                  <span className="t-headline block text-[1.65rem] text-text">{s.label}</span>
                )}
                {note && <span className="t-body mt-2 block max-w-[34ch] text-[0.95rem] text-muted">{note}</span>}
              </dt>
              <dd className="order-1 lg:order-none lg:col-span-8 lg:text-right">
                <RollingNumber value={s.value} className="t-display tnum text-[clamp(4.2rem,10.5vw,12.5rem)] leading-none text-text" />
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
