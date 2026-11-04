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
        // One family carries the whole site (Schibsted Grotesk); code is the
        // only thing set in mono (Fragment Mono). `grotesk` and `serif` are
        // kept as aliases so older pages resolve to the house face.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        grotesk: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // Square throughout (docs/DESIGN.md); circles stay round via
      // rounded-full. The larger radii are pinned so older screens
      // (dashboard, marketplace) follow the system without a rewrite.
      borderRadius: {
        lg: 'var(--radius)',
        md: 'var(--radius)',
        sm: 'var(--radius)',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'in-out-quart': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      maxWidth: {
        frame: '1680px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
