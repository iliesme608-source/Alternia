"use client"

import { useState, useMemo, useSyncExternalStore } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { AgentChat } from "@/components/shared/AgentChat"
import {
  Globe, ShieldCheck, FileCheck2, Upload, Clock, BellRing,
  CheckCircle2, Circle, Mail, Copy, Check, Loader2, ChevronDown,
  ExternalLink, Sparkles, Lightbulb, MessageSquare, ArrowRight,
} from "lucide-react"

// ── Données ───────────────────────────────────────────────────────────────────

type Nationalite = "" | "ue" | "hors-ue"

interface Etape {
  icon: React.ElementType
  titre: string
  delai: string
  checklist: string[]
  conseil: string
}

const ETAPES: Etape[] = [
  {
    icon: ShieldCheck,
    titre: "Vérifie ton titre de séjour actuel",
    delai: "À faire maintenant",
    checklist: [
      "Mon titre de séjour porte bien la mention « étudiant »",
      "Sa date de validité couvre le début du contrat",
      "Je suis inscrit dans un établissement d'enseignement supérieur français",
      "J'ai une copie recto/verso numérisée en PDF",
    ],
    conseil: "Si ton titre expire dans moins de 4 mois, lance le renouvellement en parallèle. La préfecture n'instruit pas une autorisation de travail adossée à un titre qui arrive à échéance.",
  },
  {
    icon: FileCheck2,
    titre: "Demande l'autorisation de travail AVANT de signer",
    delai: "2 à 4 mois d'instruction en préfecture",
    checklist: [
      "J'ai obtenu une promesse d'embauche écrite",
      "J'ai prévenu l'entreprise que la demande précède la signature",
      "Le contrat visé est bien un contrat d'apprentissage ou de professionnalisation",
      "J'ai fixé une date de démarrage avec une marge de sécurité",
    ],
    conseil: "Ne signe jamais « en attendant ». Un contrat signé sans autorisation peut bloquer tout ton dossier. La promesse d'embauche suffit à lancer la procédure.",
  },
  {
    icon: Upload,
    titre: "Prépare les documents du dossier",
    delai: "1 à 2 semaines de préparation",
    checklist: [
      "Titre de séjour en cours de validité (recto/verso)",
      "Certificat de scolarité de l'année en cours",
      "Promesse d'embauche signée par l'entreprise",
      "Formulaire CERFA renseigné par l'employeur",
      "Justificatif de domicile de moins de 6 mois",
    ],
    conseil: "Scanne tout en PDF avec des noms de fichiers clairs (nom_prenom_titre-sejour.pdf). Un dossier lisible est instruit bien plus vite qu'une série de photos floues.",
  },
  {
    icon: Globe,
    titre: "Dépose le dossier sur le portail officiel",
    delai: "1 journée",
    checklist: [
      "Compte créé sur administration-etrangers-en-france.interieur.gouv.fr",
      "Demande « autorisation de travail » sélectionnée",
      "Toutes les pièces téléversées au bon format",
      "Accusé de réception téléchargé et sauvegardé",
    ],
    conseil: "Capture le numéro de dossier dès la validation : c'est la seule référence que la préfecture reconnaît lors d'une relance.",
  },
  {
    icon: BellRing,
    titre: "Assure le suivi et relance la préfecture",
    delai: "Relance toutes les 3 à 4 semaines",
    checklist: [
      "Relances programmées dans mon agenda",
      "Point d'avancement envoyé à l'entreprise",
      "Coordonnées du service main-d'œuvre étrangère notées",
      "Autorisation reçue et transmise à l'entreprise",
    ],
    conseil: "Informe l'entreprise toutes les deux semaines, même sans nouvelle. Ce qui fait reculer un recruteur, c'est le silence, jamais le délai lui-même.",
  },
]

const PAYS_CV = ["USA", "UK", "Chine", "Inde", "Maroc", "Brésil", "Autre"]

