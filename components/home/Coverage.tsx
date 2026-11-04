import type { ChainCoverage, PublicStat } from '@/lib/site/publicFacts'

// Coverage, honestly stated. Rows render from lib/site/publicFacts, which a
// test pins to lib/data/coverage.generated.json.

const STATUS: Record<ChainCoverage['status'], string> = {
  full: 'Full',
  degraded: 'Reduced history',
  separate: 'Site only',
}

export function Coverage({ chains, methodology }: { chains: ChainCoverage[]; methodology: PublicStat[] }) {
  const evm = chains.filter((c) => c.status !== 'separate').length
  const protocols = methodology.find((m) => m.registryKey === 'protocols_covered')
  return (
    <section id="coverage" aria-labelledby="coverage-heading" className="frame scroll-mt-16 border-t border-text/10 py-[16svh]">
      <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 id="coverage-heading" className="t-display text-[clamp(2.4rem,4.4vw,5rem)] text-text">
            {evm === 7 ? 'Seven' : evm} EVM networks, plus Solana.
          </h2>
          <p className="t-body mt-6 max-w-[40ch] text-muted">
            Where our data is thinner, the score says so: every response carries a data-completeness figure and
            names the sources it could not read.
          </p>
          {protocols && (
            <p className="t-body mt-4 max-w-[40ch] text-muted">
              Lending protocols read: <span className="text-text">{protocols.value}</span>.
            </p>
          )}
        </div>
        <div className="lg:col-span-7">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Coverage by chain</caption>
            <thead>
              <tr className="border-b border-text/15">
                <th scope="col" className="t-label pb-3 font-normal text-muted">
                  Chain
                </th>
                <th scope="col" className="t-label pb-3 font-normal text-muted">
                  Coverage
                </th>
                <th scope="col" className="t-label hidden pb-3 font-normal text-muted md:table-cell">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {chains.map((c) => (
                <tr key={c.slug} className="border-b border-text/15 align-baseline">
                  <th scope="row" className="t-headline w-[38%] py-4 pr-4 text-[1.5rem] font-medium text-text sm:w-[30%] md:w-[24%]">
                    {c.name}
                  </th>
                  <td className={`py-4 pr-4 text-[0.95rem] ${c.status === 'full' ? 'text-text' : 'text-muted'}`}>
                    {STATUS[c.status]}
                  </td>
                  <td className="hidden py-4 text-[0.95rem] text-muted md:table-cell">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
