import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import NavBar from '@/components/NavBar'

const ibmPlexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  subsets: ['latin'],
})

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  variable: '--font-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Finance Tracker',
  description: 'Personal finance tracker for SG bank accounts',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Finance Tracker',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#09090b',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased bg-black text-zinc-100 font-sans`}
      >
        <NavBar />

        {/* Desktop: offset for sidebar. Mobile: offset for bottom nav */}
        <main className="md:ml-56 pb-20 md:pb-4 min-h-screen">
          {children}
        </main>

        {/* Footer with version */}
        <footer className="md:ml-56 pb-20 md:pb-4 px-4 py-3 border-t border-zinc-900 text-[10px] text-zinc-700 text-center">
          Finance Tracker v0.1.0
        </footer>
      </body>
    </html>
  )
}
