'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { initReveals } from '@/lib/motion/reveal'
import { prefersReducedMotion, startSmoothScroll, stopSmoothScroll } from '@/lib/motion/engine'

// Smooth scroll belongs to the editorial pages. App surfaces (dashboard,
// marketplace, score results) keep native scroll: they have modals, inner
// scroll areas, and wallet popups that should behave exactly like the OS.
const SMOOTH_ROUTES = new Set(['/', '/retrospective', '/pricing'])

export function MotionRoot() {
  const pathname = usePathname()

  useEffect(() => {
    const html = document.documentElement
    if (prefersReducedMotion()) {
      html.classList.remove('motion')
      return
    }
    html.classList.add('motion')

    if (SMOOTH_ROUTES.has(pathname)) startSmoothScroll()
    else stopSmoothScroll()

    // Wait a frame so the new route's DOM is committed before arming.
    let cleanup = () => {}
    const id = requestAnimationFrame(() => {
      cleanup = initReveals(document)
    })

    const onFirstScroll = () => html.classList.add('has-scrolled')
    if (window.scrollY > 0) onFirstScroll()
    else window.addEventListener('scroll', onFirstScroll, { once: true, passive: true })

    return () => {
      cancelAnimationFrame(id)
      cleanup()
      window.removeEventListener('scroll', onFirstScroll)
    }
  }, [pathname])

  return null
}
