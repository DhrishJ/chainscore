'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// Moves its content against the scroll by `speed` (0.16 = 16% of the
// distance scrolled past it). One transform per frame, and only while the
// element is on screen; nothing at all under prefers-reduced-motion.

export function Drift({
  speed = 0.12,
  className = '',
  children,
}: {
  speed?: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let visible = false
    const update = () => {
      raf = 0
      const parent = el.parentElement ?? el
      const r = parent.getBoundingClientRect()
      const offset = (window.innerHeight / 2 - (r.top + r.height / 2)) * speed
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`
    }
    const onScroll = () => {
      if (visible && !raf) raf = requestAnimationFrame(update)
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) onScroll()
    })
    io.observe(el.parentElement ?? el)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [speed])

  return (
    <div ref={ref} className={className} style={{ willChange: 'transform' }}>
      {children}
    </div>
  )
}
