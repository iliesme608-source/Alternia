"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Gauge, Loader2, PenLine, Search, User, Users } from "lucide-react"
import { AgentChat } from "@/components/shared/AgentChat"
import { AlumniModule } from "@/components/linkedin/AlumniModule"
import { ConnexionModule } from "@/components/linkedin/ConnexionModule"
import { OptimisationModule } from "@/components/linkedin/OptimisationModule"
import { PostModule } from "@/components/linkedin/PostModule"
import { ScoreModule } from "@/components/linkedin/ScoreModule"
import { EMPTY_PROFIL, type LinkedInProfil } from "@/components/linkedin/ui"
import { supabase } from "@/lib/supabase"

// ── Modules ───────────────────────────────────────────────────────────────────

type ModuleKey = "profil" | "alumni" | "connexion" | "post" | "score"

const MODULES: readonly { key: ModuleKey; label: string; icon: React.ElementType }[] = [
  { key: "profil",    label: "Profil",     icon: User },
  { key: "alumni",    label: "Alumni",     icon: Search },
  { key: "connexion", label: "Connexion",  icon: Users },
  { key: "post",      label: "Posts",      icon: PenLine },
  { key: "score",     label: "Score",      icon: Gauge },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LinkedInPage() {
  const [module, setModule] = useState<ModuleKey>("profil")
  const [profil, setProfil] = useState<LinkedInProfil>(EMPTY_PROFIL)
  // Les modules pré-remplissent leurs champs depuis le profil : on attend qu'il
  // soit chargé avant de les monter.
  const [profilLoaded, setProfilLoaded] = useState(false)

  // École, secteur et poste visé alimentent les recherches alumni et les prompts.
  useEffect(() => {
    let cancelled = false

    async function loadProfil() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data } = await supabase
          .from("profiles")
          .select("prenom, ecole, niveau, secteur, region, poste_recherche")
          .eq("id", session.user.id)
          .single()

        if (cancelled || !data) return
        setProfil({
          prenom:         data.prenom ?? "",
          ecole:          data.ecole ?? "",
          niveau:         data.niveau ?? "",
          secteur:        data.secteur ?? "",
          region:         data.region ?? "",
          posteRecherche: data.poste_recherche ?? "",
        })
      } finally {
        if (!cancelled) setProfilLoaded(true)
      }
    }

    loadProfil()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">

      <div className="mb-8">
        <AgentChat
          agentName="Thomas" agentEmoji="💼" agentTitle="Agent Profil"
          agentDescription="Je transforme ton profil LinkedIn pour que les recruteurs te trouvent avant même que tu postules."
          features={["Titre optimisé avec mots-clés recruteurs", "Alumni, recruteurs et managers à contacter", "Messages, posts et score de profil sur 100"]}
          userMessage="Thomas, optimise mon profil LinkedIn !"
          agentMessage="Je transforme ton profil LinkedIn pour que les recruteurs te trouvent avant même que tu postules 💼"
        />
      </div>

      {/* ── Navigation modules ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {MODULES.map(({ key, label, icon: Icon }) => {
          const active = module === key
          return (
            <button
              key={key}
              onClick={() => setModule(key)}
              className={`pill-btn text-sm transition-all duration-200 ${active ? "pill-btn-active" : "pill-btn-ghost"}`}
              style={active ? {
                background: "rgba(59,130,246,0.14)",
                borderColor: "rgba(59,130,246,0.30)",
                color: "#93C5FD",
              } : undefined}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Modules ────────────────────────────────────────────────────────
          Tous montés en permanence : passer d'un onglet à l'autre ne fait
          perdre ni les saisies ni les résultats déjà générés. */}
      {profilLoaded ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className={module === "profil" ? "" : "hidden"}><OptimisationModule profil={profil} /></div>
          <div className={module === "alumni" ? "" : "hidden"}><AlumniModule       profil={profil} /></div>
          <div className={module === "connexion" ? "" : "hidden"}><ConnexionModule profil={profil} /></div>
          <div className={module === "post" ? "" : "hidden"}><PostModule           profil={profil} /></div>
          <div className={module === "score" ? "" : "hidden"}><ScoreModule         profil={profil} /></div>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 surface">
          <Loader2 className="size-8 text-blue-400 animate-spin mb-4" />
          <p className="text-sm text-zinc-500">Chargement de ton profil…</p>
        </div>
      )}
    </div>
  )
}
