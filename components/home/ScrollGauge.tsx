'use client'

import { useEffect, useRef } from 'react'
import { onTick } from '@/lib/motion/engine'

// The page is an instrument too: a hairline 300 to 850 scale in the right
// gutter whose needle reads how far down the page you are. Read to the
// end, score 850. Grade bands sit at the model's real cutoffs. It lives
// entirely inside the gutter so it never crosses content. Decorative.

interface Props {
  min: number
  max: number
  grades: { A: number; B: number; C: number; D: number }
}

export function ScrollGauge({ min, max, grades }: Props) {
  const needleRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let last = -1
    let shown = 0
    return onTick(() => {
      const doc = document.documentElement
      const travel = doc.scrollHeight - window.innerHeight
      const p = travel > 0 ? Math.min(1, Math.max(0, window.scrollY / travel)) : 0
      shown += (p - shown) * 0.18
      if (Math.abs(shown - last) < 0.0002) return
      last = shown
      if (needleRef.current) needleRef.current.style.transform = `translate3d(0, ${(1 - shown) * 100}%, 0)`
      const v = Math.round(min + shown * (max - min))
      if (valueRef.current && valueRef.current.textContent !== String(v)) valueRef.current.textContent = String(v)
    })
  }, [min, max])

  const span = max - min
  const at = (s: number) => `${((max - s) / span) * 100}%`
  const bands: Array<[number, number, string]> = [
    [min, grades.D, 'bg-danger'],
    [grades.D, grades.C, 'bg-warning'],
    [grades.C, grades.B, 'bg-warning/60'],
    [grades.B, grades.A, 'bg-success'],
    [grades.A, max, 'bg-accent'],
  ]
  const ticks: number[] = []
  for (let s = min; s <= max; s += 10) ticks.push(s)

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-[max(6px,calc((100vw-1600px)/2+6px))] top-1/2 z-30 hidden h-[44vh] w-4 -translate-y-1/2 xl:block"
    >
      <div className="relative h-full w-full">
        {bands.map(([a, b, tone]) => (
          <span
            key={a}
            className={`absolute right-0 w-px ${tone}`}
            style={{ top: at(b), bottom: `${((a - min) / span) * 100}%` }}
          />
        ))}
        {ticks.map((s) => (
          <span
            key={s}
            className={`absolute right-[3px] h-px ${s % 50 === 0 ? 'w-2.5 bg-text/60' : 'w-1 bg-text/30'}`}
            style={{ top: at(s) }}
          />
        ))}
        <div ref={needleRef} className="absolute inset-x-0 top-0 h-full will-change-transform">
          <span className="absolute -top-px right-0 h-[2px] w-4 bg-accent" />
        </div>
      </div>
      <span
        ref={valueRef}
        className="absolute -bottom-6 right-0 font-mono text-[10px] font-medium leading-none tracking-wider text-accent"
      >
        {min}
      </span>
    </div>
  )
}
