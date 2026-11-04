import Link from 'next/link'
import { WalletInput } from '@/components/WalletInput'
import { Wordmark } from './Logo'

// Closing: one more chance to check a wallet, the calibre from above, and
// the plain facts about the company.

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
      { label: 'Backtest retrospective', href: '/retrospective' },
      { label: 'Coverage', href: '/#coverage' },
      { label: 'Example report', href: '/#report' },
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

export function SiteFooter({
  modelVersion,
  backtestDate,
  alta,
}: {
  modelVersion: string
  backtestDate: string
  alta: string
}) {
  return (
    <footer className="relative border-t border-text/10 bg-background text-text">
      <div className="frame grid grid-cols-1 items-end gap-x-[var(--gutter)] gap-y-6 pt-20 lg:grid-cols-12 lg:pt-28">
        <div className="lg:col-span-5">
          <h2 className="t-headline text-[clamp(1.6rem,2.4vw,2.2rem)] text-text">Check a wallet</h2>
          <p className="t-body mt-3 max-w-[44ch] text-muted">
            Free, from public chain data. If it has never borrowed, you get that answer instead of a number.
          </p>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <WalletInput />
        </div>
      </div>

      <div className="frame mt-20 grid grid-cols-2 gap-x-[var(--gutter)] gap-y-10 border-t border-text/15 pt-10 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <Wordmark />
          <p className="t-body mt-4 max-w-[30ch] text-[0.9375rem] text-muted">Credit risk infrastructure for onchain lending.</p>
          <p className="t-body mt-3 max-w-[30ch] text-[0.9375rem] text-muted">{alta}</p>
          <a href="mailto:hello@chainscore.dev" className="link-u mt-3 inline-block text-[0.9375rem] text-text">
            hello@chainscore.dev
          </a>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="t-label text-muted">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} className="text-[0.95rem] text-text hover:underline hover:underline-offset-4">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-[0.95rem] text-text hover:underline hover:underline-offset-4">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="frame mt-14 flex flex-col gap-3 border-t border-text/15 py-6 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="t-label max-w-[70ch] text-muted">
          ChainScore (chainscore.dev) scores wallets with onchain borrowing history using public data only. Scores are
          informational and are not financial advice.
        </p>
        <p className="t-label tnum shrink-0 text-muted">
          Model {modelVersion}, backtest {backtestDate}. © {new Date().getFullYear()} ChainScore
        </p>
      </div>
    </footer>
  )
}
