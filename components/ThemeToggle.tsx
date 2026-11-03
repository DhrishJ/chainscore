'use client'
import { useTheme } from '@/lib/theme'

// Paper or graphite. A half-filled disc that turns over when switched.
export function ThemeToggle() {
  const { theme, toggle, mounted } = useTheme()
  const dark = mounted && theme === 'dark'

  return (
    <button
      onClick={toggle}
      className="group grid h-9 w-9 place-items-center text-text transition-colors hover:text-accent"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Paper' : 'Graphite'}
    >
      <svg
        viewBox="0 0 20 20"
        className={`h-[17px] w-[17px] transition-transform duration-700 ease-out ${dark ? 'rotate-180' : 'rotate-0'}`}
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 1.75 A8.25 8.25 0 0 1 10 18.25 Z" fill="currentColor" />
      </svg>
    </button>
  )
}
