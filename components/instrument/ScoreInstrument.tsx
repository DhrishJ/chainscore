'use client'

import { useEffect, useRef, useState } from 'react'
import type { InstrumentHandle, InstrumentState } from '@/lib/instrument/stage'
import type { ScaleSpec } from '@/lib/instrument/dial'
import { ScoreGauge } from '@/components/ScoreGauge'

// The ChainScore instrument: a dial gauge that reads a score. three.js loads
// after first paint; until then (and without WebGL) the flat SVG gauge
// stands in, so the reading is never missing. Nothing renders while the
// instrument is still.

export function ScoreInstrument({
  spec,
  state,
  className = '',
  label,
}: {
  spec: ScaleSpec
  state: InstrumentState
  className?: string
  /** Accessible description of the current reading. */
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<InstrumentHandle | null>(null)
  const stateRef = useRef(state)
  const [live, setLive] = useState(false)
  const [failed, setFailed] = useState(false)
  stateRef.current = state

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
    const start = () =>
      import('@/lib/instrument/stage')
        .then(({ mountInstrument }) => mountInstrument(canvas, spec, stateRef.current))
        .then((h) => {
          if (cancelled) {
            h.destroy()
            return
          }
          handleRef.current = h
          ro = new ResizeObserver(() => h.resize())
          ro.observe(canvas)
          h.firstFrame.then(() => !cancelled && setLive(true))
        })
        .catch(() => !cancelled && setFailed(true))
    // after the page has painted and settled
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    const t = idle ? idle(() => start()) : window.setTimeout(start, 200)
    return () => {
      cancelled = true
      if (!idle) window.clearTimeout(t as number)
      ro?.disconnect()
      handleRef.current?.destroy()
      handleRef.current = null
    }
    // spec is static for the life of the page
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
