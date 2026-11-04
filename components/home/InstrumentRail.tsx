'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ScoreInstrument } from '@/components/instrument/ScoreInstrument'
import type { InstrumentHandle, InstrumentSpec, InstrumentState, Pose } from '@/lib/instrument/stage'

// The first four sections share one instrument. On wide screens it stays in
// view beside them and moves with the reader. Each stop is an element in
// the text ([data-stop]) with a reading, a view and a caption: between two
// stops the view turns continuously with the scroll, so reaching the factor
// breakdown turns the instrument around to show its factor wheels, and the
// gear train turns as the page moves. The reading and caption change as
// each stop reaches the middle of the screen. On phones the instrument
// appears once, in the hero ([data-instrument-slot]), turning as it passes.

export interface RailStop {
  key: string
  state: InstrumentState
  pose: Pose
  /** Read aloud for the instrument, and shown under it. */
  caption: string
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const SPIN_PER_PX = 0.0022 // centre wheel radians per pixel scrolled

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    yaw: a.yaw + (b.yaw - a.yaw) * t,
    zoom: (a.zoom ?? 1) + ((b.zoom ?? 1) - (a.zoom ?? 1)) * t,
  }
}

export function InstrumentRail({ spec, stops, children }: { spec: InstrumentSpec; stops: RailStop[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState<boolean | null>(null)
  const [active, setActive] = useState(0)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const live = useRef<{ handle: InstrumentHandle; still: boolean } | null>(null)
  const drive = useRef<(instant?: boolean) => void>(() => {})

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener('change', update)
    setSlot(document.querySelector<HTMLElement>('[data-instrument-slot]'))
    return () => mq.removeEventListener('change', update)
  }, [])

  // wide: pose follows the scroll between stops
  useEffect(() => {
    if (!wide || !ref.current) return
    const root = ref.current
    const els = stops.map((s) => root.querySelector<HTMLElement>(`[data-stop="${s.key}"]`))
    let mids: number[] = []
    let tops: number[] = []
    const measure = () => {
      const y = window.scrollY
      const rects = els.map((el) => el?.getBoundingClientRect() ?? null)
      tops = rects.map((r, i) => (r ? r.top + y : i === 0 ? 0 : Infinity))
      mids = rects.map((r, i) => (r ? r.top + y + r.height / 2 : tops[i]))
    }
    let current = -1
    let raf = 0
    const update = (instant = false) => {
      raf = 0
      const c = window.scrollY + window.innerHeight / 2
      let idx = 0
      for (let i = 0; i < tops.length; i++) if (tops[i] <= c) idx = i
      if (idx !== current) {
        current = idx
        setActive(idx)
      }
      const l = live.current
      if (!l) return
      if (l.still) {
        l.handle.setPose(stops[idx].pose, { instant: true })
        return
      }
      let pose = stops[0].pose
      const n = mids.length
      if (c >= mids[n - 1]) pose = stops[n - 1].pose
      else {
        for (let i = 0; i < n - 1; i++) {
          if (c >= mids[i] && c < mids[i + 1]) {
            pose = lerpPose(stops[i].pose, stops[i + 1].pose, smooth((c - mids[i]) / (mids[i + 1] - mids[i])))
            break
          }
        }
      }
      l.handle.setPose(pose, { instant })
      l.handle.setSpin(window.scrollY * SPIN_PER_PX)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => update())
    }
    const remeasure = () => {
      measure()
      onScroll()
    }
    measure()
    update()
    drive.current = (instant) => {
      measure()
      update(instant)
    }
    const ro = new ResizeObserver(remeasure)
    ro.observe(root)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', remeasure)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', remeasure)
      if (raf) cancelAnimationFrame(raf)
      drive.current = () => {}
      live.current = null // the instrument unmounts with the layout
    }
  }, [wide, stops])

  // phones: the hero instrument turns as it passes through the screen
  useEffect(() => {
    if (wide !== false || !slot) return
    let raf = 0
    const update = (instant = false) => {
      raf = 0
      const l = live.current
      if (!l) return
      const r = slot.getBoundingClientRect()
      const k = Math.min(1, Math.max(0, 1 - (r.top + r.height / 2) / window.innerHeight))
      l.handle.setPose(l.still ? stops[0].pose : { pitch: -0.14 - 0.22 * k, yaw: 0.5 - 1.05 * k }, { instant })
      if (!l.still) l.handle.setSpin(window.scrollY * SPIN_PER_PX)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => update())
    }
    drive.current = (instant) => update(instant)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      drive.current = () => {}
      live.current = null
    }
  }, [wide, slot, stops])

  const onReady = useCallback((handle: InstrumentHandle, still: boolean) => {
    live.current = { handle, still }
    drive.current(true)
  }, [])

  const current = stops[active] ?? stops[0]

  return (
    <div ref={ref} className="frame grid grid-cols-1 gap-x-[var(--gutter)] lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-7">{children}</div>
      <aside className="hidden lg:col-span-5 lg:block" aria-label="Score instrument">
        <div className="sticky top-[var(--nav-h)] flex h-[calc(100svh-var(--nav-h))] flex-col items-center justify-center">
          {wide && (
            <>
              <ScoreInstrument
                spec={spec}
                state={current.state}
                label={current.caption}
                onReady={onReady}
                factorLabels
                className="w-full max-w-[34rem]"
              />
              <p className="t-label mt-2 min-h-[2.9em] max-w-[36ch] text-center text-muted" aria-live="polite">
                {current.caption}
              </p>
            </>
          )}
        </div>
      </aside>
      {wide === false &&
        slot &&
        createPortal(
          <ScoreInstrument
            spec={spec}
            state={stops[0].state}
            label={stops[0].caption}
            onReady={onReady}
            className="mx-auto w-full max-w-[24rem]"
          />,
          slot
        )}
    </div>
  )
}
