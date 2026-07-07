// Static product visual for the landing page: a sample onchain credit score.
// Pure SVG + CSS so it renders on the server with no client JS.

const SCORE = 742
const MIN = 300
const MAX = 850
const ARC_LENGTH = 314.16 // pi * r, r = 100
const fraction = (SCORE - MIN) / (MAX - MIN)
const filled = ARC_LENGTH * fraction

// End-of-arc marker, swept from 180deg down to 0deg over the top.
const angle = (180 - fraction * 180) * (Math.PI / 180)
const dotX = 120 + 100 * Math.cos(angle)
const dotY = 120 - 100 * Math.sin(angle)

const factors = [
  // The model's real factor groups (lib/site/publicFacts). Values are an
  // illustrative example, labeled as such below the card.
  { label: 'Lending History', value: 92 },
  { label: 'Wallet History', value: 86 },
  { label: 'DeFi Activity', value: 74 },
  { label: 'Portfolio & Identity', value: 81 },
]

export function ScoreGaugePreview() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -inset-8 cs-glow blur-2xl" aria-hidden />

      <div className="relative rounded-3xl border border-border bg-card/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-black/20">
        {/* card header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-medium text-muted">Live score</span>
          </div>
          <span className="font-mono text-xs text-muted">vitalik.eth</span>
        </div>

        {/* gauge */}
        <div className="relative mt-4">
          <svg viewBox="0 0 240 136" className="w-full" role="img" aria-label={`Sample score ${SCORE} out of ${MAX}`}>
            <defs>
              <linearGradient id="csGauge" x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FF3B5C" />
                <stop offset="50%" stopColor="#FFB800" />
                <stop offset="100%" stopColor="#00C879" />
              </linearGradient>
            </defs>
            {/* track */}
            <path
              d="M 20 120 A 100 100 0 0 1 220 120"
              fill="none"
              stroke="rgb(var(--cs-border))"
              strokeWidth="14"
              strokeLinecap="round"
            />
            {/* value arc */}
            <path
              d="M 20 120 A 100 100 0 0 1 220 120"
              fill="none"
              stroke="url(#csGauge)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${ARC_LENGTH}`}
              className="cs-arc"
            />
            {/* end marker */}
            <circle cx={dotX} cy={dotY} r="9" fill="#00C879" stroke="rgb(var(--cs-card))" strokeWidth="4" />
          </svg>

          {/* center readout */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="font-mono text-5xl font-bold tabular-nums text-text">{SCORE}</span>
            <span className="mt-1 rounded-full border border-success/30 bg-success/10 px-3 py-0.5 text-xs font-semibold text-success">
              Strong
            </span>
          </div>
        </div>

        <p className="mt-2 text-center text-xs text-muted">Illustrative example. Score range {MIN} to {MAX}</p>

        {/* factor breakdown */}
        <div className="mt-6 space-y-3">
          {factors.map((f) => (
            <div key={f.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{f.label}</span>
                <span className="font-mono text-text">{f.value}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-success"
                  style={{ width: `${f.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
