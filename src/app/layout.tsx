import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prop Signal',
  description:
    'Five UK property deals in your area every Monday, chosen because something changed — a reduction, a return to market, a listing gone stale.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
