import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { Nav } from '@/components/chrome/Nav';
import { Stage } from '@/components/stage/Stage';
import { UI } from '@/components/stage/UI';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'TENET',
  description: 'A nightly ritual disguised as an observatory.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-dvh bg-[var(--bg)] text-[var(--text)] selection:bg-[var(--accent-abyss)] selection:text-[var(--text)]">
        <Providers>
          <Stage />
          <UI>
            <Suspense fallback={<div className="min-h-14 border-b border-line/80" />}>
              <Nav />
            </Suspense>
            {children}
          </UI>
        </Providers>
      </body>
    </html>
  );
}
