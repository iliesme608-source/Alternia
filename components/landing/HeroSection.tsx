"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import QGPreview from "@/components/landing/QGPreview"
import { supabase } from "@/lib/supabase"

export default function HeroSection() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setIsLoggedIn(!!session?.user)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
      <div className="mx-auto max-w-6xl w-full">
        <div className="flex flex-row items-center gap-16">

          {/* Left — text */}
          <div className="flex-1 text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1 text-xs text-zinc-500 mb-10"
            >
              <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
              6 agents disponibles
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl font-semibold tracking-tight leading-[1.08] text-white mb-6"
            >
              Ton équipe pour<br />décrocher ton{" "}
              <span className="text-zinc-400">alternance.</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18 }}
              className="text-base text-zinc-500 leading-relaxed max-w-md mb-10"
            >
              CV, candidatures, entretiens, prospection : avance chaque jour avec une équipe qui t&apos;accompagne étape par étape.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28 }}
              className="flex flex-row items-center justify-start gap-3"
            >
              <Link href={isLoggedIn ? "/dashboard" : "/register"} className="pill-btn pill-btn-primary" style={{ height: "40px", paddingLeft: "20px", paddingRight: "20px" }}>
                {isLoggedIn ? "Accéder à mon QG" : "Commencer gratuitement"}
                <ArrowRight className="size-3.5" />
              </Link>
              <a href="#agents" className="pill-btn pill-btn-ghost" style={{ height: "40px", paddingLeft: "20px", paddingRight: "20px" }}>
                Découvrir les agents
              </a>
            </motion.div>

            {/* Social proof */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-xs text-zinc-600 mt-7"
            >
              Gratuit pour commencer · Sans carte bancaire
            </motion.p>
          </div>

          {/* Right — QG preview */}
          <div className="w-[460px] flex-shrink-0 hidden lg:block">
            <QGPreview />
          </div>
        </div>
      </div>
    </section>
  )
}
