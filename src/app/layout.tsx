import './globals.css';
import type { Metadata, Viewport } from 'next';

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Sleep Debt',
  description: 'Personal sleep debt and impairment tracker',
  manifest: `${BP}/manifest.webmanifest`,
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Sleep Debt' },
  icons: {
    icon: `${BP}/icon.svg`,
    apple: `${BP}/icon.svg`,
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-ink safe-pt safe-pb">
        {children}
      </body>
    </html>
  );
}
