'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { onTick, prefersReducedMotion, stageProgress } from '@/lib/motion/engine'
import type { InstrumentController, IllustrativeReading } from '@/lib/three/instrumentScene'
import type { ScaleSpec } from '@/lib/three/textures'

// The hero, the manifesto, and the method share one sticky stage: CS-1
// stays on screen and turns, then comes apart, while the copy scrolls past.
// three.js loads after hydration (dynamic import), so the server-rendered
// headline is the LCP element and the 3D never blocks first paint. Without
// WebGL, or with reduced motion, the stage shows a still of the same object.

export interface GearLabel {
  index: string
  name: string
  features: number
}

interface Props {
  spec: ScaleSpec
  readings: IllustrativeReading[]
  gears: GearLabel[]
  children: ReactNode
}

function formatPd(pd: number) {
  const pct = pd * 100
  return pct < 1 ? `${pct.toFixed(2)}%` : `${pct.toFixed(1)}%`
}

export function InstrumentStage({ spec, readings, gears, children }: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRefs = useRef<Array<HTMLDivElement | null>>([])
  const leaderRefs = useRef<Array<SVGPolylineElement | null>>([])
  const calloutRef = useRef<HTMLDivElement>(null)
  const ctrlRef = useRef<InstrumentController | null>(null)
  const [mode, setMode] = useState<'loading' | 'live' | 'still'>('loading')
  const [reading, setReading] = useState<IllustrativeReading>(readings[0])

  useEffect(() => {
    const section = sectionRef.current
    const canvas = canvasRef.current
    if (!section || !canvas) return
    let cancelled = false
    let offTick: (() => void) | null = null
    let offResize: (() => void) | null = null
    let io: IntersectionObserver | null = null
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

    import('@/lib/three/instrumentScene')
      .then(({ mountInstrument }) =>
        mountInstrument(canvas, {
          spec,
          readings,
          labels: labelRefs.current.filter(Boolean) as HTMLElement[],
          leaders: leaderRefs.current.filter(Boolean) as SVGPolylineElement[],
          callout: calloutRef.current,
          onReading: (r) => setReading(r),
        })
      )
      .then((ctrl) => {
        if (cancelled) {
          ctrl.destroy()
          return
        }
        ctrlRef.current = ctrl
        const html = document.documentElement
        ctrl.setDark(html.classList.contains('dark'))
        mo = new MutationObserver(() => ctrl.setDark(html.classList.contains('dark')))
        mo.observe(html, { attributes: true, attributeFilter: ['class'] })
        // Timeline from layout: the turn plays as the manifesto rises into
        // view, the explode as the method panel does.
        const measure = () => {
          const vh = window.innerHeight
          const travel = Math.max(1, section.offsetHeight - vh)
          const mark = (name: string) =>
            (section.querySelector<HTMLElement>(`[data-mark="${name}"]`)?.offsetTop ?? 0) - vh
          const m = mark('manifesto')
          const x = mark('method')
          ctrl.setTimeline({
            turn: [Math.max(0, (m + vh * 0.35) / travel), Math.max(0.01, (m + vh * 1.0) / travel)],
            explode: [(x + vh * 0.5) / travel, Math.min(0.98, (x + vh * 1.25) / travel)],
          })
        }
        measure()
        window.addEventListener('resize', measure)
        offResize = () => window.removeEventListener('resize', measure)
        offTick = onTick(() => ctrl.setProgress(stageProgress(section)))
        io = new IntersectionObserver(([e]) => ctrl.setActive(e.isIntersecting), { rootMargin: '10% 0px' })
        io.observe(section)
        ctrl.firstFrame.then(() => !cancelled && setMode('live'))
      })
      .catch(() => !cancelled && setMode('still'))

    return () => {
      cancelled = true
      offTick?.()
      offResize?.()
      io?.disconnect()
      mo?.disconnect()
      ctrlRef.current?.destroy()
      ctrlRef.current = null
    }
    // spec/readings are static server data for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cursor parallax and tap-to-measure. Listening on the section lets the
  // copy layer sit above the canvas without swallowing these.
  useEffect(() => {
    const section = sectionRef.current
    if (!section || mode !== 'live') return
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const ctrl = ctrlRef.current
      if (!ctrl) return
      ctrl.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
      const over = window.scrollY < window.innerHeight * 0.5 && ctrl.hitTest(e.clientX, e.clientY)
      const interactive = (e.target as HTMLElement).closest('a, button, input, select, textarea, label')
      section.style.cursor = over && !interactive ? 'pointer' : ''
    }
    const onClick = (e: MouseEvent) => {
      const ctrl = ctrlRef.current
      if (!ctrl) return
      if ((e.target as HTMLElement).closest('a, button, input, select, textarea, label')) return
      if (window.scrollY < window.innerHeight * 0.5 && ctrl.hitTest(e.clientX, e.clientY)) ctrl.measure()
    }
    let lastNudge = 0
    const onTyping = () => {
      const now = performance.now()
      if (now - lastNudge < 120) return
      lastNudge = now
      ctrlRef.current?.nudge()
    }
    section.addEventListener('pointermove', onMove)
    section.addEventListener('click', onClick)
    window.addEventListener('cs:typing', onTyping)
    return () => {
      section.removeEventListener('pointermove', onMove)
      section.removeEventListener('click', onClick)
      window.removeEventListener('cs:typing', onTyping)
    }
  }, [mode])

  return (
    <section ref={sectionRef} className="relative">
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden" aria-hidden="true">
        {/* Still of the same object: shown while three.js loads, and as the
            whole experience without WebGL or with reduced motion. */}
        <div
          className={`cs1-poster pointer-events-none transition-opacity duration-700 ease-out ${
            mode === 'live' ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/cs1-instrument.webp"
            srcSet="/images/cs1-instrument-800.webp 800w, /images/cs1-instrument.webp 1200w"
            sizes="(max-width: 640px) 42vh, 72vh"
            alt=""
            width={1200}
            height={1200}
            decoding="async"
            className="h-full w-full object-contain"
          />
        </div>
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
            mode === 'live' ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* Exploded-view annotation: elbowed leaders (SVG) from each gear to
            a label in an aligned column. Positioned by the scene. */}
        <svg className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block" aria-hidden>
          {gears.map((g, i) => (
            <polyline
              key={g.name}
              ref={(el) => {
                leaderRefs.current[i] = el
              }}
              points="0,0 0,0"
              fill="none"
              stroke="rgb(var(--cs-text) / 0.6)"
              strokeWidth="1"
              style={{ opacity: 0 }}
            />
          ))}
        </svg>
        {gears.map((g, i) => (
          <div
            key={g.name}
            ref={(el) => {
              labelRefs.current[i] = el
            }}
            className="pointer-events-none absolute left-0 top-0 hidden will-change-transform sm:block"
            style={{ opacity: 0, visibility: 'hidden' }}
          >
            <div className="flex -translate-y-1/2 items-center gap-2.5 border border-text/15 bg-background/90 px-2.5 py-1.5 backdrop-blur-[2px]">
              <span className="t-label text-accent">{g.index}</span>
              <span className="t-label whitespace-nowrap text-text">{g.name}</span>
            </div>
          </div>
        ))}

        {/* While the manifesto reads, the needle rests on its pin: this is
            what the instrument shows for a wallet that has never borrowed. */}
        <div
          ref={calloutRef}
          className="pointer-events-none absolute left-0 top-0 hidden will-change-transform sm:block"
          style={{ opacity: 0, visibility: 'hidden' }}
        >
          <div className="flex -translate-x-full -translate-y-1/2 items-center">
            <span className="t-label whitespace-nowrap border border-text/20 bg-background/90 px-2.5 py-1.5 text-text backdrop-blur-[2px]">
              noBorrowHistory: <span className="text-accent">true</span>
            </span>
            <span className="h-px w-10 bg-text/60 lg:w-16" />
            <span className="h-[7px] w-[7px] rounded-full bg-text ring-[3px] ring-background" />
          </div>
        </div>
      </div>

      <div className="relative -mt-[100svh]">
        {children}
        {/* Live readout for the hero, sits with the hero copy. */}
        <div className="pointer-events-none absolute right-[var(--gutter)] top-[calc(100svh-9.75rem)] hidden w-56 lg:block">
          <div className="border-t border-text/80 pt-3">
            <dl className="t-label grid grid-cols-[1fr_auto] gap-y-1.5 text-text">
              <dt className="text-muted">Reading</dt>
              <dd className="tnum">{reading.score}</dd>
              <dt className="text-muted">Grade</dt>
              <dd className="tnum">{reading.grade}</dd>
              <dt className="text-muted">Calibrated PD</dt>
              <dd className="tnum">{formatPd(reading.pd)}</dd>
              <dt className="text-muted">Data completeness</dt>
              <dd className="tnum">{Math.round(reading.completeness * 100)}%</dd>
            </dl>
            <p className="t-label mt-3 text-muted">
              Illustrative readings{mode === 'live' ? '. Tap the instrument to measure again.' : '.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
