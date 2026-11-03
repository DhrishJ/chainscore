'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { onTick, prefersReducedMotion, stageProgress } from '@/lib/motion/engine'
import type { BacktestController, BacktestLabelKey } from '@/lib/three/backtestScene'
import type { MatrixCounts } from '@/lib/three/backtest'

// The published backtest, built as an object: one block per holdout
// borrower, moving through the confusion matrix as the captions scroll.
// Counts arrive from the server (reports/backtest/latest.json); the
// captions carry every number in text, so the canvas is decoration for
// assistive tech and the story survives without WebGL.

interface Props {
  counts: MatrixCounts
  cutoff: number
  children: ReactNode
}

const fmt = (n: number) => n.toLocaleString('en-US')

export function BacktestStage({ counts, cutoff, children }: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRefs = useRef<Partial<Record<BacktestLabelKey, HTMLDivElement | null>>>({})
  const [mode, setMode] = useState<'idle' | 'live' | 'still'>('idle')

  useEffect(() => {
    const section = sectionRef.current
    const canvas = canvasRef.current
    if (!section || !canvas) return
    let cancelled = false
    let ctrl: BacktestController | null = null
    let offTick: (() => void) | null = null
    let mo: MutationObserver | null = null

    const webgl = (() => {
      try {
        const c = document.createElement('canvas')
        return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
      } catch {
        return false
      }
    })()
    if (!webgl || prefersReducedMotion()) {
      setMode('still')
      return
    }

    // Render only while on screen (a 7,720-block scene should not draw
    // behind other sections).
    const activeIo = new IntersectionObserver(([e]) => ctrl?.setActive(e.isIntersecting))
    activeIo.observe(section)

    // Mount when the section is within a screen of the viewport, so the
    // build is ready by the time it scrolls in but never competes with
    // the hero for the main thread.
    const io = new IntersectionObserver(
      ([e]) => {
        if (ctrl || !e.isIntersecting) return
        io.disconnect()
        import('@/lib/three/backtestScene')
          .then(({ mountBacktest }) =>
            mountBacktest(canvas, {
              counts,
              labels: labelRefs.current as Record<BacktestLabelKey, HTMLElement>,
            })
          )
          .then((c) => {
            if (cancelled) {
              c.destroy()
              return
            }
            ctrl = c
            const r = section.getBoundingClientRect()
            c.setActive(r.top < window.innerHeight && r.bottom > 0)
            const html = document.documentElement
            c.setDark(html.classList.contains('dark'))
            mo = new MutationObserver(() => c.setDark(html.classList.contains('dark')))
            mo.observe(html, { attributes: true, attributeFilter: ['class'] })
            offTick = onTick(() => c.setProgress(stageProgress(section)))
            c.firstFrame.then(() => !cancelled && setMode('live'))
          })
          .catch(() => !cancelled && setMode('still'))
      },
      { rootMargin: '100% 0px' }
    )
    io.observe(section)

    return () => {
      cancelled = true
      io.disconnect()
      activeIo.disconnect()
      offTick?.()
      mo?.disconnect()
      ctrl?.destroy()
    }
    // counts are static server data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const label = (key: BacktestLabelKey, top: string, bottom: string, tone: 'signal' | 'ink' | 'accent') => (
    <div
      ref={(el) => {
        labelRefs.current[key] = el
      }}
      className="pointer-events-none absolute left-0 top-0 will-change-transform"
      style={{ opacity: 0, visibility: 'hidden' }}
    >
      <div className="-translate-x-1/2 -translate-y-full pb-1 text-center">
        <div className="inline-block bg-background/88 px-2.5 py-1.5 backdrop-blur-[2px]">
          <div
            className={`t-headline tnum text-2xl sm:text-3xl ${
              tone === 'signal' ? 'text-danger' : tone === 'accent' ? 'text-accent' : 'text-text'
            }`}
          >
            {top}
          </div>
          <div className="t-label mt-0.5 whitespace-nowrap text-muted">{bottom}</div>
        </div>
        <div className="mx-auto h-5 w-px bg-text/50" />
      </div>
    </div>
  )

  return (
    <section ref={sectionRef} className="relative" aria-label="The backtest, as an object">
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden" aria-hidden="true">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ${
            mode === 'live' ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {mode === 'still' && <StillMatrix counts={counts} />}
        {label('tp', fmt(counts.tp), 'Liquidated, flagged', 'signal')}
        {label('fn', fmt(counts.fn), 'Liquidated, missed', 'signal')}
        {label('fp', fmt(counts.fp), 'Fine, flagged', 'ink')}
        {label('tn', fmt(counts.tn), 'Fine, cleared', 'ink')}
        {label('flagged', 'Flagged', `Score below ${cutoff}`, 'ink')}
        {label('cleared', 'Cleared', `${cutoff} and up`, 'ink')}
        {label('cut', String(cutoff), 'Operating cutoff', 'accent')}
      </div>
      <div className="relative -mt-[100svh]">{children}</div>
    </section>
  )
}

/** No-WebGL / reduced-motion rendering: the same matrix as a flat waffle. */
function StillMatrix({ counts }: { counts: MatrixCounts }) {
  const cells: Array<{ key: keyof MatrixCounts; label: string; tone: string }> = [
    { key: 'tp', label: 'Liquidated, flagged', tone: 'bg-danger' },
    { key: 'fn', label: 'Liquidated, missed', tone: 'bg-danger' },
    { key: 'fp', label: 'Fine, flagged', tone: 'bg-text' },
    { key: 'tn', label: 'Fine, cleared', tone: 'bg-text' },
  ]
  return (
    <div className="absolute inset-y-0 right-[var(--gutter)] hidden w-[46%] items-center lg:flex">
      <figure className="w-full">
      <div className="grid w-full grid-cols-2 gap-8">
        {cells.map((c) => (
          <div key={c.key}>
            <div className="flex flex-wrap gap-[2px]">
              {Array.from({ length: Math.round(counts[c.key] / 25) }).map((_, i) => (
                <span key={i} className={`h-[7px] w-[7px] ${c.tone}`} />
              ))}
            </div>
            <p className="t-label mt-3 text-muted">
              {fmt(counts[c.key])} · {c.label}
            </p>

          </div>
        ))}
      </div>
      <figcaption className="t-label mt-6 text-muted">One square per 25 borrowers, rounded.</figcaption>
      </figure>
    </div>
  )
}
