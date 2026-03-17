import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { ThemeProvider } from '@/contexts/ThemeContext'

// Inter variable font — loaded locally by Next.js (zero CLS, no flash)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FinDash – Personal Finance Dashboard',
  description: 'Track your investments, crypto, and bank accounts in one place.',
  robots: 'noindex, nofollow',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${inter.variable}`} data-theme="deep">
      <body className="text-slate-100 min-h-screen">
        <ThemeProvider>
          <Sidebar />
          {/* Main content area
              lg+  : offset right by sidebar width (pl-60)
              <lg  : full-width, offset down by mobile top bar (pt-14) */}
          <div className="lg:pl-60 pt-14 lg:pt-0 min-h-screen">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
