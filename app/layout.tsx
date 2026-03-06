import type { Metadata } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
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
  title: 'ChainScore — Ethereum Wallet Credit Score',
  description:
    'Free on-chain credit scoring for Ethereum wallets. 300–850 FICO-style scale based on wallet age, transaction history, DeFi activity, and repayment behavior.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://chainscore.xyz'),
  openGraph: {
    title: 'ChainScore — Ethereum Wallet Credit Score',
    description: 'Free on-chain credit scoring for Ethereum wallets.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChainScore',
    description: 'Free on-chain credit scoring for Ethereum wallets.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-background font-sans text-text antialiased">
        {children}
      </body>
    </html>
  )
}
