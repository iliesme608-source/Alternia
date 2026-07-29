"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AgentChat } from "@/components/shared/AgentChat"
import { Sparkles, Copy, Check, Loader2, ChevronDown, User, FileText, Star, Lightbulb } from "lucide-react"
import type { LinkedInResult } from "@/app/api/linkedin/optimise/route"

// ── Data ──────────────────────────────────────────────────────────────────────

const SECTEURS = [
  "Dev & Tech", "Data & IA", "Finance & Banque", "Conseil & Audit",
  "Marketing & Com", "Commerce & Vente", "RH & Recrutement", "Juridique",
  "Logistique & Supply Chain", "Ingénierie / Industrie", "Luxe & Mode",
  "Immobilier", "Santé",
]

// ── Composant copy button ──────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
      {copied ? "Copié !" : "Copier"}
    </button>
  )
}

// ── Composant résultat section ────────────────────────────────────────────────

function ResultSection({ icon: Icon, label, children, copyText }: { icon: React.ElementType; label: string; children: React.ReactNode; copyText?: string }) {
  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-blue-400" />
          <h3 className="text-sm font-medium text-white">{label}</h3>
        </div>
        {copyText && <CopyBtn text={copyText} />}
      </div>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LinkedInPage() {
  const [titreActuel,  setTitreActuel]  = useState("")
  const [resumeActuel, setResumeActuel] = useState("")
  const [secteur,      setSecteur]      = useState(SECTEURS[0])
  const [poste,        setPoste]        = useState("")
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState<LinkedInResult | null>(null)
  const [error,        setError]        = useState("")

  async function handleGenerate() {
    if (!poste.trim()) return
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/linkedin/optimise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titreActuel, resumeActuel, secteur, poste }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data as LinkedInResult)
    } catch {
      setError("Erreur lors de la génération. Réessaie.")
    }
    setLoading(false)
  }

  const titreChars = (result?.titre ?? "").length

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">

      <div className="mb-8">
        <AgentChat
          agentName="Thomas" agentEmoji="💼" agentTitle="Agent Profil"
          agentDescription="Je transforme ton profil LinkedIn pour que les recruteurs te trouvent avant même que tu postules."
          features={["Titre optimisé avec mots-clés recruteurs", "Résumé 2000 chars accrocheur", "10 compétences à ajouter + 5 conseils"]}
          userMessage="Thomas, optimise mon profil LinkedIn !"
          agentMessage="Je transforme ton profil LinkedIn pour que les recruteurs te trouvent avant même que tu postules 💼"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Inputs ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <div className="surface p-6">
            <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
              <User className="size-4 text-blue-400" />
              Ton profil actuel
            </h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Titre LinkedIn actuel</label>
                <input
                  value={titreActuel}
                  onChange={e => setTitreActuel(e.target.value)}
                  placeholder="ex: Étudiant en BTS SIO | Cherche alternance Dev"
                  className="w-full h-11 px-4 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Résumé / À propos actuel</label>
                <textarea
                  value={resumeActuel}
                  onChange={e => setResumeActuel(e.target.value)}
                  placeholder="Colle ici ton résumé LinkedIn actuel (ou laisse vide si tu n'en as pas)…"
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>
          </div>

          <div className="surface p-6">
            <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
              <Sparkles className="size-4 text-blue-400" />
              Ton objectif
            </h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Secteur visé</label>
                <div className="relative">
                  <select
                    value={secteur}
                    onChange={e => setSecteur(e.target.value)}
                    className="w-full h-11 px-4 pr-10 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] appearance-none focus:border-blue-500/40 focus:outline-none transition-colors"
                  >
                    {SECTEURS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Poste visé *</label>
                <input
                  value={poste}
                  onChange={e => setPoste(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleGenerate()}
                  placeholder="ex: Développeur Full Stack, Data Analyst, Chef de projet…"
                  className="w-full h-11 px-4 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!poste.trim() || loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-blue text-white font-semibold glow-blue-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Thomas optimise ton profil…" : "Optimiser mon profil"}
          </button>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        </div>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <AnimatePresence>
            {!result && !loading && (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center py-20 text-center surface"
              >
                <p className="text-4xl mb-4">💼</p>
                <p className="text-zinc-500 text-sm max-w-xs">Remplis ton profil actuel et ton objectif, puis laisse Thomas générer une version optimisée.</p>
              </motion.div>
            )}

            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-20 surface"
              >
                <Loader2 className="size-8 text-blue-400 animate-spin mb-4" />
                <p className="text-sm text-zinc-500">Thomas analyse et optimise ton profil…</p>
              </motion.div>
            )}

            {result && (
              <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">

                {/* Titre */}
                <ResultSection icon={User} label="Nouveau titre LinkedIn" copyText={result.titre}>
                  <p className="text-sm text-white font-medium leading-relaxed mb-2">{result.titre}</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] ${titreChars > 120 ? "text-red-400" : "text-zinc-600"}`}>{titreChars}/120 caractères</span>
                    {titreActuel && <span className="text-[11px] text-zinc-700 truncate max-w-[60%]">Avant : {titreActuel}</span>}
                  </div>
                </ResultSection>

                {/* Résumé */}
                <ResultSection icon={FileText} label="Nouveau résumé (À propos)" copyText={result.resume}>
                  <p className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto pr-1">{result.resume}</p>
                  <p className="text-[11px] text-zinc-700 mt-2">{result.resume.length} / 2000 chars</p>
                </ResultSection>

                {/* Compétences */}
                <ResultSection icon={Star} label="10 compétences à ajouter">
                  <div className="flex flex-wrap gap-2">
                    {result.competences.map((c, i) => (
                      <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                        {c}
                      </span>
                    ))}
                  </div>
                </ResultSection>

                {/* Conseils */}
                <ResultSection icon={Lightbulb} label="5 conseils de visibilité">
                  <div className="flex flex-col gap-2.5">
                    {result.conseils.map((conseil, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="size-5 rounded-full bg-gradient-blue flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-[13px] text-zinc-400 leading-relaxed">{conseil}</p>
                      </div>
                    ))}
                  </div>
                </ResultSection>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
