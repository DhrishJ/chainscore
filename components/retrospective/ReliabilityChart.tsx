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

const ACCENT = '#0052FF'
const MUTED = '#5A6478'
const GRID = '#1C2333'
const TEXT = '#E8EDF5'

interface ReliabilityRow {
  predictedPct: number
  observedPct: number
  idealPct: number
  n: number
}

export function ReliabilityChart({ data }: ReliabilityChartProps) {
  const chartData: ReliabilityRow[] = data.map(bin => {
    const predictedPct = Math.round(bin.meanPredicted * 1000) / 10
    return {
      predictedPct,
      observedPct: Math.round(bin.observedRate * 1000) / 10,
      idealPct: predictedPct,
      n: bin.n,
    }
  })

  const summary = chartData
    .map(row => `predicted ${row.predictedPct} percent, observed ${row.observedPct} percent, n=${row.n}`)
    .join('. ')

  return (
    <div
      className="w-full h-72"
      role="img"
      aria-label={`Calibration chart comparing predicted risk to observed liquidation rate across ${chartData.length} bins. ${summary}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis
            dataKey="predictedPct"
            type="number"
            domain={[0, 100]}
            stroke={MUTED}
            fontSize={12}
            tickLine={false}
            tickFormatter={(value: number) => `${value}%`}
            label={{ value: 'Predicted risk', position: 'insideBottom', offset: -8, fill: MUTED, fontSize: 12 }}
          />
          <YAxis
            domain={[0, 100]}
            stroke={MUTED}
            fontSize={12}
            tickLine={false}
            tickFormatter={(value: number) => `${value}%`}
            label={{ value: 'Observed rate', angle: -90, position: 'insideLeft', fill: MUTED, fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{ background: '#0D1117', border: `1px solid ${GRID}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: TEXT }}
            itemStyle={{ color: TEXT }}
            formatter={(value: number, name: string) => [
              `${value}%`,
              name === 'observedPct' ? 'Observed liquidation rate' : 'Perfect calibration',
            ]}
          />
          <Line type="monotone" dataKey="idealPct" name="Perfect calibration" stroke={MUTED} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="observedPct"
            name="Observed"
            stroke={ACCENT}
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
