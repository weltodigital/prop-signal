import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prop Signal',
  description:
    'Find the sellers who are ready to take less. Five properties in your area every Monday, chosen because something moved, with the numbers already worked out.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