const CONSEILS_ENTRETIEN = [
  {
    titre: "La modestie calculée est valorisée",
    texte: "En France, on présente ses résultats avec des faits plutôt qu'avec des superlatifs. Dis « j'ai augmenté les ventes de 15 % » plutôt que « je suis le meilleur commercial ».",
  },
  {
    titre: "Ton parcours international est un atout",
    texte: "Langues, adaptabilité, regard extérieur sur le marché : formule-les comme des compétences opérationnelles pour l'entreprise, pas comme une différence à excuser.",
  },
  {
    titre: "Le savoir-être compte autant que le savoir-faire",
    texte: "Ponctualité, tenue, vouvoiement, façon de conclure l'entretien : le recruteur français évalue aussi ta capacité à t'intégrer dans l'équipe.",
  },
]

const RESSOURCES = [
  { nom: "Campus France",           desc: "L'agence de référence pour les étudiants étrangers en France.",     url: "https://www.campusfrance.org",                                 emoji: "🎓" },
  { nom: "Autorisation de travail", desc: "La fiche officielle Service-Public sur la procédure et les pièces.", url: "https://www.service-public.fr/particuliers/vosdroits/F2728",   emoji: "📄" },
  { nom: "OFII",                    desc: "Office français de l'immigration et de l'intégration.",              url: "https://www.ofii.fr",                                          emoji: "🏛️" },
  { nom: "Portail étrangers",       desc: "Le portail de dépôt en ligne du ministère de l'Intérieur.",          url: "https://administration-etrangers-en-france.interieur.gouv.fr", emoji: "🌐" },
]

// ── Progression de la checklist (persistée dans le navigateur) ────────────────

const STORAGE_KEY   = "alternia:international:checklist"
const STORAGE_EVENT = "alternia:international:checklist-change"

// Repli mémoire si le stockage du navigateur est indisponible (mode restreint)
let memoryStore = ""

function subscribeChecklist(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(STORAGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(STORAGE_EVENT, onChange)
  }
}

function readChecklist(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? memoryStore } catch { return memoryStore }
}

function writeChecklist(value: string) {
  memoryStore = value
  try { localStorage.setItem(STORAGE_KEY, value) } catch { /* mémoire seule */ }
  window.dispatchEvent(new Event(STORAGE_EVENT))
}

