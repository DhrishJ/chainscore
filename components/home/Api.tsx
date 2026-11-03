import Link from 'next/link'
import { ApiConsole, type ConsoleTab } from './ApiConsole'
import { SectionLabel } from './SectionLabel'

// The partner API on the ink slab. `dark` scopes the graphite tokens to this
// section, so it reads as a terminal in either theme.

const SPEC = [
  ['Auth', 'Bearer keys, hashed at rest'],
  ['Webhooks', 'Signed score-change events'],
  ['Limits', 'Per-key rate limits, usage in headers'],
  ['Contract', 'OpenAPI 3.1, versioned envelope'],
  ['Provenance', 'Model version, as-of time, completeness'],
]

export function Api({ tabs }: { tabs: ConsoleTab[] }) {
  return (
    <section id="api" className="dark relative scroll-mt-14 bg-background text-text" aria-labelledby="api-heading">
      <div className="frame py-[16svh]">
        <SectionLabel index="08" name="API" aside="v1 · OpenAPI 3.1" />
        <div className="mt-10 grid gap-x-[var(--gutter)] gap-y-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 id="api-heading" data-lines className="t-headline text-[clamp(2.6rem,4.8vw,5.25rem)] text-text">
              <span className="lm">
                <span>A versioned API</span>
              </span>
              <span className="lm">
                <span style={{ ['--d' as string]: '70ms' }}>built for</span>
              </span>
              <span className="lm">
                <span style={{ ['--d' as string]: '140ms' }}>underwriting.</span>
              </span>
            </h2>
            <p data-reveal className="t-body mt-7 max-w-[40ch] text-muted">
              Authenticated scoring, signed webhooks for monitored wallets, and a contract you can
              build against. Every response is versioned and carries its provenance, so a decision
              made today can be explained next year.
            </p>
            <dl data-reveal className="mt-9">
              {SPEC.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-4 border-t border-text/15 py-3">
                  <dt className="t-label text-muted">{k}</dt>
                  <dd className="t-body text-[0.95rem] text-text">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href="/api/v1/openapi" className="btn btn-signal">
                <span>OpenAPI spec</span>
                <span className="btn-arrow" aria-hidden>
                  ↗
                </span>
              </a>
              <a href="mailto:api@chainscore.dev?subject=API%20key%20request" className="btn btn-line">
                <span>Request an API key</span>
                <span className="btn-arrow" aria-hidden>
                  →
                </span>
              </a>
              <Link href="/pricing" className="t-label link-u self-start py-3 text-text sm:self-center sm:px-3">
                Pricing
              </Link>
            </div>
          </div>
          <div data-reveal className="lg:col-span-7 lg:pt-2">
            <ApiConsole tabs={tabs} />
            <p className="t-label mt-4 text-muted">
              Example wallet. PD and percentile follow the model&apos;s score band and deciles.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
