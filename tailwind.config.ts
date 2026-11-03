import type { Config } from 'tailwindcss'

// Every ChainScore color is a CSS variable (space separated RGB channels)
// set per theme in app/globals.css, so `bg-accent/10` style opacity
// modifiers work and each theme can tune its own contrast. See
// docs/DESIGN.md for the values and the contrast each pairing clears.
const cs = (name: string) => `rgb(var(--cs-${name}) / <alpha-value>)`

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ChainScore design system
        background: cs('bg'),
        card: cs('card'),
        border: cs('border'),
        text: cs('text'),
        muted: cs('muted'),
        accent: cs('accent'),
        'accent-fg': cs('accent-fg'),
        success: cs('success'),
        warning: cs('warning'),
        danger: cs('danger'),
        // The ink slab: a surface that stays dark in both themes (code
        // panels, the footer), with its own text, muted, and accent tones.
        ink: cs('ink'),
        'ink-fg': cs('ink-fg'),
        'ink-muted': cs('ink-muted'),
        'ink-accent': cs('ink-accent'),
        'ink-line': cs('ink-line'),
        'ink-green': cs('ink-green'),
        'ink-amber': cs('ink-amber'),
        // shadcn compatibility tokens (components/ui/* primitives only)
        foreground: 'hsl(var(--foreground))',
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      fontFamily: {
        // Archivo carries display, UI, and body; its width axis does the
        // work other systems need a second family for (condensed headlines,
        // expanded engraved labels). `grotesk` is kept as an alias so older
        // pages keep resolving to the house face.
        sans: ['var(--font-archivo)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        grotesk: ['var(--font-archivo)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-newsreader)', 'Georgia', 'ui-serif', 'serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      transitionTimingFunction: {
        // The house curve: fast out, long settle. Used for reveals and UI.
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-quart': 'cubic-bezier(0.76, 0, 0.24, 1)',
      },
      maxWidth: {
        frame: '1600px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
