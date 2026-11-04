import { GRADE_CUTOFFS } from '@/lib/site/scoreTier'

// The result-page gauge: CS-1's dial drawn flat. Same 270 degree sweep,
// grade bands at the model's real cutoffs (lib/site/scoreTier, pinned to
// ml/model_meta.json), ticks every 10 points, the needle on the score.
// Pure SVG in theme tokens, so it server-renders and follows the theme.

interface ScoreGaugeProps {
  score: number
  animated?: boolean
  /** Sizing. Defaults to the result page size; pass h-full w-full to fill a box. */
  className?: string
}

const MIN = 300
const MAX = 850
const CX = 120
const CY = 120

function angle(score: number): number {
  const t = Math.min(1, Math.max(0, (score - MIN) / (MAX - MIN)))
  return ((225 - t * 270) * Math.PI) / 180
}

function pt(score: number, r: number): [number, number] {
  const a = angle(score)
  return [CX + Math.cos(a) * r, CY - Math.sin(a) * r]
}

function arc(from: number, to: number, r: number): string {
  const [x1, y1] = pt(from, r)
  const [x2, y2] = pt(to, r)
  const large = ((to - from) / (MAX - MIN)) * 270 > 180 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

export function ScoreGauge({ score, className = 'h-60 w-60 sm:h-72 sm:w-72' }: ScoreGaugeProps) {
  const bands: Array<[number, number, string]> = [
    [MIN, GRADE_CUTOFFS.D, 'rgb(var(--cs-danger))'],
    [GRADE_CUTOFFS.D, GRADE_CUTOFFS.C, 'rgb(var(--cs-warning))'],
    [GRADE_CUTOFFS.C, GRADE_CUTOFFS.B, 'rgb(var(--cs-warning) / 0.55)'],
    [GRADE_CUTOFFS.B, GRADE_CUTOFFS.A, 'rgb(var(--cs-success))'],
    [GRADE_CUTOFFS.A, MAX, 'rgb(var(--cs-accent))'],
  ]
  const ticks: number[] = []
  for (let s = MIN; s <= MAX; s += 10) ticks.push(s)
  const [nx, ny] = pt(score, 90)
  const [tx, ty] = pt(score, -16)

  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      role="img"
      aria-label={`Score ${score} on a scale of ${MIN} to ${MAX}`}
    >
      <circle cx={CX} cy={CY} r={116} fill="none" stroke="rgb(var(--cs-text) / 0.85)" strokeWidth={1.25} />
      {bands.map(([a, b, color]) => (
        <path key={a} d={arc(a + 1.5, b - 1.5, 106)} fill="none" stroke={color} strokeWidth={5} />
      ))}
      {ticks.map((s) => {
        const major = s % 50 === 0 || s === MAX
        const [x1, y1] = pt(s, major ? 86 : 92)
        const [x2, y2] = pt(s, 99)
        return (
          <line
            key={s}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgb(var(--cs-text))"
            strokeWidth={major ? 1.6 : 0.8}
            strokeOpacity={major ? 0.9 : 0.5}
          />
        )
      })}
      {[300, 400, 500, 600, 700, 800].map((s) => {
        const [x, y] = pt(s, 72)
        return (
          <text
            key={s}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgb(var(--cs-muted))"
            style={{ font: '500 9.5px var(--font-sans), ui-sans-serif, system-ui, sans-serif' }}
          >
            {s}
          </text>
        )
      })}
      <line
        x1={tx}
        y1={ty}
        x2={nx}
        y2={ny}
        stroke="rgb(var(--cs-accent))"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r={6.5} fill="rgb(var(--cs-text))" />
      <circle cx={CX} cy={CY} r={2.2} fill="rgb(var(--cs-bg))" />
    </svg>
  )
}
