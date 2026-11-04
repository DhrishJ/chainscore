'use client'

import { useEffect, useRef, useState } from 'react'
import type { InstrumentHandle, InstrumentSpec, InstrumentState, ScreenAnchor } from '@/lib/instrument/stage'
import { ScoreGauge } from '@/components/ScoreGauge'

// The ChainScore instrument: a dial gauge that reads a score, with the
// mechanism behind a sapphire caseback. three.js loads after first paint;
// until then (and without WebGL) the flat SVG gauge stands in, so the
// reading is never missing. With reduced motion it holds still and only
// redraws when the reading changes.

export function ScoreInstrument({
  spec,
  state,
  className = '',
  label,
  onReady,
  factorLabels = false,
}: {
  spec: InstrumentSpec
  state: InstrumentState
  className?: string
  /** Accessible description of the current reading. */
  label: string
  /** The live handle, once the first frame is drawn; `still` is reduced motion. */
  onReady?: (handle: InstrumentHandle, still: boolean) => void
  /** Name the factor wheels whenever the caseback faces the viewer. */
  factorLabels?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<InstrumentHandle | null>(null)
  const stateRef = useRef(state)
  const readyRef = useRef(onReady)
  const labelRefs = useRef<Array<HTMLDivElement | null>>([])
  const [live, setLive] = useState(false)
  const [failed, setFailed] = useState(false)
  stateRef.current = state
  readyRef.current = onReady

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let ro: ResizeObserver | null = null
    const webgl = (() => {
      try {
        const c = document.createElement('canvas')
        return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
      } catch {
        return false
      }
    })()
    if (!webgl) {
      setFailed(true)
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // labels follow the wheels; they show only while the caseback faces us
    const onFrame = factorLabels
      ? (anchors: ScreenAnchor[]) => {
          anchors.forEach((a, i) => {
            const el = labelRefs.current[i]
            if (!el) return
            const o = Math.max(0, Math.min(1, (a.facing - 0.55) / 0.25))
            el.style.opacity = o === 0 ? '0' : o.toFixed(3)
            if (o > 0) el.style.transform = `translate3d(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px,0)`
          })
        }
      : undefined
    const start = () =>
      import('@/lib/instrument/stage')
        .then(({ mountInstrument }) =>
          mountInstrument(canvas, spec, stateRef.current, { still: reduce, intro: !reduce, parallax: !reduce, onFrame })
        )
        .then((h) => {
          if (cancelled) {
            h.destroy()
            return
          }
          handleRef.current = h
          ro = new ResizeObserver(() => h.resize())
          ro.observe(canvas)
          readyRef.current?.(h, reduce)
          h.firstFrame.then(() => !cancelled && setLive(true))
        })
        .catch(() => !cancelled && setFailed(true))
    // after the page has painted and settled
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback
    const t = idle ? idle(() => start(), { timeout: 1500 }) : window.setTimeout(start, 200)
    return () => {
      cancelled = true
      if (!idle) window.clearTimeout(t as number)
      ro?.disconnect()
      handleRef.current?.destroy()
      handleRef.current = null
    }
    // spec and labels are static for the life of the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    handleRef.current?.set(state, { instant: reduce })
  }, [state])

  const fallbackScore = state.reading.kind === 'score' ? state.reading.score : null

  return (
    <div className={`relative aspect-square ${className}`} role="img" aria-label={label}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${live ? 'opacity-100' : 'opacity-0'}`}
      />
      {factorLabels &&
        spec.factors?.slice(0, 4).map((f, i) => {
          // wheels one and four sit on the left as seen from behind
          const left = i === 0 || i === 3
          return (
            <div
              key={f.name}
              ref={(el) => {
                labelRefs.current[i] = el
              }}
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 opacity-0"
            >
              <div
                className={`flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap ${left ? '-translate-x-full flex-row-reverse' : ''}`}
              >
                <span className="block h-[5px] w-[5px] shrink-0 bg-text" />
                <span className="block h-px w-4 shrink-0 bg-text/60" />
                <span className="t-label bg-background/80 px-1.5 py-0.5 text-text">
                  {f.name} <span className="t-figure text-muted">{Math.round(f.weight * 100)}%</span>
                </span>
              </div>
            </div>
          )
        })}
      {!live && (
        <div className={`absolute inset-[9%] grid place-items-center ${failed ? '' : 'opacity-60'}`} aria-hidden>
          {fallbackScore !== null ? (
            <ScoreGauge score={fallbackScore} className="h-full w-full" />
          ) : (
            <span className="t-label border border-danger/60 px-3 py-1.5 text-danger">No history</span>
          )}
        </div>
      )}
    </div>
  )
}
