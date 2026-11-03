// One animation clock for the whole site. Lenis (smooth scroll), the 3D
// stages, and scroll-linked type all tick from the same requestAnimationFrame
// so scroll position and every scroll-driven visual are read in the same
// frame and can never drift apart.
//
// Everything here is progressive enhancement. With prefers-reduced-motion,
// Lenis never starts (native scroll), reveals are never armed, and the
// stages render their resting state.

import type Lenis from 'lenis'

export type Tick = (time: number, dt: number) => void

const ticks = new Set<Tick>()
let rafId = 0
let last = 0
let lenis: Lenis | null = null
let lenisLoading: Promise<void> | null = null

function loop(time: number) {
  const dt = last ? Math.min(0.1, (time - last) / 1000) : 1 / 60
  last = time
  lenis?.raf(time)
  ticks.forEach((fn) => fn(time, dt))
  rafId = ticks.size > 0 || lenis ? requestAnimationFrame(loop) : 0
  if (!rafId) last = 0
}

function ensureLoop() {
  if (!rafId && typeof window !== 'undefined') rafId = requestAnimationFrame(loop)
}

/** Subscribe to the shared frame clock. Returns an unsubscribe function. */
export function onTick(fn: Tick): () => void {
  ticks.add(fn)
  ensureLoop()
  return () => {
    ticks.delete(fn)
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Start smooth scrolling. Wheel and trackpad only: touch keeps native
 * momentum, which is faster and what phones expect. Scrollable overlays
 * (wallet modals, dialogs, anything marked data-lenis-prevent) keep their
 * own native scroll.
 */
export function startSmoothScroll(): void {
  if (lenis || lenisLoading || prefersReducedMotion()) return
  lenisLoading = import('lenis').then(({ default: LenisCtor }) => {
    lenisLoading = null
    if (lenis || prefersReducedMotion()) return
    lenis = new LenisCtor({
      autoRaf: false,
      duration: 1.15,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false,
      anchors: { offset: -64 },
      prevent: (node: HTMLElement) =>
        Boolean(node.closest?.('[data-rk], [role="dialog"], [data-lenis-prevent], .wallet-adapter-modal')),
    })
    ensureLoop()
  })
}

export function stopSmoothScroll(): void {
  lenis?.destroy()
  lenis = null
}

/** Smooth-scroll to an element or y offset, falling back to native. */
export function scrollToTarget(target: string | HTMLElement | number, offset = -64): void {
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.4 })
    return
  }
  if (typeof target === 'number') {
    window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    return
  }
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY + offset
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** Current scroll velocity in px/frame (0 without Lenis). */
export function scrollVelocity(): number {
  return lenis?.velocity ?? 0
}

/**
 * Progress of a tall section through the viewport: 0 when its top reaches
 * the top of the viewport, 1 when its bottom reaches the bottom. This is
 * the timeline for sticky "stage" sections.
 */
export function stageProgress(el: Element): number {
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const travel = r.height - vh
  if (travel <= 0) return r.top <= 0 ? 1 : 0
  return clamp01(-r.top / travel)
}

/**
 * Progress of an element passing through the viewport: 0 when its top
 * enters at the bottom edge, 1 when its bottom leaves at the top edge.
 */
export function passProgress(el: Element): number {
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  return clamp01((vh - r.top) / (vh + r.height))
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Map v from [a, b] to [0, 1], clamped. */
export function range(v: number, a: number, b: number): number {
  return clamp01((v - a) / (b - a))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
}
