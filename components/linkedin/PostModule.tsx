"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Eye, Hash, PenLine, Rocket, TrendingUp } from "lucide-react"
import type { PostResult, TypePost } from "@/app/api/linkedin/post/route"
import {
  CopyBtn, EmptyState, ErrorText, Field, GenerateButton, Hint,
  LoadingState, ModuleCard, TextInput, type LinkedInProfil,
} from "./ui"

const TYPES: readonly { value: TypePost; label: string; hint: string }[] = [
  { value: "recherche",     label: "Recherche d'alternance", hint: "ex: rythme 3 semaines / 1 semaine, début septembre" },
  { value: "apprentissage", label: "Partage d'apprentissage", hint: "ex: ce que j'ai compris sur les jointures SQL" },
  { value: "projet",        label: "Retour sur un projet",    hint: "ex: mon appli de gestion de stock en React" },
  { value: "actualite",     label: "Actualité du secteur",    hint: "ex: l'IA générative dans les cabinets d'audit" },
]

/** Assemble le post complet tel qu'il sera collé sur LinkedIn. */
function formatPost(post: PostResult): string {
  return `${post.accroche}\n\n${post.corps}\n\n${post.hashtags.join(" ")}`
}

export function PostModule({ profil }: { profil: LinkedInProfil }) {
  const [typePost, setTypePost] = useState<TypePost>("recherche")
  const [sujet,    setSujet]    = useState("")
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<PostResult | null>(null)
  const [error,    setError]    = useState("")

  const typeActif = TYPES.find(t => t.value === typePost) ?? TYPES[0]

  async function handleGenerate() {
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typePost, sujet,
          prenom: profil.prenom, ecole: profil.ecole, niveau: profil.niveau,
          secteur: profil.secteur, posteVise: profil.posteRecherche,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data as PostResult)
    } catch {
      setError("Erreur lors de la génération. Réessaie.")
    } finally {
      setLoading(false)
    }
  }

  const wordCount = result ? `${result.accroche} ${result.corps}`.trim().split(/\s+/).length : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

      <div className="flex flex-col gap-5">
        <ModuleCard icon={PenLine} title="Ton post">
          <div className="flex flex-col gap-4">
            <Field label="Type de post">
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTypePost(t.value)}
                    className={`px-3 py-2.5 rounded-xl text-[12px] font-medium text-left leading-snug transition-all border ${
                      typePost === t.value
                        ? "bg-blue-500/[0.14] border-blue-500/30 text-blue-300"
                        : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Sujet précis (optionnel)">
              <TextInput value={sujet} onChange={setSujet} placeholder={typeActif.hint} onEnter={handleGenerate} />
            </Field>
          </div>
        </ModuleCard>

        <GenerateButton
          loading={loading}
          disabled={false}
          onClick={handleGenerate}
          idleLabel="Générer mon post"
          loadingLabel="Thomas écrit ton post…"
        />

        <ErrorText message={error} />

        <Hint icon={TrendingUp}>
          Publie 1 à 2 fois par semaine : la régularité fait remonter ton profil dans le fil des
          recruteurs de ton secteur, bien plus que n&apos;importe quelle candidature isolée.
        </Hint>
      </div>

      <div className="flex flex-col gap-5">
        {!result && !loading && (
          <EmptyState
            emoji="✍️"
            text="Choisis un type de post et laisse Thomas rédiger une publication prête à copier."
          />
        )}
        {loading && <LoadingState text="Thomas écrit ton post…" />}

        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">

            <div className="surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Rocket className="size-4 text-blue-400" />
                  <h3 className="text-sm font-medium text-white">{typeActif.label}</h3>
                </div>
                <CopyBtn text={formatPost(result)} />
              </div>

              {/* Accroche : la seule ligne visible avant le « voir plus » */}
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3 mb-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Eye className="size-3 text-blue-400" />
                  <span className="text-[10px] uppercase tracking-widest text-blue-400">Visible avant le « voir plus »</span>
                </div>
                <p className="text-sm text-white font-medium leading-relaxed">{result.accroche}</p>
              </div>

              <p className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-wrap">{result.corps}</p>

              <div className="flex flex-wrap gap-2 mt-4">
                {result.hashtags.map(h => (
                  <span key={h} className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1">
                    <Hash className="size-3" />
                    {h.replace(/^#/, "")}
                  </span>
                ))}
              </div>

              <p className="text-[11px] text-zinc-700 mt-4">{wordCount} mots</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
