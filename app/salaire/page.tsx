"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AgentChat } from "@/components/shared/AgentChat"
import { TrendingUp, Info, Loader2, ChevronDown } from "lucide-react"

// ── Barème 2026 ────────────────────────────────────────────────────────────────

const SMIC_2026 = 1844 // brut mensuel estimé 2026

function calcSalaireLegal(age: number, annee: number): number {
  if (age >= 26) return SMIC_2026 * 1.0 // salaire conventionnel = 100% SMIC mini
  if (annee === 1) return age < 18 ? SMIC_2026 * 0.27 : SMIC_2026 * 0.39
  if (annee === 2) return SMIC_2026 * 0.51
  return SMIC_2026 * 0.67 // annee 3
}

const NET_RATIO = 0.78 // cotisations salariales ≈ 22%

// ── Fourchettes marché ────────────────────────────────────────────────────────

const SECTEURS = [
  "Dev & Tech", "Data & IA", "Finance & Banque", "Conseil & Audit",
  "Marketing & Com", "Commerce & Vente", "RH & Recrutement", "Juridique",
  "Logistique & Supply Chain", "Ingénierie / Industrie", "Luxe & Mode",
  "Immobilier", "Santé",
]

const MARCHE: Record<string, { min: number; max: number }> = {
  "Dev & Tech":                  { min: 800, max: 1200 },
  "Data & IA":                   { min: 850, max: 1250 },
  "Finance & Banque":            { min: 900, max: 1400 },
  "Conseil & Audit":             { min: 850, max: 1300 },
  "Marketing & Com":             { min: 700, max: 1100 },
  "Commerce & Vente":            { min: 700, max: 1000 },
  "RH & Recrutement":            { min: 700, max: 1050 },
  "Juridique":                   { min: 750, max: 1100 },
  "Logistique & Supply Chain":   { min: 700, max: 950  },
  "Ingénierie / Industrie":      { min: 800, max: 1200 },
  "Luxe & Mode":                 { min: 750, max: 1050 },
  "Immobilier":                  { min: 750, max: 1150 },
  "Santé":                       { min: 800, max: 1100 },
}

const NIVEAUX   = ["BTS / BTS en alternance", "BUT (Bac+3)", "Bachelor / Licence Pro", "Master 1 (Bac+4)", "Master 2 / MBA", "École d'ingénieur"]
const REGIONS   = ["Paris / Île-de-France", "Lyon / Rhône-Alpes", "Marseille / PACA", "Bordeaux / Nouvelle-Aquitaine", "Toulouse / Occitanie", "Lille / Hauts-de-France", "Nantes / Pays de la Loire", "Strasbourg / Grand Est", "Rennes / Bretagne", "Autre région"]

// ── Composant barre animée ─────────────────────────────────────────────────────

