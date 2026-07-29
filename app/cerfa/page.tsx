"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AgentChat } from "@/components/shared/AgentChat"
import { ChevronRight, ChevronLeft, ExternalLink, Phone, Check, Loader2 } from "lucide-react"

// ── OPCO data ──────────────────────────────────────────────────────────────────

const SECTEURS = [
  { id: "Tech / Numérique",           emoji: "💻", label: "Tech / Numérique" },
  { id: "Commerce / Distribution",    emoji: "🛒", label: "Commerce / Distribution" },
  { id: "Finance / Banque",           emoji: "🏦", label: "Finance / Banque" },
  { id: "Industrie",                  emoji: "🏭", label: "Industrie" },
  { id: "BTP",                        emoji: "🏗️", label: "BTP" },
  { id: "Santé",                      emoji: "🏥", label: "Santé" },
  { id: "Hôtellerie / Restauration",  emoji: "🍽️", label: "Hôtellerie / Restauration" },
]

interface OPCO {
  nom: string
  site: string
  tel: string
  description: string
  color: string
}

const OPCO_MAP: Record<string, OPCO> = {
  "Tech / Numérique": {
    nom: "OPCO Atlas",
    site: "https://www.opco-atlas.fr",
    tel: "01 44 69 20 00",
    description: "Couvre les secteurs du numérique, des services financiers et du conseil. Il finance les coûts pédagogiques de ton contrat d'apprentissage, vérifie la conformité du CERFA FA13 et assure sa transmission à la DREETS dans les délais légaux.",
    color: "#3B82F6",
  },
  "Commerce / Distribution": {
    nom: "OPCO Uniformation",
    site: "https://www.uniformation.fr",
    tel: "01 40 35 20 00",
    description: "Opérateur de compétences couvrant le commerce, la distribution et l'économie sociale. Il finance les frais de formation, contrôle la conformité du CERFA et accompagne les entreprises dans les démarches administratives.",
    color: "#F59E0B",
  },
  "Finance / Banque": {
    nom: "OPCO Atlas",
    site: "https://www.opco-atlas.fr",
    tel: "01 44 69 20 00",
    description: "Gère les alternances dans la banque, l'assurance et les services financiers. Il prend en charge le financement du contrat et assure l'enregistrement légal du CERFA FA13 auprès des autorités compétentes.",
    color: "#3B82F6",
  },
  "Industrie": {
    nom: "OPCO 2i",
    site: "https://www.opco2i.fr",
    tel: "01 56 20 40 00",
    description: "Spécialisé dans l'industrie chimique, la métallurgie et la plasturgie. Il prend en charge le dépôt du CERFA FA13, finance les frais pédagogiques et effectue le suivi administratif auprès de la DREETS.",
    color: "#8B5CF6",
  },
  "BTP": {
    nom: "OPCO Constructys",
    site: "https://www.constructys.fr",
    tel: "01 41 05 62 00",
    description: "Dédié au bâtiment et aux travaux publics. Il vérifie la conformité du CERFA FA13, prend en charge les frais pédagogiques et transmet les contrats à la DREETS dans un délai de 15 jours après réception.",
    color: "#EA580C",
  },
  "Santé": {
    nom: "OPCO Santé",
    site: "https://www.opcosante.fr",
    tel: "02 40 41 22 00",
    description: "Couvre les établissements de santé, médico-sociaux et vétérinaires. Il enregistre les contrats d'apprentissage et de professionnalisation, finance les formations et assure le suivi réglementaire.",
    color: "#10B981",
  },
  "Hôtellerie / Restauration": {
    nom: "OPCO AFDAS",
    site: "https://www.afdas.com",
    tel: "01 44 78 39 39",
    description: "Couvre la culture, l'audiovisuel, l'hôtellerie-restauration et le tourisme. Il accompagne l'enregistrement du CERFA FA13, finance les coûts pédagogiques et effectue les démarches auprès de la DREETS.",
    color: "#EC4899",
  },
}

// ── Timeline data ──────────────────────────────────────────────────────────────

