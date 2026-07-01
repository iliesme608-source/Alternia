"use client"

import { motion } from "framer-motion"
import FadeIn from "@/components/animations/FadeIn"
import { Zap, Star, Flame, Award } from "lucide-react"

const levels = [
  { num: 1, name: "Nouveau candidat",     xp: "0 XP" },
  { num: 2, name: "Candidat motivé",      xp: "200 XP" },
  { num: 3, name: "Chasseur d'alternance", xp: "500 XP" },
  { num: 4, name: "Profil attractif",     xp: "1 000 XP" },
  { num: 5, name: "Alternant prêt",       xp: "2 000 XP" },
  { num: 6, name: "Alternant recruté",    xp: "4 000 XP" },
]

const badges = [
  { icon: Star,  label: "Premier CV optimisé" },
  { icon: Zap,   label: "10 candidatures envoyées" },
  { icon: Award, label: "Premier entretien simulé" },
  { icon: Flame, label: "7 jours de suite" },
]

export default function GamificationSection() {
  return (
    <section className="px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <p className="text-zinc-500 text-xs tracking-widest uppercase text-center mb-4">
            Progression
          </p>
        </FadeIn>

        <FadeIn delay={0.05}>
          <h2 className="text-3xl font-semibold tracking-tight leading-tight text-white text-center mb-4">
            Chaque action compte.
          </h2>
          <p className="text-zinc-500 text-base leading-relaxed text-center max-w-md mx-auto mb-12">
            Gagne de l'XP, monte en niveau, débloque des badges. La recherche d'alternance devient un jeu que tu gagnes.
          </p>
        </FadeIn>

        <div className="grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto">
          {/* Levels */}
          <FadeIn delay={0.1}>
            <div className="surface p-5">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-4">Niveaux</p>
              <div className="space-y-2.5">
                {levels.map((lvl, i) => (
                  <motion.div
                    key={lvl.num}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.05 * i, duration: 0.35 }}
                    className="flex items-center gap-3"
                  >
                    <div className="shrink-0 flex size-5 items-center justify-center rounded border border-white/[0.06] bg-white/[0.03]">
                      <span className="text-[10px] font-medium text-zinc-500">{lvl.num}</span>
                    </div>
                    <span className="text-sm text-zinc-300 flex-1">{lvl.name}</span>
                    <span className="text-[11px] text-zinc-600">{lvl.xp}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Badges + XP info */}
          <div className="space-y-3">
            <FadeIn delay={0.15}>
              <div className="surface p-5">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-4">Badges</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {badges.map((b) => (
                    <div
                      key={b.label}
                      className="flex flex-col items-center gap-2 rounded-lg p-3 text-center border border-white/[0.06] bg-white/[0.02]"
                    >
                      <div className="flex size-8 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03]">
                        <b.icon className="size-3.5 text-zinc-400" />
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-snug">{b.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={0.2}>
              <div className="surface p-5 flex items-start gap-3">
                <Zap className="size-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white mb-1">Comment gagner des XP ?</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Optimise un CV (+80 XP), envoie des candidatures (+40 XP), fais un entretien simulé (+150 XP), relance un recruteur (+60 XP).
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  )
}
