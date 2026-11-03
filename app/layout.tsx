import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono, Newsreader } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/Providers'
import { Navbar } from '@/components/Navbar'
import { StructuredData } from '@/components/StructuredData'
import { MotionRoot } from '@/components/site/MotionRoot'
import { clientEnv } from '@/lib/env.client'
import './globals.css'

// House type (docs/DESIGN.md): Archivo carries display, UI, and body, with
// its width axis doing the condensed-headline and engraved-label work;
// Newsreader is the editorial voice; IBM Plex Mono annotates and holds data.
// All three are self-hosted by next/font at build time (CSP font-src 'self').
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

// Below the fold only, so it does not compete with the hero for bandwidth.
const newsreader = Newsreader({
  subsets: ['latin'],
  axes: ['opsz'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: {
    default: 'ChainScore | Onchain Credit Risk API for DeFi Lending',
    template: '%s | ChainScore',
  },
  description:
    'Credit risk infrastructure for onchain lending. A 300 to 850 borrower score with calibrated default probability and a published backtest, from public chain history on 7 EVM networks plus Solana. No KYC.',
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_APP_URL || 'https://chainscore.dev'),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'ChainScore | Onchain Credit Risk API for DeFi Lending',
    description:
      'Price borrower risk from real onchain history. Scores, calibrated default probability, and a published backtest via one API.',
    type: 'website',
    siteName: 'ChainScore',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChainScore',
    description: 'Onchain borrower credit scores with a published backtest. Built for DeFi underwriting.',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F0EEE9' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0C0B' },
  ],
}

// Runs before first paint: theme class (no flash) and the motion class that
// lets lib/motion arm reveals. Reduced-motion readers never get `motion`.
const bootScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('cs-theme');if(t==='dark')d.classList.add('dark');}catch(e){}try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('motion');}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${plexMono.variable} ${newsreader.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <StructuredData />
      </head>
      {/* The navbar is fixed; pages start below it. The home page pulls
          itself back up underneath (its hero is drawn for that). */}
      <body className="min-h-screen bg-background pt-[var(--nav-h)] font-sans text-text antialiased">
        <Providers>
          <MotionRoot />
          <Navbar />
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
