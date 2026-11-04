'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface ReliabilityDatum {
  meanPredicted: number
  observedRate: number
  n: number
}

interface ReliabilityChartProps {
  data: ReliabilityDatum[]
}

const INK = 'rgb(var(--cs-text))'
const ACCENT = 'rgb(var(--cs-accent))'
const MUTED = 'rgb(var(--cs-muted))'
const GRID = 'rgb(var(--cs-border))'
const MONO = 'var(--font-sans), ui-sans-serif, system-ui, sans-serif'

interface ReliabilityRow {
  predictedPct: number
  observedPct: number
  idealPct: number
  n: number
}

export function ReliabilityChart({ data }: ReliabilityChartProps) {
  const chartData: ReliabilityRow[] = data.map((bin) => {
    const predictedPct = Math.round(bin.meanPredicted * 1000) / 10
    return {
      predictedPct,
      observedPct: Math.round(bin.observedRate * 1000) / 10,
      idealPct: predictedPct,
      n: bin.n,
    }
  })

  const summary = chartData
    .map((row) => `predicted ${row.predictedPct} percent, observed ${row.observedPct} percent, n=${row.n}`)
    .join('. ')

  return (
    <div
      className="h-80 w-full"
      role="img"
      aria-label={`Calibration chart comparing predicted risk to observed liquidation rate across ${chartData.length} bins. ${summary}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 20 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis
            dataKey="predictedPct"
            type="number"
            domain={[0, 100]}
            stroke={MUTED}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: MONO }}
            tickLine={false}
            axisLine={{ stroke: INK }}
            tickFormatter={(value: number) => `${value}%`}
            label={{ value: 'Predicted risk', position: 'insideBottom', offset: -12, fill: MUTED, fontSize: 11, fontFamily: MONO }}
          />
          <YAxis
            domain={[0, 100]}
            stroke={MUTED}
            tick={{ fill: MUTED, fontSize: 11, fontFamily: MONO }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value}%`}
            label={{ value: 'Observed rate', angle: -90, position: 'insideLeft', fill: MUTED, fontSize: 11, fontFamily: MONO }}
          />
          <Tooltip
            contentStyle={{
              background: 'rgb(var(--cs-bg))',
              border: '1px solid rgb(var(--cs-border))',
              borderRadius: 0,
              fontSize: 12,
              fontFamily: MONO,
            }}
            labelStyle={{ color: INK }}
            itemStyle={{ color: INK }}
            labelFormatter={(value: number) => `Predicted ${value}%`}
            formatter={(value: number, name: string) => [
              `${value}%`,
              name === 'Observed' ? 'Observed liquidation rate' : 'Perfect calibration',
            ]}
          />
          {/* Straight segments between bins: a smoothed curve would imply
              data between the bins that the backtest does not have. */}
          <Line
            type="linear"
            dataKey="idealPct"
            name="Perfect calibration"
            stroke={MUTED}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="observedPct"
            name="Observed"
            stroke={INK}
            strokeWidth={1.5}
            dot={{ r: 3.5, fill: ACCENT, stroke: ACCENT }}
            activeDot={{ r: 5, fill: ACCENT, stroke: 'rgb(var(--cs-bg))', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
