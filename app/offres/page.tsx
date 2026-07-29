"use client"

import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AgentChat } from "@/components/shared/AgentChat"
import { Search, MapPin, Briefcase, Calendar, ExternalLink, PlusCircle, ChevronDown, Loader2, Check } from "lucide-react"
import type { Offre } from "@/app/api/offres/route"

// ── Constants ──────────────────────────────────────────────────────────────────

const SECTEURS = [
  "Tous", "Dev & Tech", "Data & IA", "Finance & Banque", "Conseil & Audit",
  "Marketing & Com", "Commerce & Vente", "RH & Recrutement", "Juridique",
  "Logistique & Supply Chain", "Ingénierie / Industrie", "Luxe & Mode",
  "Immobilier", "Santé",
]

const NIVEAUX = ["Tous", "BTS / BTS en alternance", "BUT (Bac+3)", "Bachelor / Licence Pro", "Master 1 (Bac+4)", "Master 2 / MBA", "École d'ingénieur"]

const TYPE_LABELS: Record<string, string> = {
  "tous": "Tous types",
  "E1":   "Apprentissage",
  "E2":   "Professionnalisation",
}

const LS_KEY = "alternia-candidatures-v2"

function addToKanban(offre: Offre): boolean {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const cards = raw ? JSON.parse(raw) : []
    const id = `offre-${offre.id}`
    if (cards.find((c: { id: string }) => c.id === id)) return false
    cards.push({
      id,
      entreprise: offre.entreprise,
      poste: offre.titre,
      dateContact: new Date().toISOString(),
      colonne: "a_prospecter",
      source: "manuel",
    })
    localStorage.setItem(LS_KEY, JSON.stringify(cards))
    return true
  } catch { return false }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

// ── Composant carte offre ──────────────────────────────────────────────────────

function OffreCard({ offre }: { offre: Offre }) {
  const [added, setAdded] = useState(false)

  function handleAdd() {
    const ok = addToKanban(offre)
    if (ok) { setAdded(true); setTimeout(() => setAdded(false), 3000) }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="surface p-5 flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{offre.titre}</p>
          <p className="text-sm text-blue-400 mt-0.5">{offre.entreprise}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
          offre.type === "E1"
            ? "bg-blue-500/15 text-blue-400 border border-blue-500/25"
            : "bg-violet-500/15 text-violet-400 border border-violet-500/25"
        }`}>
          {TYPE_LABELS[offre.type]}
        </span>
      </div>

      {/* Méta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1"><MapPin className="size-3" />{offre.lieu}</span>
        <span className="flex items-center gap-1"><Briefcase className="size-3" />{offre.niveau}</span>
        <span className="flex items-center gap-1"><Calendar className="size-3" />{fmtDate(offre.datePublication)}</span>
      </div>

      {/* Salaire */}
      {offre.salaire && (
        <p className="text-[12px] font-medium text-emerald-400">{offre.salaire}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <a
          href={offre.lienPostuler}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-blue text-white text-xs font-semibold hover:opacity-90 transition-opacity glow-blue-sm"
        >
          <ExternalLink className="size-3" />
          Postuler
        </a>
        <button
          onClick={handleAdd}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all border ${
            added
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              : "border-white/[0.08] text-zinc-400 hover:bg-white/5"
          }`}
        >
          {added ? <Check className="size-3" /> : <PlusCircle className="size-3" />}
          {added ? "Ajouté !" : "Kanban"}
        </button>
      </div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OffresPage() {
  const [secteur, setSecteur] = useState("Tous")
  const [region,  setRegion]  = useState("")
  const [niveau,  setNiveau]  = useState("Tous")
  const [type,    setType]    = useState("tous")

  const [offres,   setOffres]   = useState<Offre[]>([])
  const [loading,  setLoading]  = useState(false)
  const [searched, setSearched] = useState(false)
  const [source,   setSource]   = useState<"api" | "static" | "">("")

  const search = useCallback(async () => {
    setLoading(true)
    setSearched(false)
    try {
      const params = new URLSearchParams()
      if (secteur !== "Tous") params.set("secteur", secteur)
      if (region.trim())      params.set("region",  region.trim())
      if (niveau !== "Tous")  params.set("niveau",  niveau)
      if (type !== "tous")    params.set("type",    type)

      const res  = await fetch(`/api/offres?${params}`)
      const data = await res.json()
      setOffres(data.offres ?? [])
      setSource(data.source ?? "")
    } catch { setOffres([]) }
    setLoading(false)
    setSearched(true)
  }, [secteur, region, niveau, type])

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">

      <div className="mb-8">
        <AgentChat
          agentName="Sarah" agentEmoji="🔍" agentTitle="Agent Veille"
          agentDescription="Je cherche les meilleures offres d'alternance et je t'aide à postuler rapidement."
          features={["Offres en temps réel (France Travail)", "Filtres par secteur et région", "Ajout direct au Kanban"]}
          userMessage="Sarah, trouve-moi des offres en Dev à Paris !"
          agentMessage="Je cherche les meilleures offres d'alternance et je t'aide à postuler rapidement 🔍"
        />
      </div>

      {/* Filtres */}
      <div className="surface p-5 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">

          {/* Secteur */}
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

          {/* Région */}
          <input
            value={region}
            onChange={e => setRegion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Région (ex : Paris, Lyon…)"
            className="h-11 px-4 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors"
          />

          {/* Niveau */}
          <div className="relative">
            <select
              value={niveau}
              onChange={e => setNiveau(e.target.value)}
              className="w-full h-11 px-4 pr-10 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] appearance-none focus:border-blue-500/40 focus:outline-none transition-colors"
            >
              {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
          </div>

          {/* Type contrat */}
          <div className="relative">
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full h-11 px-4 pr-10 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] appearance-none focus:border-blue-500/40 focus:outline-none transition-colors"
            >
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
          </div>
        </div>

        <button
          onClick={search}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-blue text-white font-semibold glow-blue-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {loading ? "Recherche en cours…" : "Rechercher des offres"}
        </button>
      </div>

      {/* Résultats */}
      <AnimatePresence mode="wait">
        {!searched && !loading && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-zinc-500 text-sm">Lance une recherche pour découvrir des offres d&apos;alternance</p>
          </motion.div>
        )}

        {searched && offres.length === 0 && !loading && (
          <motion.div key="noresult" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
            <p className="text-4xl mb-4">😔</p>
            <p className="text-zinc-500 text-sm">Aucune offre trouvée pour ces critères. Essaie avec des filtres plus larges.</p>
          </motion.div>
        )}

        {searched && offres.length > 0 && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-400">
                <span className="text-white font-medium">{offres.length}</span> offre{offres.length !== 1 ? "s" : ""} trouvée{offres.length !== 1 ? "s" : ""}
              </p>
              {source === "static" && (
                <p className="text-[11px] text-zinc-600">Données de démonstration · Intégration France Travail disponible</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {offres.map(offre => <OffreCard key={offre.id} offre={offre} />)}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
