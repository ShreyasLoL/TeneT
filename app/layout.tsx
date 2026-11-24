import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Stage } from "@/components/stage/Stage";
import { UI } from "@/components/stage/UI";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TENET",
  description: "Nightly ritual and life dashboard.",
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
        <Stage />
        <UI>{children}</UI>
      </body>
    </html>
  );
}
