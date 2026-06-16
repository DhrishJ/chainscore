import type { Metadata } from 'next'
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google'
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

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ChainScore | Onchain Credit Scores and Lending Marketplace',
  description:
    'Free onchain credit scoring for any wallet, plus a lending marketplace. A single 300 to 850 score read from public chain history across 8 networks. No KYC required.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://chainscore.dev'),
  openGraph: {
    title: 'ChainScore | Onchain Credit Scores and Lending Marketplace',
    description: 'Score any wallet, then lend or borrow with reputation you can verify.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChainScore',
    description: 'Onchain credit scores and a reputation based lending marketplace.',
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
