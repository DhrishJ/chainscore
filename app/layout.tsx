import type { Metadata } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/Providers'
import { Navbar } from '@/components/Navbar'
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

export const metadata: Metadata = {
  title: 'ChainScore — On-Chain Credit Score & Loan Marketplace',
  description:
    'Free on-chain credit scoring for Ethereum wallets and a peer-to-peer lending marketplace. 300–850 FICO-style scale. No KYC required.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://chainscore.dev'),
  openGraph: {
    title: 'ChainScore — On-Chain Credit Score & Loan Marketplace',
    description: 'Score your wallet, lend or borrow with trust-scored counterparties.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChainScore',
    description: 'On-chain credit scores and peer-to-peer lending.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('cs-theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();` }} />
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
