import { SectionLabel } from './SectionLabel'

// One request, three stations. The pulse that runs along the rule is the
// request travelling through them.

const STEPS = [
  {
    title: 'Send a wallet',
    body: 'One API call with any address, or paste it into the field above. No connection, no KYC, nothing offchain.',
    code: 'GET /api/v1/score/{address}',
  },
  {
    title: 'We read its lending history',
    body: 'Every borrow, repayment, and liquidation across Aave V2/V3 and Compound V2, plus wallet history, read from public chain data.',
    code: 'aave · compound · tx history',
  },
  {
    title: 'Get a score you can price with',
    body: 'A 300 to 850 score with calibrated default probability, factor breakdown, integrity checks, and a data-completeness figure on every response.',
    code: '{ score, grade, calibratedPD, … }',
  },
]

export function Process() {
  return (
    <section className="frame relative py-[16svh]" aria-labelledby="process-heading">
      <SectionLabel index="04" name="Process" aside="One call per decision" />
      <h2 id="process-heading" data-lines className="t-headline mt-8 max-w-[16ch] text-[clamp(2.6rem,5vw,5.5rem)] text-text">
        <span className="lm">
          <span>From wallet to</span>
        </span>
        <span className="lm">
          <span style={{ ['--d' as string]: '70ms' }}>underwriting signal</span>
        </span>
        <span className="lm">
          <span style={{ ['--d' as string]: '140ms' }}>in one call.</span>
        </span>
      </h2>

      <div className="relative mt-16 lg:mt-24">
        <div className="relative hidden h-px lg:block" aria-hidden>
          <span data-rule className="absolute inset-0 bg-text/80" />
          <span className="cs-pulse absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full bg-accent" />
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute -top-[5px] h-[11px] w-px bg-text" style={{ left: `${(i * 100) / 3}%` }} />
          ))}
        </div>
        <ol className="grid gap-12 lg:grid-cols-3 lg:gap-[var(--gutter)]">
          {STEPS.map((s, i) => (
            <li key={s.title} data-reveal className="relative lg:pt-8" style={{ ['--d' as string]: `${i * 110}ms` }}>
              <span className="t-display block text-[clamp(4rem,7vw,7.5rem)] text-text/15" aria-hidden>
                0{i + 1}
              </span>
              <h3 className="t-headline -mt-3 text-[1.85rem] text-text">{s.title}</h3>
              <p className="t-body mt-3 max-w-[36ch] text-muted">{s.body}</p>
              <p className="t-label mt-5 inline-block border border-text/20 px-2.5 py-1.5 text-text">{s.code}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
