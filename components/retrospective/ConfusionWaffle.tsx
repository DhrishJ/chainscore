// The confusion matrix at the operating cutoff, drawn as four waffles. The
// flat sibling of the home page's block sculpture: one square per ten
// borrowers (rounded), so the four cells compare at a glance.

export interface WaffleCounts {
  tp: number
  fn: number
  fp: number
  tn: number
}

const PER_SQUARE = 10

const fmt = (n: number) => n.toLocaleString('en-US')

export function ConfusionWaffle({ counts, cutoff }: { counts: WaffleCounts; cutoff: number }) {
  const cells: Array<{ key: keyof WaffleCounts; title: string; note: string; tone: string }> = [
    { key: 'tp', title: 'Caught', note: 'Liquidated, flagged', tone: 'bg-danger' },
    { key: 'fn', title: 'Missed', note: 'Liquidated, cleared', tone: 'bg-danger/45' },
    { key: 'fp', title: 'False alarms', note: 'Fine, flagged', tone: 'bg-text/70' },
    { key: 'tn', title: 'Cleared', note: 'Fine, cleared', tone: 'bg-text/25' },
  ]
  return (
    <figure>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-6 gap-y-8 sm:gap-x-10">
        <div />
        <p className="t-label text-text">Flagged · below {cutoff}</p>
        <p className="t-label text-text">Cleared · {cutoff} and up</p>
        {[0, 1].map((row) => (
          <div key={row} className="contents">
            <p className="t-label self-start pt-1 text-muted [writing-mode:vertical-rl] sm:[writing-mode:initial]">
              {row === 0 ? 'Liquidated' : 'Not liquidated'}
            </p>
            {cells.slice(row * 2, row * 2 + 2).map((c) => {
              const squares = Math.round(counts[c.key] / PER_SQUARE)
              return (
                <div key={c.key}>
                  <div className="flex flex-wrap content-start gap-[2px]" aria-hidden>
                    {Array.from({ length: squares }).map((_, i) => (
                      <span key={i} className={`h-[6px] w-[6px] sm:h-[7px] sm:w-[7px] ${c.tone}`} />
                    ))}
                  </div>
                  <p className="t-headline tnum mt-3 text-3xl text-text">{fmt(counts[c.key])}</p>
                  <p className="t-label mt-1 text-muted">
                    {c.title} · {c.note}
                  </p>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <figcaption className="t-label mt-8 text-muted">
        Fig. 1 · Holdout at the operating cutoff. One square per {PER_SQUARE} borrowers, rounded.
      </figcaption>
    </figure>
  )
}
