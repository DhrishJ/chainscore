import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/Providers'
import { Navbar } from '@/components/Navbar'
import { StructuredData } from '@/components/StructuredData'
import { clientEnv } from '@/lib/env.client'
import './globals.css'

// House type (docs/DESIGN.md): IBM Plex Sans for everything people read,
// with tabular figures in data; IBM Plex Mono only for code, addresses and
// API fields. Self-hosted by next/font at build time (CSP font-src 'self').
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
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
  themeColor: '#0B0B0C',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${sans.variable} ${mono.variable}`}
    >
      <head>
        <StructuredData />
      </head>
      {/* The navbar is fixed; pages start below it. The home page pulls
          itself back up underneath (its hero is drawn for that). */}
      <body className="min-h-screen bg-background pt-[var(--nav-h)] font-sans text-text antialiased">
        <Providers>
          <Navbar />
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
