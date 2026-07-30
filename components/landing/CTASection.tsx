"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { supabase } from "@/lib/supabase"

export default function CTASection() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setIsLoggedIn(!!session?.user)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <section className="px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="surface px-10 py-16 sm:py-20 text-center"
        >
          <p className="text-zinc-500 text-xs tracking-widest uppercase mb-7">
            Prêt à commencer ?
          </p>

          <h2 className="text-3xl font-semibold tracking-tight leading-tight text-white mb-4">
            Ton alternance commence aujourd&apos;hui.
          </h2>

          <p className="text-zinc-500 text-base leading-relaxed max-w-sm mx-auto mb-10">
            Rejoins des milliers d&apos;étudiants qui avancent chaque jour avec leur équipe IA.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={isLoggedIn ? "/dashboard" : "/register"} className="pill-btn pill-btn-primary w-full sm:w-auto" style={{ height: "40px", paddingLeft: "20px", paddingRight: "20px" }}>
              {isLoggedIn ? "Accéder à mon QG" : "Commencer gratuitement"}
              <ArrowRight className="size-3.5" />
            </Link>
            <a href="#agents" className="pill-btn pill-btn-ghost w-full sm:w-auto" style={{ height: "40px", paddingLeft: "20px", paddingRight: "20px" }}>
              Voir les agents
            </a>
          </div>

          <p className="text-xs text-zinc-600 mt-7">Gratuit · Sans carte bancaire · Prêt en 2 minutes</p>
        </motion.div>
      </div>
    </section>
  )
}
