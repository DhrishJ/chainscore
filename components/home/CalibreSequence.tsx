'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// The calibre taken apart by the scroll: a pre-rendered sequence (Blender,
// Cycles) drawn to a canvas. No WebGL and no animation loop; the canvas is
// redrawn only when the scroll position maps to a different frame. Frames
// stream in coarse-to-fine once the section is near, so a fast scroll
// always has a nearby frame to show.

interface Props {
  frames: number
  poster: number
  alt: string
  children: ReactNode
}

const src = (set: 'd' | 'm', i: number) => `/calibre/explode/${set}/${String(i).padStart(3, '0')}.webp`

export function CalibreSequence({ frames, poster, alt, children }: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    const canvas = canvasRef.current
    if (!section || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const set: 'd' | 'm' = window.innerWidth < 768 ? 'm' : 'd'
    const images: Array<HTMLImageElement | null> = new Array(frames).fill(null)
    let current = -1
    let raf = 0
    let started = false
    let alive = true

    const size = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      current = -1
    }

    const progress = () => {
      const r = section.getBoundingClientRect()
      const span = r.height - window.innerHeight
      const p = span > 0 ? -r.top / span : 0
      // The movement starts coming apart once the intro has been read and
      // is fully apart before the last group leaves.
      return Math.min(1, Math.max(0, (p - 0.06) / 0.78))
    }

    // A frame is usable once decoded; a failed request leaves a broken
    // image (complete, but zero-sized), which drawImage would throw on.
    const ready = (k: number) => {
      const img = images[k]
      return Boolean(img && img.complete && img.naturalWidth > 0)
    }
    const nearestLoaded = (i: number) => {
      for (let d = 0; d < frames; d++) {
        if (i - d >= 0 && ready(i - d)) return i - d
        if (i + d < frames && ready(i + d)) return i + d
      }
      return -1
    }

    const draw = () => {
      raf = 0
      const target = Math.round(progress() * (frames - 1))
      const i = nearestLoaded(target)
      if (i < 0 || i === current) return
      const img = images[i]!
      const cw = canvas.width
      const ch = canvas.height
      const s = Math.min(cw / img.naturalWidth, ch / img.naturalHeight)
      const w = img.naturalWidth * s
      const h = img.naturalHeight * s
      ctx.fillStyle = '#0b0b0c'
      ctx.fillRect(0, 0, cw, ch)
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h)
      current = i
      if (!drawn) setDrawn(true)
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }

    const load = (i: number) =>
      new Promise<void>((resolve) => {
        if (images[i]) return resolve()
        const img = new Image()
        img.decoding = 'async'
        img.src = src(set, i)
        images[i] = img
        img
          .decode()
          .catch(() => undefined)
          .then(() => {
            if (alive) schedule()
            resolve()
          })
      })

    const start = async () => {
      if (started) return
      started = true
      // coarse pass first (every 8th frame), then fill the gaps
      const order: number[] = []
      for (const step of [8, 4, 2, 1]) {
        for (let i = 0; i < frames; i += step) if (!order.includes(i)) order.push(i)
      }
      if (!order.includes(frames - 1)) order.splice(1, 0, frames - 1)
      for (let k = 0; k < order.length && alive; k += 4) {
        await Promise.all(order.slice(k, k + 4).map(load))
      }
    }

    const near = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) start()
      },
      { rootMargin: '120% 0px' }
    )
    near.observe(section)

    size()
    const onResize = () => {
      size()
      schedule()
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      near.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
    // frames is static
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section ref={sectionRef} aria-label={alt} className="relative grid grid-cols-1 lg:grid-cols-12 lg:gap-x-[var(--gutter)]">
      <div className="sticky top-[var(--nav-h)] z-10 h-[50svh] bg-background lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:h-[calc(100svh-var(--nav-h))]">
        {/* Server-rendered still: shown without JS, under reduced motion,
            and until the first canvas frame is ready. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src('m', poster)}
          srcSet={`${src('m', poster)} 640w, ${src('d', poster)} 1200w`}
          sizes="(min-width: 1024px) 58vw, 100vw"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${drawn ? 'opacity-0' : 'opacity-100'}`}
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      </div>
      <div className="relative lg:col-span-5 lg:row-start-1">{children}</div>
    </section>
  )
}