// ── Bouton copier ─────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InternationalPage() {
  // Section 1 — wizard autorisation de travail
  const [nationalite, setNationalite] = useState<Nationalite>("")
  const [poste,       setPoste]       = useState("")
  const [entreprise,  setEntreprise]  = useState("")
  const [email,       setEmail]       = useState("")
  const [loadEmail,   setLoadEmail]   = useState(false)

  // Section 2 — CV français
  const [cv,          setCv]          = useState("")
  const [pays,        setPays]        = useState(PAYS_CV[0])
  const [loadCv,      setLoadCv]      = useState(false)
  const [cvAdapte,    setCvAdapte]    = useState("")
  const [differences, setDifferences] = useState<{ titre: string; explication: string }[]>([])
  const [errorCv,     setErrorCv]     = useState("")

  // Progression de la checklist, relue depuis le stockage navigateur
  const rawChecked = useSyncExternalStore(subscribeChecklist, readChecklist, () => "")
  const checked = useMemo<Record<string, boolean>>(() => {
    try { return rawChecked ? JSON.parse(rawChecked) as Record<string, boolean> : {} } catch { return {} }
  }, [rawChecked])

  function toggle(key: string) {
    writeChecklist(JSON.stringify({ ...checked, [key]: !checked[key] }))
  }

  const totalItems = ETAPES.reduce((n, e) => n + e.checklist.length, 0)
  const doneItems  = ETAPES.reduce(
    (n, e, i) => n + e.checklist.filter((_, j) => checked[`${i}-${j}`]).length,
    0,
  )
  const progression = totalItems ? Math.round((doneItems / totalItems) * 100) : 0

  const etapeActuelle =
    ETAPES.find((e, i) => e.checklist.some((_, j) => !checked[`${i}-${j}`]))?.titre
    ?? "Toutes les étapes sont validées"

  async function genererEmail() {
    setLoadEmail(true)
    setEmail("")
    try {
      const res = await fetch("/api/international/email-delais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poste,
          entreprise,
          nationalite: "Étudiant hors Union Européenne, titre de séjour mention étudiant",
          etapeActuelle,
        }),
      })
      const data = await res.json()
      setEmail(typeof data.email === "string" ? data.email : "")
    } catch {
      setEmail("")
    }
    setLoadEmail(false)
  }

  async function adapterCv() {
    if (cv.trim().length < 40) {
      setErrorCv("CV trop court : colle le contenu complet de ton CV.")
      return
    }
    setLoadCv(true)
    setErrorCv("")
    setCvAdapte("")
    setDifferences([])
    try {
      const res = await fetch("/api/international/cv-francais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv, pays }),
      })
      const data = await res.json()
      if (data.error) { setErrorCv(data.error as string); return }
      setCvAdapte((data.cv_adapte as string) ?? "")
      setDifferences(Array.isArray(data.differences) ? data.differences : [])
    } catch {
      setErrorCv("Adaptation impossible pour le moment. Réessaie dans un instant.")
    } finally {
      setLoadCv(false)
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">

      {/* ── Header agent ───────────────────────────────────────────────────── */}
      <div className="mb-10">
        <AgentChat
          agentId="nora"
          agentName="Nora"
          agentEmoji="🌍"
          agentTitle="Coach Étudiants Internationaux"
          agentDescription="Autorisation de travail, format de CV, codes de l'entretien : je te guide sur chaque démarche spécifique aux étudiants venus de l'étranger."
          features={["Guide autorisation de travail pas à pas", "CV adapté au format français", "Entretien aux codes français"]}
          userMessage="Nora, par où je commence mes démarches ?"
          agentMessage="Je t'accompagne dans toutes tes démarches d'étudiant international 🌍"
          accentColor="#A78BFA"
        />
      </div>

      {/* ══ SECTION 1 — Autorisation de travail ═══════════════════════════════ */}
      <section className="mb-14">
        <div className="flex items-center gap-2.5 mb-1">
          <ShieldCheck className="size-4 text-blue-400" />
          <h2 className="text-white font-semibold">Guide autorisation de travail</h2>
        </div>
        <p className="text-[13px] text-zinc-500 mb-6">
          Réponds à une question, obtiens la procédure exacte qui te concerne.
        </p>

        <div className="surface p-6">
          <label className="text-sm text-zinc-400 mb-2 block">Ta nationalité</label>
          <div className="relative max-w-sm">
            <select
              value={nationalite}
              onChange={e => setNationalite(e.target.value as Nationalite)}
              className="w-full h-11 px-4 pr-10 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] appearance-none focus:border-blue-500/40 focus:outline-none transition-colors"
            >
              <option value="">Sélectionne ta situation…</option>
              <option value="ue">Union Européenne</option>
              <option value="hors-ue">Hors Union Européenne</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
          </div>

          {/* Réponse UE */}
          <AnimatePresence mode="wait">
            {nationalite === "ue" && (
              <motion.div
                key="ue"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="mt-5 rounded-xl p-5 flex gap-3"
                style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.20)" }}
              >
                <CheckCircle2 className="size-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-300 mb-1">Bonne nouvelle !</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    En tant que ressortissant UE, tu n&apos;as besoin d&apos;aucune autorisation de travail.
                    Tu peux signer un contrat d&apos;alternance directement.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Guide hors UE */}
        <AnimatePresence>
          {nationalite === "hors-ue" && (
            <motion.div
              key="hors-ue"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-6 flex flex-col gap-4"
            >
              {/* Progression */}
              <div className="surface p-5">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm text-zinc-400">Ta progression</span>
                  <span className="text-sm font-semibold text-white">{doneItems}/{totalItems} · {progression} %</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-blue"
                    initial={{ width: 0 }}
                    animate={{ width: `${progression}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
                <p className="text-[11px] text-zinc-600 mt-2">Étape en cours : {etapeActuelle}</p>
              </div>

              {/* Les 5 étapes */}
              {ETAPES.map((etape, i) => {
                const Icon = etape.icon
                const faits = etape.checklist.filter((_, j) => checked[`${i}-${j}`]).length
                const complete = faits === etape.checklist.length
                return (
                  <div key={etape.titre} className="surface surface-hover p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div
                        className="size-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: complete ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.10)",
                          border: complete ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(59,130,246,0.20)",
                        }}
                      >
                        <Icon className={complete ? "size-4 text-emerald-400" : "size-4 text-blue-400"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono text-zinc-600">Étape {i + 1}</span>
                          {complete && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Terminée
                            </span>
                          )}
                        </div>
                        <h3 className="text-white font-medium text-[15px] mt-0.5">{etape.titre}</h3>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Clock className="size-3 text-zinc-600" />
                          <span className="text-[11px] text-zinc-500">{etape.delai}</span>
                        </div>
                      </div>
                    </div>

                    {/* Checklist cochable */}
                    <div className="flex flex-col gap-1.5 mb-4">
                      {etape.checklist.map((item, j) => {
                        const key = `${i}-${j}`
                        const on = !!checked[key]
                        return (
                          <button
                            key={key}
                            onClick={() => toggle(key)}
                            className="flex items-start gap-2.5 text-left px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group"
                          >
                            {on
                              ? <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-px" />
                              : <Circle className="size-4 text-zinc-700 group-hover:text-zinc-500 shrink-0 mt-px transition-colors" />}
                            <span className={on ? "text-[13px] leading-relaxed text-zinc-600 line-through" : "text-[13px] leading-relaxed text-zinc-300"}>
                              {item}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Conseil de Lucas */}
                    <div className="rounded-xl p-4 flex gap-2.5" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)" }}>
                      <Lightbulb className="size-4 text-blue-300 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-medium text-blue-300 mb-1">Conseil de Lucas</p>
                        <p className="text-[13px] text-zinc-400 leading-relaxed">{etape.conseil}</p>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Générateur d'email */}
              <div className="surface p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="size-4 text-blue-400" />
                  <h3 className="text-white font-medium">Expliquer les délais à l&apos;entreprise</h3>
                </div>
                <p className="text-[13px] text-zinc-500 mb-5">
                  Un email professionnel qui rassure le recruteur sur la procédure, les délais et ton rôle dans le dossier.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Poste visé (optionnel)</label>
                    <input
                      value={poste}
                      onChange={e => setPoste(e.target.value)}
                      placeholder="ex: Alternant développeur web"
                      className="w-full h-11 px-4 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Entreprise (optionnel)</label>
                    <input
                      value={entreprise}
                      onChange={e => setEntreprise(e.target.value)}
                      placeholder="ex: Capgemini"
                      className="w-full h-11 px-4 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <button
                  onClick={genererEmail}
                  disabled={loadEmail}
                  className="pill-btn pill-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {loadEmail ? "Rédaction en cours…" : "Générer un email pour expliquer les délais à l'entreprise"}
                </button>

                <AnimatePresence>
                  {email && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-zinc-500">Email généré</span>
                        <CopyBtn text={email} />
                      </div>
                      <pre
                        className="rounded-xl p-4 text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        {email}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ══ SECTION 2 — CV format français ════════════════════════════════════ */}
      <section className="mb-14">
        <div className="flex items-center gap-2.5 mb-1">
          <FileCheck2 className="size-4 text-blue-400" />
          <h2 className="text-white font-semibold">Adapter ton CV au format français</h2>
        </div>
        <p className="text-[13px] text-zinc-500 mb-6">
          Un CV américain ou indien ne se lit pas comme un CV français. Nora le réécrit aux normes locales.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Entrée */}
          <div className="surface p-6 flex flex-col">
            <label className="text-xs text-zinc-500 mb-1.5 block">Ton CV actuel</label>
            <textarea
              value={cv}
              onChange={e => setCv(e.target.value)}
              placeholder="Colle ici le contenu complet de ton CV…"
              rows={14}
              className="w-full px-4 py-3 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors resize-y leading-relaxed"
            />

            <div className="mt-4">
              <label className="text-xs text-zinc-500 mb-1.5 block">Pays d&apos;origine du format CV</label>
              <div className="relative">
                <select
                  value={pays}
                  onChange={e => setPays(e.target.value)}
                  className="w-full h-11 px-4 pr-10 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] appearance-none focus:border-blue-500/40 focus:outline-none transition-colors"
                >
                  {PAYS_CV.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
              </div>
            </div>

            <button
              onClick={adapterCv}
              disabled={loadCv}
              className="pill-btn pill-btn-primary mt-4 w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadCv ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {loadCv ? "Adaptation en cours…" : "Adapter au format français"}
            </button>

            {errorCv && <p className="text-[12px] text-red-400 mt-3">{errorCv}</p>}
          </div>

          {/* Résultat */}
          <div className="flex flex-col gap-5">
            <div className="surface p-6 min-h-[200px]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white">CV au format français</h3>
                {cvAdapte && <CopyBtn text={cvAdapte} />}
              </div>
              {cvAdapte ? (
                <pre className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans max-h-[420px] overflow-y-auto">
                  {cvAdapte}
                </pre>
              ) : (
                <p className="text-sm text-zinc-700">
                  {loadCv ? "Nora réécrit ton CV…" : "Colle ton CV puis lance l'adaptation pour voir le résultat ici."}
                </p>
              )}
            </div>

            {differences.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="surface p-6">
                <h3 className="text-sm font-medium text-white mb-4">Différences culturelles à connaître</h3>
                <div className="flex flex-col gap-3">
                  {differences.map((d, i) => (
                    <div key={`${d.titre}-${i}`} className="flex gap-3">
                      <span className="size-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-[13px] font-medium text-zinc-200">{d.titre}</p>
                        <p className="text-[13px] text-zinc-500 leading-relaxed mt-0.5">{d.explication}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ══ SECTION 3 — Entretien interculturel ═══════════════════════════════ */}
      <section className="mb-14">
        <div className="flex items-center gap-2.5 mb-1">
          <MessageSquare className="size-4 text-blue-400" />
          <h2 className="text-white font-semibold">Simulation d&apos;entretien interculturel</h2>
        </div>
        <p className="text-[13px] text-zinc-500 mb-6">
          Les codes français se travaillent avant le jour J, pas pendant.
        </p>

        <div className="surface p-6">
          <p className="text-sm text-zinc-300 leading-relaxed mb-5 max-w-2xl">
            Les codes de l&apos;entretien français sont spécifiques. Lucas adapte ses questions et son feedback
            à ton parcours international.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {CONSEILS_ENTRETIEN.map((c, i) => (
              <div key={c.titre} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-[11px] font-mono text-zinc-600">0{i + 1}</span>
                <p className="text-[13px] font-medium text-zinc-200 mt-1 mb-1.5">{c.titre}</p>
                <p className="text-[12px] text-zinc-500 leading-relaxed">{c.texte}</p>
              </div>
            ))}
          </div>

          <Link href="/entretien?mode=international" className="pill-btn pill-btn-primary">
            Lancer un entretien adapté
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      {/* ══ SECTION 4 — Ressources officielles ════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-2.5 mb-1">
          <Globe className="size-4 text-blue-400" />
          <h2 className="text-white font-semibold">Ressources officielles</h2>
        </div>
        <p className="text-[13px] text-zinc-500 mb-6">
          Les seules sources qui font foi pour tes démarches.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {RESSOURCES.map(r => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="surface surface-hover p-5 flex flex-col gap-2 group"
            >
              <div className="flex items-start justify-between">
                <span className="text-xl leading-none">{r.emoji}</span>
                <ExternalLink className="size-3.5 text-zinc-700 group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="text-sm font-medium text-white">{r.nom}</p>
              <p className="text-[12px] text-zinc-500 leading-relaxed">{r.desc}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
