import Link from 'next/link'
import { ApiConsole, type ConsoleTab } from './ApiConsole'

// The partner API, shown the way a builder reads it: what you send, what
// comes back, and what the contract guarantees.

const SPEC = [
  ['Auth', 'Bearer keys, hashed at rest'],
  ['Webhooks', 'Signed score-change events for wallets you monitor'],
  ['Limits', 'Per-key rate limits, usage in the response headers'],
  ['Contract', 'OpenAPI 3.1, versioned envelope'],
  ['Provenance', 'Model version, as-of time and data completeness on every response'],
]

export function Api({ tabs }: { tabs: ConsoleTab[] }) {
  return (
    <section id="api" aria-labelledby="api-heading" className="scroll-mt-16 border-t border-text/10">
      <div className="frame py-[16svh]">
        <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 id="api-heading" className="t-display text-[clamp(2.4rem,4.4vw,5rem)] text-text">
              One request per underwriting decision.
            </h2>
            <p className="t-body mt-6 max-w-[42ch] text-muted">
              Send an address and get back the score, a calibrated default probability, the factor breakdown and
              integrity flags. A decision made today can still be explained next year, because every response says
              which model made it and from what data.
            </p>
            <dl className="mt-10">
              {SPEC.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7rem_1fr] items-baseline gap-4 border-t border-text/15 py-3">
                  <dt className="t-label text-muted">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug text-text">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <a href="/api/v1/openapi" className="btn btn-ink">
                OpenAPI spec
              </a>
              <a href="mailto:api@chainscore.dev?subject=API%20key%20request" className="btn btn-line">
                Request an API key
              </a>
              <Link href="/pricing" className="link-u self-start py-3 text-[0.9375rem] text-text sm:self-center sm:px-2">
                Pricing
              </Link>
            </div>
          </div>
          <div className="min-w-0 lg:col-span-7 lg:pt-3">
            <ApiConsole tabs={tabs} />
            <p className="t-label mt-4 text-muted">
              An example wallet. Default probability and percentile follow the model&apos;s real score band and deciles.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
