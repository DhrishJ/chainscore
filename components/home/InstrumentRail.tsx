'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ScoreInstrument } from '@/components/instrument/ScoreInstrument'
import type { InstrumentState } from '@/lib/instrument/stage'
import type { ScaleSpec } from '@/lib/instrument/dial'

// The first four sections share one instrument. On wide screens it stays in
// view beside them and its reading follows the section in the middle of
// the screen: the example wallet's score, then no reading at all for a
// wallet that never borrowed, then the operating cutoff. On phones it
// appears once, in the hero ([data-instrument-slot]).

export interface RailReading {
  state: InstrumentState
  /** Read aloud for the instrument, and shown under it. */
  caption: string
}

export function InstrumentRail({
  spec,
  readings,
  children,
}: {
  spec: ScaleSpec
  readings: Record<string, RailReading>
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState<boolean | null>(null)
  const [active, setActive] = useState(Object.keys(readings)[0])
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener('change', update)
    setSlot(document.querySelector<HTMLElement>('[data-instrument-slot]'))
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!wide || !ref.current) return
    const sections = Array.from(ref.current.querySelectorAll<HTMLElement>('[data-reading]'))
    // The reading changes once the reader pauses, never mid-scroll: the
    // instrument then renders only while nothing else is moving.
    let pending: string | null = null
    let lastScroll = 0
    let timer = 0
    const flush = () => {
      timer = 0
      const quiet = performance.now() - lastScroll
      if (quiet < 160) {
        timer = window.setTimeout(flush, 160 - quiet)
        return
      }
      if (pending) setActive(pending)
      pending = null
    }
    const onScroll = () => {
      lastScroll = performance.now()
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) pending = e.target.getAttribute('data-reading')
        }
        if (pending && !timer) timer = window.setTimeout(flush, 160)
      },
      // the band across the middle of the screen
      { rootMargin: '-46% 0px -46% 0px' }
    )
    sections.forEach((s) => io.observe(s))
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      if (timer) window.clearTimeout(timer)
    }
  }, [wide])

  const current = readings[active] ?? readings[Object.keys(readings)[0]]
  const first = readings[Object.keys(readings)[0]]

  return (
    <div ref={ref} className="frame grid grid-cols-1 gap-x-[var(--gutter)] lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-7">{children}</div>
      <aside className="hidden lg:col-span-5 lg:block" aria-label="Score instrument">
        <div className="sticky top-[var(--nav-h)] flex h-[calc(100svh-var(--nav-h))] flex-col items-center justify-center">
          {wide && (
            <>
              <ScoreInstrument spec={spec} state={current.state} label={current.caption} className="w-full max-w-[34rem]" />
              <p className="t-label mt-2 min-h-[2.9em] max-w-[34ch] text-center text-muted" aria-live="polite">
                {current.caption}
              </p>
            </>
          )}
        </div>
      </aside>
      {wide === false &&
        slot &&
        createPortal(
          <ScoreInstrument spec={spec} state={first.state} label={first.caption} className="mx-auto w-full max-w-[24rem]" />,
          slot
        )}
    </div>
  )
}
