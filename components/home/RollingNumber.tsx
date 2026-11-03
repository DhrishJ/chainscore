// Odometer-style figure. Every digit is a strip of 0 to 9 that rolls to its
// value when the figure scrolls into view (the reveal observer adds
// is-in). The server render already shows the final value, readers that
// never run JS see it as-is, and assistive tech reads the plain text.

export function RollingNumber({ value, className }: { value: string; className?: string }) {
  let digitIndex = 0
  return (
    <span className={`relative inline-flex ${className ?? ''}`} data-roll>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex">
        {[...value].map((ch, i) => {
          if (!/[0-9]/.test(ch)) {
            return (
              <span key={i} className="whitespace-pre">
                {ch}
              </span>
            )
          }
          const d = Number(ch)
          const delay = digitIndex++ * 90
          return (
            <span key={i} className="roll-cell">
              <span className="roll-strip" style={{ ['--d' as string]: d, ['--delay' as string]: `${delay}ms` }}>
                {'0123456789'.split('').map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