const TIMELINE = [
  { delai: "J − 8 avant début", acteur: "Entreprise + Alternant",  couleur: "#3B82F6", action: "Signature du contrat d'alternance (CERFA FA13) par les 3 parties : entreprise, alternant et CFA/école." },
  { delai: "J − 5 jours ouvrés", acteur: "Entreprise",            couleur: "#8B5CF6", action: "Envoi du CERFA signé à l'OPCO (par courrier ou via l'espace en ligne de l'OPCO). Joindre la convention de formation." },
  { delai: "Sous 15 jours",      acteur: "OPCO",                  couleur: "#F59E0B", action: "Vérification de la conformité du contrat. L'OPCO peut demander des pièces complémentaires ou refuser si le contrat est non conforme." },
  { delai: "Sous 1 mois",        acteur: "OPCO → DREETS",         couleur: "#EA580C", action: "Transmission automatique du dossier validé à la DREETS (Direction Régionale de l'Économie et du Travail). Aucune démarche supplémentaire de ta part." },
  { delai: "Sous 2 mois",        acteur: "DREETS",                couleur: "#10B981", action: "Validation définitive et attribution d'un numéro d'enregistrement. Tu recevras une copie par courrier ou e-mail. Contrat officiellement reconnu." },
]

// ── Component ──────────────────────────────────────────────────────────────────

