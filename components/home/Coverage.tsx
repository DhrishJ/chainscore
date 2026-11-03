import type { ChainCoverage } from '@/lib/site/publicFacts'
import { SectionLabel } from './SectionLabel'

// Coverage, honestly stated. Rows render from lib/site/publicFacts, which a
// test pins to lib/data/coverage.generated.json.

const STATUS = {
  full: { label: 'Full', bars: 3, tone: 'bg-success' },
  degraded: { label: 'Reduced tx history', bars: 2, tone: 'bg-warning' },
  separate: { label: 'Site only', bars: 1, tone: 'bg-muted' },
} as const

function SignalBars({ status }: { status: ChainCoverage['status'] }) {
  const s = STATUS[status]
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[4px] ${i < s.bars ? s.tone : 'bg-text/15'}`}
          style={{ height: `${7 + i * 4}px` }}
        />
      ))}
    </span>
  )
}

export function Coverage({ chains }: { chains: ChainCoverage[] }) {
  const evm = chains.filter((c) => c.status !== 'separate').length
  return (
    <section id="coverage" className="frame relative scroll-mt-16 py-[16svh]" aria-labelledby="coverage-heading">
      <SectionLabel index="07" name="Coverage" aside={`${evm} EVM networks, plus Solana`} />
      <div className="mt-10 grid gap-x-[var(--gutter)] gap-y-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 id="coverage-heading" data-lines className="t-headline text-[clamp(2.6rem,4.8vw,5.25rem)] text-text">
            <span className="lm">
              <span>Coverage we</span>
            </span>
            <span className="lm">
              <span style={{ ['--d' as string]: '70ms' }}>will state</span>
            </span>
            <span className="lm">
              <span style={{ ['--d' as string]: '140ms' }}>precisely.</span>
            </span>
          </h2>
          <p data-reveal className="t-body mt-7 max-w-[38ch] text-muted">
            Where our data is thinner, the score says so: every response carries a data-completeness
            figure and names its degraded sources. We would rather tell you than have you find out.
          </p>
          <ul data-reveal className="mt-8 space-y-2.5">
            {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((k) => (
              <li key={k} className="t-label flex items-center gap-3 text-text">
                <SignalBars status={k} />
                {STATUS[k].label}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-7">
          <ul>
            {chains.map((c, i) => (
              <li key={c.slug} data-reveal className="group relative" style={{ ['--d' as string]: `${i * 50}ms` }}>
                <span className="absolute inset-x-0 top-0 h-px bg-text/25" aria-hidden />
                <div className="grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-x-4 gap-y-1.5 py-5 sm:grid-cols-[2.5rem_minmax(0,13rem)_10.5rem_1fr]">
                  <span className="t-label text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="t-headline text-[1.75rem] text-text transition-transform duration-500 ease-out group-hover:translate-x-1.5 sm:text-[2.1rem]">
                    {c.name}
                  </h3>
                  <span className="t-label flex items-center gap-2.5 text-text sm:order-none">
                    <SignalBars status={c.status} />
                    <span className="hidden sm:inline">{STATUS[c.status].label}</span>
                    <span className="sr-only sm:hidden">{STATUS[c.status].label}</span>
                  </span>
                  <p className="t-body col-span-3 text-[0.95rem] text-muted sm:col-span-1">{c.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
