// The borrower gate. A wallet that has never borrowed gets no score, and
// the instrument beside this section shows exactly that: no reading, and
// the NO HISTORY flag the API returns as noBorrowHistory.

export function NoHistory() {
  return (
    <section data-stop="none" aria-labelledby="nohistory-heading" className="py-16 lg:py-24">
      <h2 id="nohistory-heading" className="t-headline text-[clamp(1.6rem,2.4vw,2.2rem)] text-text">
        Wallets that never borrowed get no score
      </h2>
      <div className="mt-4 grid max-w-[60ch] gap-4">
        <p className="t-body text-muted">
          A credit score measures how someone repays. Credit bureaus do not score people who have never used credit,
          and neither does ChainScore: the model only rates wallets with a borrowing record on the lending protocols it
          reads.
        </p>
        <p className="t-body text-muted">
          For any other wallet the API says so instead of inventing a number, and your underwriting code can branch on
          it:
        </p>
      </div>
      <pre className="t-code mt-6 max-w-[34rem] overflow-x-auto border border-ink-line bg-ink px-5 py-4 text-ink-fg">
        <code>
          {'{\n  "noBorrowHistory": '}
          <span className="text-danger">true</span>
          {',\n  "score": 0,\n  "factors": []\n}'}
        </code>
      </pre>
      <p className="t-body mt-6 max-w-[60ch] text-muted">
        The same goes for an outage. If the lending or transaction data does not arrive, the wallet is reported as not
        scored, never as a wallet with no history.
      </p>
    </section>
  )
}
