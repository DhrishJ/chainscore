import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="frame grid min-h-[calc(100svh-var(--nav-h))] grid-cols-1 items-center gap-x-[var(--gutter)] gap-y-10 py-16 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <p className="t-label text-muted">404</p>
        <h1 className="t-display mt-4 text-[clamp(2.4rem,4.6vw,4.4rem)] text-text">Nothing at this address</h1>
        <p className="t-body mt-5 max-w-[40ch] text-muted">
          The page may have moved. The score check, the backtest and the API are one click away.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-ink">
            Home
          </Link>
          <Link href="/retrospective" className="btn btn-line">
            The backtest
          </Link>
        </div>
      </div>

    </main>
  )
}