export default function CerfaPage() {
  const [step,       setStep]       = useState(1)
  const [secteur,    setSecteur]    = useState<string | null>(null)
  const [checklist,  setChecklist]  = useState<string[]>([])
  const [checked,    setChecked]    = useState<Record<number, boolean>>({})
  const [loading,    setLoading]    = useState(false)

  const opco = secteur ? OPCO_MAP[secteur] : null

  async function goToStep3() {
    if (!secteur || !opco) return
    setStep(3)
    setLoading(true)
    try {
      const res = await fetch("/api/cerfa/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secteur, opcoNom: opco.nom }),
      })
      const data = await res.json()
      setChecklist(data.checklist ?? [])
    } catch { setChecklist([]) }
    setLoading(false)
  }

  function toggleCheck(i: number) {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }))
  }

  const checkedCount = Object.values(checked).filter(Boolean).length
  const totalItems   = checklist.length

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">

      <div className="mb-8">
        <AgentChat
          agentName="Lucas" agentEmoji="📋" agentTitle="Agent Administratif"
          agentDescription="Je t'explique toute la paperasse administrative pour que tu te concentres sur l'essentiel."
          features={["Guide CERFA FA13 pas à pas", "Correspondance OPCO par secteur", "Checklist documents personnalisée"]}
          userMessage="Lucas, comment signer mon CERFA ?"
          agentMessage="Je t'explique toute la paperasse administrative pour que tu te concentres sur l'essentiel 📋"
        />
      </div>

      {/* Step bar */}
      <div className="flex items-center gap-0 mb-8">
        {[
          { num: 1, label: "Secteur" },
          { num: 2, label: "OPCO" },
          { num: 3, label: "Documents" },
          { num: 4, label: "Timeline" },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center flex-1">
            <button
              onClick={() => { if (s.num < step || (s.num === 2 && secteur) || (s.num === 3 && checklist.length > 0)) setStep(s.num) }}
              className="flex items-center gap-1.5 flex-none"
            >
              <div className={`size-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                step === s.num ? "bg-gradient-blue text-white glow-blue-sm" :
                step > s.num  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                                "bg-white/[0.04] text-zinc-600 border border-white/[0.08]"
              }`}>
                {step > s.num ? <Check className="size-3.5" /> : s.num}
              </div>
              <span className={`text-xs hidden sm:inline ${step === s.num ? "text-white" : step > s.num ? "text-blue-400" : "text-zinc-600"}`}>
                {s.label}
              </span>
            </button>
            {i < 3 && (
              <div className={`flex-1 h-px mx-2 transition-all ${step > s.num ? "bg-blue-500/30" : "bg-white/[0.08]"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">

        {/* ── Étape 1 : Secteur ── */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <h2 className="text-xl font-semibold text-white mb-2">Ton secteur d&apos;activité ?</h2>
            <p className="text-sm text-zinc-500 mb-6">Sélectionne le secteur de l&apos;entreprise qui t&apos;accueille en alternance.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {SECTEURS.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSecteur(s.id); setStep(2) }}
                  className={`rounded-xl p-4 text-left transition-all border ${
                    secteur === s.id
                      ? "border-blue-500/40 bg-blue-500/10"
                      : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="text-2xl mb-2">{s.emoji}</div>
                  <p className="text-xs font-medium text-white leading-tight">{s.label}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Étape 2 : OPCO ── */}
        {step === 2 && opco && (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep(1)} className="size-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white border border-white/[0.08] hover:bg-white/5 transition-all">
                <ChevronLeft className="size-4" />
              </button>
              <h2 className="text-xl font-semibold text-white">Ton OPCO</h2>
            </div>

            <div className="surface p-6 mb-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs text-zinc-600 mb-1">Secteur : {secteur}</p>
                  <h3 className="text-2xl font-bold text-white">{opco.nom}</h3>
                </div>
                <div className="size-14 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${opco.color}15`, border: `1px solid ${opco.color}30` }}>
                  🏛️
                </div>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mb-5">{opco.description}</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={opco.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-blue glow-blue-sm hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="size-3.5" />
                  Site officiel
                </a>
                <a
                  href={`tel:${opco.tel.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-300 border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <Phone className="size-3.5" />
                  {opco.tel}
                </a>
              </div>
            </div>

            <button
              onClick={goToStep3}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-blue text-white font-semibold glow-blue-sm hover:opacity-90 transition-opacity"
            >
              Voir la checklist documents
              <ChevronRight className="size-4" />
            </button>
          </motion.div>
        )}

        {/* ── Étape 3 : Checklist ── */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep(2)} className="size-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white border border-white/[0.08] hover:bg-white/5 transition-all">
                <ChevronLeft className="size-4" />
              </button>
              <div>
                <h2 className="text-xl font-semibold text-white">Documents à préparer</h2>
                {totalItems > 0 && (
                  <p className="text-xs text-zinc-500 mt-0.5">{checkedCount} / {totalItems} complété{checkedCount > 1 ? "s" : ""}</p>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="size-8 text-blue-400 animate-spin" />
                <p className="text-sm text-zinc-500">Lucas prépare ta checklist personnalisée…</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-6">
                  {checklist.map((item, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => toggleCheck(i)}
                      className={`flex items-start gap-3 p-4 rounded-xl text-left border transition-all ${
                        checked[i]
                          ? "bg-emerald-500/[0.07] border-emerald-500/25"
                          : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className={`size-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        checked[i] ? "bg-emerald-500 border-emerald-500" : "border border-white/20"
                      }`}>
                        {checked[i] && <Check className="size-3 text-white" />}
                      </div>
                      <span className={`text-sm leading-relaxed ${checked[i] ? "text-zinc-500 line-through" : "text-zinc-300"}`}>
                        {item}
                      </span>
                    </motion.button>
                  ))}
                </div>

                <button
                  onClick={() => setStep(4)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-blue text-white font-semibold glow-blue-sm hover:opacity-90 transition-opacity"
                >
                  Voir la timeline du processus
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* ── Étape 4 : Timeline ── */}
        {step === 4 && (
          <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep(3)} className="size-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white border border-white/[0.08] hover:bg-white/5 transition-all">
                <ChevronLeft className="size-4" />
              </button>
              <h2 className="text-xl font-semibold text-white">Timeline du processus</h2>
            </div>

            <p className="text-sm text-zinc-500 mb-6">De la signature du CERFA FA13 à la validation définitive par la DREETS.</p>

            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[17px] top-5 bottom-5 w-px bg-white/[0.08]" />

              <div className="flex flex-col gap-4">
                {TIMELINE.map((event, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex gap-4"
                  >
                    <div className="size-9 rounded-full flex items-center justify-center shrink-0 z-10 text-sm font-bold" style={{ background: `${event.couleur}20`, border: `2px solid ${event.couleur}40`, color: event.couleur }}>
                      {i + 1}
                    </div>
                    <div className="surface p-4 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs font-medium text-white">{event.action.split(".")[0]}.</span>
                      </div>
                      <div className="flex gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${event.couleur}15`, color: event.couleur }}>
                          {event.delai}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-500 border border-white/[0.06]">
                          {event.acteur}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed">{event.action}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="mt-6 surface p-4 flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div>
                <p className="text-sm font-medium text-white mb-1">Bon à savoir</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Tu peux commencer à travailler avant la validation officielle du CERFA, à condition qu&apos;il soit signé et que l&apos;envoi à l&apos;OPCO soit en cours. L&apos;OPCO dispose de 20 jours pour refuser ; passé ce délai, le contrat est réputé accepté.
                </p>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
