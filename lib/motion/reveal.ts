// Scroll reveals. Elements opt in with data-reveal (fade + rise),
// data-lines (line masks, see .lm in globals.css), data-rule (hairline
// draws across), or data-roll (odometer digits, components/home).
// Nothing is hidden by default: an element is only "armed" (hidden,
// waiting) if it is below the fold when this runs, so content that is
// already on screen never flashes, and no-JS readers see everything.

const SELECTOR = '[data-reveal], [data-lines], [data-rule], [data-roll]'

export function initReveals(root: ParentNode = document): () => void {
  if (typeof window === 'undefined' || !document.documentElement.classList.contains('motion')) {
    return () => {}
  }
  const vh = window.innerHeight
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const el = e.target as HTMLElement
        el.classList.add('is-in')
        io.unobserve(el)
        // Drop the reveal mask once it has fully opened (see globals.css).
        const delay = parseFloat(getComputedStyle(el).getPropertyValue('--d')) || 0
        window.setTimeout(() => el.classList.add('is-done'), 1250 + delay)
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0 }
  )

  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    if (el.classList.contains('is-in') || el.classList.contains('is-armed')) return
    const r = el.getBoundingClientRect()
    const onScreen = r.top < vh * 0.92 && r.bottom > 0
    if (onScreen) {
      el.classList.add('is-in')
      return
    }
    el.classList.add('is-armed')
    io.observe(el)
  })

  return () => io.disconnect()
}
