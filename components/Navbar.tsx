"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { Menu, X, LogOut, Settings, ChevronDown } from "lucide-react"
import type { Session } from "@supabase/supabase-js"

const navLinks = [
  { href: "/dashboard", label: "QG" },
  { href: "/autopilot", label: "Autopilot" },
  { href: "/veille", label: "Veille" },
  { href: "/entretien", label: "Entretien" },
  { href: "/cv", label: "CV" },
  { href: "/prospection", label: "Prospection" },
]

const moreLinks = [
  { href: "/autopilot/suivi", label: "Suivi",   emoji: "📮" },
  { href: "/candidatures", label: "Candidatures", emoji: "📅" },
  { href: "/offres",       label: "Offres",        emoji: "🔍" },
  { href: "/salaire",      label: "Salaire",       emoji: "💰" },
  { href: "/cerfa",        label: "CERFA",         emoji: "📋" },
  { href: "/linkedin",     label: "LinkedIn",      emoji: "💼" },
  { href: "/tests",        label: "Tests",         emoji: "🧪" },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open,      setOpen]      = useState(false)
  const [showMore,  setShowMore]  = useState(false)
  const [session,   setSession]   = useState<Session | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    setOpen(false)
    router.push("/")
  }

  const prenom = session?.user?.user_metadata?.prenom as string | undefined
  const isMoreActive = moreLinks.some(l => pathname.startsWith(l.href))

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#080D1A]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl w-full items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-6 items-center justify-center rounded-md bg-gradient-blue">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M7 2 L11 7 L7 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 2 L3 7 L7 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
            </svg>
          </div>
          <span className="font-semibold text-white text-sm tracking-tight">AlternaAI</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3.5 py-1.5 rounded-md text-sm transition-colors duration-150",
                pathname === link.href
                  ? "text-blue-400 bg-blue-500/10 border border-blue-500/20"
                  : "text-zinc-400 hover:text-white border border-transparent"
              )}
            >
              {link.label}
            </Link>
          ))}

          {/* Dropdown "Outils" */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setShowMore(v => !v)}
              className={cn(
                "flex items-center gap-1 px-3.5 py-1.5 rounded-md text-sm transition-colors duration-150",
                isMoreActive || showMore
                  ? "text-blue-400 bg-blue-500/10 border border-blue-500/20"
                  : "text-zinc-400 hover:text-white border border-transparent"
              )}
            >
              Outils
              <ChevronDown className={cn("size-3.5 transition-transform duration-150", showMore && "rotate-180")} />
            </button>

            {showMore && (
              <div className="absolute top-full left-0 mt-1.5 w-48 rounded-xl border border-white/[0.08] bg-[#0C1221]/95 backdrop-blur-xl p-1.5 shadow-2xl z-50">
                {moreLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                      pathname.startsWith(link.href)
                        ? "text-blue-400 bg-blue-500/10"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <span className="text-base leading-none">{link.emoji}</span>
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Auth desktop */}
        <div className="hidden md:flex items-center gap-2">
          {session ? (
            <>
              <Link
                href="/profil"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors duration-150",
                  pathname === "/profil"
                    ? "text-blue-400 bg-blue-500/10 border border-blue-500/20"
                    : "text-zinc-400 hover:text-white border border-transparent"
                )}
              >
                <Settings className="size-3.5" />
                <span className="max-w-[90px] truncate">{prenom ?? "Profil"}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white transition-colors duration-150"
              >
                <LogOut className="size-3.5" />
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white transition-colors duration-150"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="pill-btn pill-btn-primary"
                style={{ height: "32px", paddingLeft: "14px", paddingRight: "14px", fontSize: "0.8125rem" }}
              >
                Commencer
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-1.5 rounded-md text-zinc-400 hover:text-white transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-white/[0.06] px-4 py-3 flex flex-col gap-0.5 bg-[#080D1A]">
          {[...navLinks, ...moreLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "px-3 py-2.5 rounded-md text-sm transition-colors",
                pathname === link.href
                  ? "text-blue-400 bg-blue-500/10 border border-blue-500/20"
                  : "text-zinc-400 hover:text-white border border-transparent"
              )}
            >
              {"emoji" in link && <span className="mr-2">{(link as { emoji: string }).emoji}</span>}{link.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-3 border-t border-white/[0.06] mt-1">
            {session ? (
              <>
                <Link
                  href="/profil"
                  onClick={() => setOpen(false)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm border border-white/10 text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  <Settings className="size-3.5" />
                  {prenom ?? "Profil"}
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm border border-white/10 text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  <LogOut className="size-3.5" />
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2 rounded-xl text-sm text-center border border-white/10 text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  Connexion
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2 rounded-xl text-sm text-center font-semibold bg-gradient-blue text-white glow-blue-sm hover:opacity-90 transition-opacity"
                >
                  Commencer
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
