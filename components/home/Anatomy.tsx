import { CalibreSequence } from './CalibreSequence'

// What a score is made of, read while the calibre comes apart beside it.
// Group names, descriptions and feature counts come from the model
// metadata (ml/model_meta.json) via lib/site, pinned by tests.

export interface AnatomyGroup {
  name: string
  description: string
  features: number
}

const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

export function Anatomy({
  groups,
  featureCount,
  frames,
  grades,
  min,
  max,
  cutoff,
}: {
  groups: AnatomyGroup[]
  featureCount: number
  frames: number
  grades: { A: number; B: number; C: number; D: number }
  min: number
  max: number
  cutoff: number
}) {
  const bands = [
    { grade: 'A', range: `${grades.A} and up` },
    { grade: 'B', range: `${grades.B} to ${grades.A - 1}` },
    { grade: 'C', range: `${grades.C} to ${grades.B - 1}` },
    { grade: 'D', range: `${grades.D} to ${grades.C - 1}` },
    { grade: 'F', range: `below ${grades.D}` },
  ]
  return (
    <div id="method" className="scroll-mt-16 pt-[12svh]">
      <CalibreSequence frames={frames} poster={Math.round(frames * 0.62)} alt="The calibre, taken apart part by part">
        <div className="frame lg:pr-0">
          <div className="flex min-h-[44svh] flex-col justify-start pt-10 lg:min-h-[86svh] lg:justify-center lg:pt-0">
            <h2 className="t-display text-[clamp(2.4rem,4.4vw,5rem)] text-text">
              Taken apart, a score is {featureCount} measurements.
            </h2>
            <p className="t-body mt-6 max-w-[42ch] text-muted">
              Each one is computed from the wallet&apos;s public history as it stood at the time of the decision. A
              gradient-boosted model weighs them, and its output is calibrated against what borrowers went on to do.
              They fall into {words[groups.length] ?? groups.length} groups.
            </p>
          </div>

          {groups.map((g) => (
            <article key={g.name} className="flex min-h-[46svh] flex-col justify-center border-t border-text/15 py-10 lg:min-h-[72svh]">
              <div className="flex items-baseline justify-between gap-6">
                <h3 className="t-headline text-[clamp(1.9rem,2.6vw,2.8rem)] text-text">{g.name}</h3>
                <p className="t-label tnum shrink-0 text-muted">
                  {g.features} {g.features === 1 ? 'feature' : 'features'}
                </p>
              </div>
              <p className="t-body mt-4 max-w-[40ch] text-muted">{g.description}</p>
            </article>
          ))}
          <article className="flex min-h-[46svh] flex-col justify-center border-t border-text/15 py-10 lg:min-h-[72svh]">
            <h3 className="t-headline text-[clamp(1.9rem,2.6vw,2.8rem)] text-text">What comes out</h3>
            <p className="t-body mt-4 max-w-[40ch] text-muted">
              One score from {min} to {max}, a default probability calibrated on real outcomes, and a grade. Below{' '}
              {cutoff} is what the backtest counts as flagged.
            </p>
            <table className="mt-6 w-full max-w-[24rem] border-collapse text-left">
              <caption className="sr-only">Grade bands</caption>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.grade} className="border-t border-text/15">
                    <th scope="row" className="t-headline w-16 py-2.5 text-[1.25rem] font-medium text-text">
                      {b.grade}
                    </th>
                    <td className="tnum py-2.5 text-[0.95rem] text-muted">{b.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          <div className="h-[14svh] lg:h-[22svh]" aria-hidden />
        </div>
      </CalibreSequence>
    </div>
  )
}
