import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Navbar from "@/components/Navbar"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "Alternia, ton équipe pour décrocher ton alternance",
  description:
    "CV, candidatures, entretiens, prospection : une équipe t'accompagne étape par étape pour décrocher ton alternance.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${inter.variable} dark`}>
      <body className="min-h-screen flex flex-col bg-background font-sans antialiased">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-[#94A3B8]/40 tracking-wide">
          © 2026 Alternia · Ton QG pour l&apos;alternance
        </footer>
      </body>
    </html>
  )
}