function AnimBar({ label, value, max, color, subtitle }: { label: string; value: number; max: number; color: string; subtitle?: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm text-zinc-400">{label}</span>
        <div className="text-right">
          <span className="text-base font-semibold text-white">{Math.round(value).toLocaleString("fr-FR")} €</span>
          {subtitle && <span className="text-[11px] text-zinc-600 ml-1.5">{subtitle}</span>}
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalairePage() {
  const [age,     setAge]     = useState(21)
  const [annee,   setAnnee]   = useState(1)
  const [niveau,  setNiveau]  = useState(NIVEAUX[0])
  const [secteur, setSecteur] = useState(SECTEURS[0])
  const [region,  setRegion]  = useState(REGIONS[0])

  const [conseil,     setConseil]     = useState("")
  const [loadConseil, setLoadConseil] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const salaireMini = calcSalaireLegal(age, annee)
  const marche      = MARCHE[secteur] ?? { min: 750, max: 1100 }
  const miniNet     = Math.round(salaireMini * NET_RATIO)
  const marcheMinNet = Math.round(marche.min * NET_RATIO)
  const marcheMaxNet = Math.round(marche.max * NET_RATIO)
  const barMax       = Math.max(marche.max, salaireMini) * 1.1

  async function fetchConseil() {
    setLoadConseil(true)
    setConseil("")
    try {
      const res = await fetch("/api/salaire/conseil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secteur, region, niveau, annee, salaireMini, marcheMin: marche.min, marcheMax: marche.max }),
      })
      const data = await res.json()
      setConseil(data.conseil ?? "")
    } catch { /* silent */ }
    setLoadConseil(false)
  }

  // Rafraîchir le conseil quand les paramètres changent (avec debounce)
  useEffect(() => {
    const t = setTimeout(fetchConseil, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secteur, region, niveau, annee, age])

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">

      <div className="mb-8">
        <AgentChat
          agentName="Nora" agentEmoji="💰" agentTitle="Agent Rémunération"
          agentDescription="Je calcule ton salaire légal et te compare au marché pour que tu négocies au mieux."
          features={["Barème 2026 à jour", "Fourchettes marché par secteur", "Conseils de négociation"]}
          userMessage="Nora, combien dois-je gagner ?"
          agentMessage="Je calcule ton salaire légal et te compare au marché pour que tu négocies au mieux 💰"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Formulaire ─────────────────────────────────────────────────── */}
        <div className="surface p-6">
          <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
            <TrendingUp className="size-4 text-blue-400" />
            Ton profil
          </h2>

          {/* Âge */}
          <div className="mb-5">
            <div className="flex justify-between mb-2">
              <label className="text-sm text-zinc-400">Ton âge</label>
              <span className="text-sm font-medium text-white">{age} ans</span>
            </div>
            <input
              type="range" min={16} max={30} value={age}
              onChange={e => setAge(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-white/10 accent-blue-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-700 mt-1">
              <span>16 ans</span><span>30 ans</span>
            </div>
          </div>

          {/* Année du cycle */}
          <div className="mb-5">
            <label className="text-sm text-zinc-400 mb-2 block">Année du cycle d&apos;alternance</label>
            <div className="flex gap-2">
              {[1, 2, 3].map(a => (
                <button
                  key={a}
                  onClick={() => setAnnee(a)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    annee === a
                      ? "bg-gradient-blue text-white glow-blue-sm"
                      : "border border-white/[0.08] text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  {a === 1 ? "1ère" : `${a}ème`}
                </button>
              ))}
            </div>
          </div>

          {/* Niveau */}
          <div className="mb-5">
            <label className="text-sm text-zinc-400 mb-2 block">Niveau de formation</label>
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
          </div>

          {/* Secteur */}
          <div className="mb-5">
            <label className="text-sm text-zinc-400 mb-2 block">Secteur d&apos;activité</label>
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

          {/* Région */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Région</label>
            <div className="relative">
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full h-11 px-4 pr-10 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] appearance-none focus:border-blue-500/40 focus:outline-none transition-colors"
              >
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* ── Résultats ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">

          {/* Salaire légal */}
          <div className="surface p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-white font-semibold">Salaire légal minimum</h2>
              <button onClick={() => setShowDetails(!showDetails)} className="text-[11px] text-zinc-600 hover:text-zinc-400 flex items-center gap-1">
                <Info className="size-3" /> Barème
              </button>
            </div>
            <p className="text-[11px] text-zinc-600 mb-5">
              Basé sur SMIC 2026 estimé ({SMIC_2026.toLocaleString("fr-FR")} €), {age >= 26 ? "≥ 26 ans" : age < 18 ? "< 18 ans" : "18-25 ans"}, {annee === 1 ? "1ère" : `${annee}ème`} année
            </p>

            <div className="flex gap-4 mb-6">
              <div className="flex-1 rounded-xl p-4 text-center" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)" }}>
                <p className="text-[11px] text-zinc-500 mb-1">Brut mensuel</p>
                <p className="text-2xl font-bold text-white">{Math.round(salaireMini).toLocaleString("fr-FR")} €</p>
              </div>
              <div className="flex-1 rounded-xl p-4 text-center" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.16)" }}>
                <p className="text-[11px] text-zinc-500 mb-1">Net mensuel</p>
                <p className="text-2xl font-bold text-emerald-400">{miniNet.toLocaleString("fr-FR")} €</p>
              </div>
            </div>

            <AnimatePresence>
              {showDetails && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="rounded-xl p-4 mb-1 text-[11px] leading-relaxed text-zinc-500" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="font-medium text-zinc-400 mb-2">Barème apprentissage 2026</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span>1ère année &lt;18 ans</span><span className="text-blue-400 font-mono">27 % SMIC</span>
                      <span>1ère année 18-25 ans</span><span className="text-blue-400 font-mono">39 % SMIC</span>
                      <span>1ère année ≥26 ans</span><span className="text-blue-400 font-mono">100 % SMIC</span>
                      <span>2ème année</span><span className="text-blue-400 font-mono">51 % SMIC</span>
                      <span>3ème année</span><span className="text-blue-400 font-mono">67 % SMIC</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Comparaison marché */}
          <div className="surface p-6">
            <h2 className="text-white font-semibold mb-1">Fourchette marché</h2>
            <p className="text-[11px] text-zinc-600 mb-5">{secteur} · {region}</p>

            <AnimBar label="Salaire légal minimum" value={salaireMini} max={barMax} color="rgba(59,130,246,0.7)" subtitle={`≈ ${miniNet} € net`} />
            <AnimBar label="Marché bas de gamme"   value={marche.min}  max={barMax} color="rgba(234,179,8,0.7)"  subtitle={`≈ ${marcheMinNet} € net`} />
            <AnimBar label="Marché haut de gamme"  value={marche.max}  max={barMax} color="rgba(34,197,94,0.8)"  subtitle={`≈ ${marcheMaxNet} € net`} />

            <div className="mt-4 rounded-xl p-3 text-[11px] leading-relaxed" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {salaireMini >= marche.max ? (
                <span className="text-emerald-400">Ton minimum légal est compétitif dans ce secteur.</span>
              ) : salaireMini >= marche.min ? (
                <span className="text-yellow-400">Ton minimum légal est dans la fourchette marché. Négocie pour viser le haut.</span>
              ) : (
                <span className="text-blue-400">Le marché propose <strong>{Math.round(marche.min - salaireMini).toLocaleString("fr-FR")} €</strong> de plus que le minimum légal. N&apos;hésite pas à négocier.</span>
              )}
            </div>
          </div>

          {/* Conseil Nora */}
          <div className="surface p-6 min-h-[100px]">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-6 rounded-full flex items-center justify-center text-[13px]" style={{ background: "rgba(167,139,250,0.15)" }}>💜</div>
              <span className="text-sm font-medium text-violet-300">Conseil de Nora</span>
              {loadConseil && <Loader2 className="size-3.5 text-zinc-600 animate-spin ml-auto" />}
            </div>
            <AnimatePresence mode="wait">
              {conseil ? (
                <motion.p key={conseil} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-zinc-400 leading-relaxed">
                  {conseil}
                </motion.p>
              ) : !loadConseil ? (
                <p className="text-sm text-zinc-700">Modifie un paramètre pour obtenir un conseil personnalisé…</p>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
