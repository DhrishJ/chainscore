'use client'
import { createContext, useContext, useEffect } from 'react'

// The site has one theme (docs/DESIGN.md, D-040): studio black, the
// background the calibre photographs are lit against. The provider keeps
// its old shape so wallet UI that asks for the theme keeps working.

type Theme = 'dark'

interface ThemeContextType {
  theme: Theme
  toggle: () => void
  mounted: boolean
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', toggle: () => {}, mounted: true })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('dark')
    try {
      localStorage.removeItem('cs-theme')
    } catch {}
  }, [])
  return <ThemeContext.Provider value={{ theme: 'dark', toggle: () => {}, mounted: true }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
