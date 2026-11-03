import Link from 'next/link'
import { WalletInput } from '@/components/WalletInput'
import { LogoMark } from './Logo'

// Closing slab. `dark` scopes graphite tokens here, so the footer is the
// same ink plate in both themes and every control inside adapts with it.

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Check a score', href: '/#top' },
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Marketplace (preview)', href: '/marketplace' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Evidence',
    links: [
      { label: 'Liquidation retrospective', href: '/retrospective' },
      { label: 'Coverage', href: '/#coverage' },
      { label: 'Method', href: '/#method' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'OpenAPI spec', href: '/api/v1/openapi', external: true },
      { label: 'API overview', href: '/#api' },
      { label: 'api@chainscore.dev', href: 'mailto:api@chainscore.dev', external: true },
    ],
  },
]

export function SiteFooter({ modelVersion, backtestDate }: { modelVersion: string; backtestDate: string }) {
  return (
    <footer className="dark relative overflow-hidden bg-background text-text">
      <div className="frame pt-[14svh]">
        <div className="relative pt-3">
          <span data-rule className="absolute inset-x-0 top-0 h-px bg-text/70" aria-hidden />
          <p className="t-label text-text">(09) Measure</p>
        </div>

        <div className="mt-10 grid gap-x-[var(--gutter)] gap-y-10 lg:grid-cols-12 lg:items-end">
          <h2 data-lines className="t-display text-[clamp(3.6rem,9vw,10rem)] text-text lg:col-span-7">
            <span className="lm">
              <span>Measure</span>
            </span>
            <span className="lm">
              <span style={{ ['--d' as string]: '80ms' }}>
                a wallet<span className="text-accent">.</span>
              </span>
            </span>
          </h2>
          <div data-reveal className="lg:col-span-5 lg:pb-4">
            <p className="t-body mb-4 max-w-[40ch] text-muted">
              Free, from public chain data. If the wallet has never borrowed, you will get the honest
              answer instead of a number.
            </p>
            <WalletInput />
          </div>
        </div>

        <div className="mt-[12svh] grid grid-cols-2 gap-x-[var(--gutter)] gap-y-10 border-t border-text/15 pt-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <span className="inline-flex items-center gap-2 text-text">
              <LogoMark />
              <span className="t-label">CS-1 · {modelVersion}</span>
            </span>
            <p className="t-body mt-4 max-w-[30ch] text-[0.9rem] text-muted">
              Credit risk infrastructure for onchain lending.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="t-label text-muted">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} className="link-u text-[0.95rem] text-text">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="link-u text-[0.95rem] text-text">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      {/* The wordmark, fitted to the frame exactly (textLength). */}
      <div className="frame mt-[10svh]">
        <div data-lines aria-hidden="true">
          <span className="lm">
            <span>
              <svg viewBox="0 0 1000 218" className="block w-full" role="presentation">
                <text
                  x="0"
                  y="196"
                  textLength="1000"
                  lengthAdjust="spacing"
                  fill="currentColor"
                  style={{
                    fontFamily: 'var(--font-archivo)',
                    fontSize: '262px',
                    fontWeight: 640,
                    fontStretch: '78%',
                    letterSpacing: '-0.04em',
                  }}
                >
                  ChainScore
                </text>
              </svg>
            </span>
          </span>
        </div>
      </div>

      <div className="frame flex flex-col gap-3 border-t border-text/15 py-6 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="t-label max-w-[70ch] text-muted">
          ChainScore (chainscore.dev) scores wallets with onchain borrowing history using public data
          only. Scores are informational and are not financial advice.
        </p>
        <p className="t-label shrink-0 text-muted">
          Backtest {backtestDate} · © {new Date().getFullYear()} ChainScore
        </p>
      </div>
    </footer>
  )
}
