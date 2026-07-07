import type { Metadata } from 'next'
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/Providers'
import { Navbar } from '@/components/Navbar'
import { StructuredData } from '@/components/StructuredData'
import { clientEnv } from '@/lib/env.client'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('cs-theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();` }} />
        <StructuredData />
      </head>
      <body className="min-h-screen bg-background font-sans text-text antialiased">
        <Providers>
          <Navbar />
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
