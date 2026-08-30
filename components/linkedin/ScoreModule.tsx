"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Gauge, ListChecks, Sparkles } from "lucide-react"
import type { ScoreProfilResult, SousScore } from "@/app/api/linkedin/score/route"
import {
  EmptyState, ErrorText, Field, GenerateButton, Hint,
  LoadingState, ModuleCard, TextInput, type LinkedInProfil,
} from "./ui"

function scoreColor(score: number) {
  if (score >= 80) return "#34D399"
  if (score >= 60) return "#F59E0B"
  return "#F87171"
}

function scoreLabel(score: number) {
  if (score >= 80) return "Excellent"
  if (score >= 60) return "Bon"
  if (score >= 40) return "Moyen"
  return "Faible"
}

/** Cercle animé /100 — même langage visuel que le score ATS du CV Builder. */
function ScoreCircle({ score }: { score: number }) {
  const [counted, setCounted] = useState(0)

  useEffect(() => {
    const DELAY = 300, DURATION = 1400
    const start = Date.now()
    const timer = setTimeout(() => {
      const tick = () => {
        const p = Math.min((Date.now() - (start + DELAY)) / DURATION, 1)
        const eased = 1 - (1 - p) ** 3
        setCounted(Math.round(score * eased))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, DELAY)
    return () => clearTimeout(timer)
  }, [score])

  const r = 72
  const circ = 2 * Math.PI * r
  const pct = Math.min(Math.max(score, 0) / 100, 1)
  const color = scoreColor(score)

  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      <svg width={180} height={180} style={{ position: "absolute", top: 0, left: 0 }}>
        <circle cx={90} cy={90} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
        <motion.circle
          cx={90} cy={90} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: 1.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "90px 90px", rotate: "-90deg" }}
        />
      </svg>
      <div className="flex flex-col items-center z-10">
        <motion.span
          className="text-5xl font-bold" style={{ color }}
          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {counted}
        </motion.span>
        <span className="text-sm text-[#94A3B8] mt-0.5">/100</span>
      </div>
    </div>
  )
}

function SousScoreRow({ sousScore, index }: { sousScore: SousScore; index: number }) {
  const pct = (sousScore.score / 20) * 100
  const color = scoreColor(pct)

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.08 }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-white font-medium">{sousScore.label}</span>
        <span className="text-[13px] font-semibold shrink-0" style={{ color }}>
          {sousScore.score}<span className="text-zinc-600 font-normal"> / 20</span>
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: 0.4 + index * 0.08, ease: "easeOut" }}
          style={{ background: color }}
        />
      </div>

      <div className="flex gap-2">
        <Sparkles className="size-3 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-zinc-500 leading-relaxed">{sousScore.action}</p>
      </div>
    </motion.div>
  )
}

export function ScoreModule({ profil }: { profil: LinkedInProfil }) {
  const [titre,       setTitre]       = useState("")
  const [resume,      setResume]      = useState("")
  const [competences, setCompetences] = useState("")
  const [posteVise,   setPosteVise]   = useState(profil.posteRecherche)
  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState<ScoreProfilResult | null>(null)
  const [error,       setError]       = useState("")

  const ready = titre.trim().length > 0 || resume.trim().length > 0

  async function handleAnalyse() {
    if (!ready) return
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/linkedin/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre, resume, competences,
          posteVise: posteVise || profil.posteRecherche,
          secteur: profil.secteur,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data as ScoreProfilResult)
    } catch {
      setError("Erreur lors de l'analyse. Réessaie.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

      <div className="flex flex-col gap-5">
        <ModuleCard icon={Gauge} title="Ton profil à auditer">
          <div className="flex flex-col gap-4">
            <Field label="Titre LinkedIn">
              <TextInput value={titre} onChange={setTitre} placeholder="ex: Étudiant en BTS SIO | Cherche alternance Dev" />
            </Field>

            <Field label="Résumé / À propos">
              <textarea
                value={resume}
                onChange={e => setResume(e.target.value)}
                placeholder="Colle ici ton résumé LinkedIn…"
                rows={5}
                className="w-full px-4 py-3 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors resize-none"
              />
            </Field>

            <Field label="Compétences (séparées par des virgules)">
              <textarea
                value={competences}
                onChange={e => setCompetences(e.target.value)}
                placeholder="ex: Python, SQL, Power BI, Gestion de projet…"
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors resize-none"
              />
            </Field>

            <Field label="Poste visé">
              <TextInput value={posteVise} onChange={setPosteVise} placeholder="ex: Data Analyst" onEnter={handleAnalyse} />
            </Field>
          </div>
        </ModuleCard>

        <GenerateButton
          loading={loading}
          disabled={!ready}
          onClick={handleAnalyse}
          idleLabel="Analyser mon profil"
          loadingLabel="Thomas audite ton profil…"
        />

        <ErrorText message={error} />

        <Hint icon={ListChecks}>
          Chaque sous-score est noté sur 20. Traite les axes les plus bas en premier : ce sont eux
          qui te font perdre le plus de visibilité dans les recherches recruteurs.
        </Hint>
      </div>

      <div className="flex flex-col gap-5">
        {!result && !loading && (
          <EmptyState
            emoji="📊"
            text="Colle ton titre, ton résumé et tes compétences : Thomas note ton profil sur 100 et te donne 5 actions."
          />
        )}
        {loading && <LoadingState text="Thomas audite ton profil…" />}

        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">

            <div className="surface p-6 flex flex-col items-center">
              <ScoreCircle key={result.score_global} score={result.score_global} />
              <p className="text-sm font-medium mt-3" style={{ color: scoreColor(result.score_global) }}>
                {scoreLabel(result.score_global)}
              </p>
              <p className="text-[11px] text-zinc-600 mt-1">Score de profil LinkedIn</p>
            </div>

            <div className="surface p-5 flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-blue-400" />
                <h3 className="text-sm font-medium text-white">Le détail, axe par axe</h3>
              </div>
              {result.sous_scores.map((s, i) => (
                <SousScoreRow key={s.label} sousScore={s} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
