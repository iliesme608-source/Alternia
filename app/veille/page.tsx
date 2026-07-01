"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { TrendingUp, ExternalLink, Loader2, Clock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { AgentChat } from "@/components/shared/AgentChat"

// ── Types ──────────────────────────────────────────────────────────────────────

interface Secteur { secteur: string; icone: string; offres: number; tendance: "hausse" | "stable" }
interface NewsItem { titre: string; resume: string; date: string; source: string; lien: string }
interface Conseil { titre: string; conseil: string; action: string; temps: string }

// ── Réseau écoles ─────────────────────────────────────────────────────────────

interface EntrepriseEcole { nom: string; secteur: string }

const ECOLES_ENTREPRISES: Record<string, EntrepriseEcole[]> = {
  "Paris School of Business":     [{ nom: "Renault", secteur: "Automobile" }, { nom: "BNP Paribas", secteur: "Finance" }, { nom: "L'Oréal", secteur: "Luxe & Beauté" }, { nom: "LVMH", secteur: "Luxe" }, { nom: "Accenture", secteur: "Conseil" }, { nom: "Société Générale", secteur: "Finance" }],
  "HEC Paris":                    [{ nom: "McKinsey", secteur: "Conseil" }, { nom: "Goldman Sachs", secteur: "Finance" }, { nom: "LVMH", secteur: "Luxe" }, { nom: "BCG", secteur: "Conseil" }, { nom: "TotalEnergies", secteur: "Énergie" }, { nom: "L'Oréal", secteur: "Luxe & Beauté" }],
  "EM Lyon":                      [{ nom: "Sanofi", secteur: "Santé" }, { nom: "Bosch", secteur: "Industrie" }, { nom: "Crédit Agricole", secteur: "Finance" }, { nom: "Michelin", secteur: "Industrie" }, { nom: "Danone", secteur: "Agroalimentaire" }, { nom: "EDF", secteur: "Énergie" }],
  "INSA Lyon":                    [{ nom: "Airbus", secteur: "Aéronautique" }, { nom: "STMicroelectronics", secteur: "Électronique" }, { nom: "SEB", secteur: "Industrie" }, { nom: "Dassault Aviation", secteur: "Aéronautique" }, { nom: "Renault", secteur: "Automobile" }, { nom: "Schneider Electric", secteur: "Énergie" }],
  "ESSEC Business School":        [{ nom: "LVMH", secteur: "Luxe" }, { nom: "Hermès", secteur: "Luxe" }, { nom: "Capgemini", secteur: "Conseil" }, { nom: "Kering", secteur: "Luxe" }, { nom: "L'Oréal", secteur: "Luxe & Beauté" }, { nom: "BNP Paribas", secteur: "Finance" }],
  "ESCP Business School":         [{ nom: "Deloitte", secteur: "Audit" }, { nom: "KPMG", secteur: "Audit" }, { nom: "Société Générale", secteur: "Finance" }, { nom: "Carrefour", secteur: "Distribution" }, { nom: "Publicis", secteur: "Communication" }, { nom: "EY", secteur: "Audit" }],
  "Sciences Po":                  [{ nom: "Médias & Presse (AFP)", secteur: "Médias" }, { nom: "Ministère des Affaires Étrangères", secteur: "Public" }, { nom: "Publicis", secteur: "Communication" }, { nom: "ONG & Institutions UE", secteur: "International" }, { nom: "Consulting politique", secteur: "Conseil" }, { nom: "Axa", secteur: "Assurance" }],
  "Grenoble École de Management": [{ nom: "Hewlett Packard", secteur: "Tech" }, { nom: "Schneider Electric", secteur: "Énergie" }, { nom: "STMicroelectronics", secteur: "Électronique" }, { nom: "EDF", secteur: "Énergie" }, { nom: "SEB", secteur: "Industrie" }, { nom: "Orange", secteur: "Télécom" }],
  "KEDGE Business School":        [{ nom: "Airbus", secteur: "Aéronautique" }, { nom: "SNCF", secteur: "Transport" }, { nom: "Michelin", secteur: "Industrie" }, { nom: "Cdiscount", secteur: "E-commerce" }, { nom: "La Poste", secteur: "Services" }, { nom: "Crédit Agricole", secteur: "Finance" }],
  "Audencia":                     [{ nom: "EDF", secteur: "Énergie" }, { nom: "Airbus", secteur: "Aéronautique" }, { nom: "Système U", secteur: "Distribution" }, { nom: "Crédit Agricole", secteur: "Finance" }, { nom: "Naval Group", secteur: "Défense" }, { nom: "SNCF", secteur: "Transport" }],
  "Skema Business School":        [{ nom: "Accenture", secteur: "Conseil" }, { nom: "Capgemini", secteur: "Conseil" }, { nom: "L'Oréal", secteur: "Luxe & Beauté" }, { nom: "Thales", secteur: "Défense" }, { nom: "Renault", secteur: "Automobile" }, { nom: "Orange", secteur: "Télécom" }],
  "CentraleSupélec":              [{ nom: "EDF", secteur: "Énergie" }, { nom: "Thales", secteur: "Défense" }, { nom: "Safran", secteur: "Aéronautique" }, { nom: "Total", secteur: "Énergie" }, { nom: "Airbus", secteur: "Aéronautique" }, { nom: "Capgemini", secteur: "Conseil" }],
  "École Polytechnique":          [{ nom: "McKinsey", secteur: "Conseil" }, { nom: "BCG", secteur: "Conseil" }, { nom: "Google", secteur: "Tech" }, { nom: "Safran", secteur: "Aéronautique" }, { nom: "CEA", secteur: "Recherche" }, { nom: "Total", secteur: "Énergie" }],
  "Epitech":                      [{ nom: "Ubisoft", secteur: "Jeux vidéo" }, { nom: "Deezer", secteur: "Tech" }, { nom: "BNP Paribas", secteur: "Finance" }, { nom: "Thales", secteur: "Défense" }, { nom: "Capgemini", secteur: "Conseil" }, { nom: "OVHcloud", secteur: "Cloud" }],
  "EPITA":                        [{ nom: "Thales", secteur: "Défense" }, { nom: "Dassault Systèmes", secteur: "Logiciel" }, { nom: "Google", secteur: "Tech" }, { nom: "Ubisoft", secteur: "Jeux vidéo" }, { nom: "Sopra Steria", secteur: "Conseil" }, { nom: "Criteo", secteur: "Tech" }],
  "42 (École 42)":                [{ nom: "Spotify", secteur: "Tech" }, { nom: "Blablacar", secteur: "Tech" }, { nom: "Dailymotion", secteur: "Tech" }, { nom: "Doctolib", secteur: "HealthTech" }, { nom: "Alan", secteur: "Insurtech" }, { nom: "Criteo", secteur: "Tech" }],
  "EFREI / ESGI":                 [{ nom: "SFR", secteur: "Télécom" }, { nom: "Orange", secteur: "Télécom" }, { nom: "Sopra Steria", secteur: "Conseil" }, { nom: "Accenture", secteur: "Conseil" }, { nom: "Bouygues Telecom", secteur: "Télécom" }, { nom: "Capgemini", secteur: "Conseil" }],
  "Arts et Métiers":              [{ nom: "PSA (Stellantis)", secteur: "Automobile" }, { nom: "Renault", secteur: "Automobile" }, { nom: "Safran", secteur: "Aéronautique" }, { nom: "Airbus", secteur: "Aéronautique" }, { nom: "Saint-Gobain", secteur: "Industrie" }, { nom: "Michelin", secteur: "Industrie" }],
  "IAE (Universités)":            [{ nom: "EDF", secteur: "Énergie" }, { nom: "SNCF", secteur: "Transport" }, { nom: "Banque Populaire", secteur: "Finance" }, { nom: "La Poste", secteur: "Services" }, { nom: "Lidl", secteur: "Distribution" }, { nom: "Decathlon", secteur: "Sport" }],
  "IUT / BTS (Université)":       [{ nom: "Décathlon", secteur: "Sport" }, { nom: "Lidl", secteur: "Distribution" }, { nom: "Bouygues Construction", secteur: "BTP" }, { nom: "SNCF", secteur: "Transport" }, { nom: "La Poste", secteur: "Services" }, { nom: "Orange", secteur: "Télécom" }],
}

const FALLBACK_ENTREPRISES: EntrepriseEcole[] = [
  { nom: "Capgemini", secteur: "Conseil & Tech" },
  { nom: "EDF", secteur: "Énergie" },
  { nom: "Société Générale", secteur: "Finance" },
  { nom: "L'Oréal", secteur: "Luxe & Beauté" },
  { nom: "Renault", secteur: "Automobile" },
  { nom: "SNCF", secteur: "Transport" },
]

function getInitials(nom: string): string {
  return nom.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

function getColorFromName(nom: string): string {
  const COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4"]
  let h = 0
  for (let i = 0; i < nom.length; i++) h = nom.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

function resolveEcole(raw: string): string {
  const cleaned = raw.trim()
  // Exact match
  if (ECOLES_ENTREPRISES[cleaned]) return cleaned
  // Partial match (case-insensitive)
  const lower = cleaned.toLowerCase()
  const found = Object.keys(ECOLES_ENTREPRISES).find(k => k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase().split(" ")[0]))
  return found ?? ""
}

// ── Calendrier statique 2026-2027 ─────────────────────────────────────────────

const CALENDRIER = [
  { mois: "2026-07", label: "Juillet 2026",   titre: "Salons alternance Paris, Lyon, Bordeaux",    detail: "Rencontrez des recruteurs en direct. Préparez votre pitch en 2 min." },
  { mois: "2026-08", label: "Août 2026",      titre: "Dernières candidatures — rentrée septembre", detail: "Ultime fenêtre pour signer avant la rentrée. Relancez vos contacts." },
  { mois: "2026-09", label: "Septembre 2026", titre: "Rentrée CFA — dernière chance signature",    detail: "Certains CFA acceptent encore des contrats en septembre. Ne lâchez pas !" },
  { mois: "2026-10", label: "Octobre 2026",   titre: "Ouverture candidatures janv 2027",           detail: "Anticipez la prochaine rentrée. Les meilleures offres partent tôt." },
  { mois: "2026-11", label: "Novembre 2026",  titre: "Forum alternance grandes écoles",            detail: "IAE, grandes écoles et universités ouvrent leurs journées portes ouvertes." },
  { mois: "2027-01", label: "Janvier 2027",   titre: "Rentrée alternance hiver",                   detail: "Deuxième vague de rentrée : BTS, BUT et certains Master démarrent en janvier." },
]

function getStatus(mois: string): "passe" | "prochain" | "futur" {
  const now = new Date()
  const [y, m] = mois.split("-").map(Number)
  const target = new Date(y, m - 1, 1)
  const nowStart = new Date(now.getFullYear(), now.getMonth(), 1)
  if (target < nowStart) return "passe"
  if (target.getTime() === nowStart.getTime()) return "prochain"
  return "futur"
}

function resolveStatuses(items: typeof CALENDRIER) {
  const statuses = items.map(e => getStatus(e.mois))
  const firstFutur = statuses.findIndex(s => s !== "passe")
  if (firstFutur !== -1) statuses[firstFutur] = "prochain"
  return statuses
}

const STATUSES = resolveStatuses(CALENDRIER)
const STATUS_COLORS = { passe: "#22C55E", prochain: "#3B82F6", futur: "#52525B" }
const STATUS_LABELS = { passe: "Passé", prochain: "Prochain", futur: "À venir" }

// ── Loading skeleton ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-lg animate-pulse ${className ?? ""}`}
      style={{ background: "rgba(255,255,255,0.04)" }}
    />
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VeillePage() {
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [conseils, setConseils] = useState<Conseil[]>([])
  const [profile, setProfile] = useState<{ secteur: string; region: string; niveau: string } | null>(null)
  const [loadingSecteurs, setLoadingSecteurs] = useState(true)
  const [loadingNews, setLoadingNews] = useState(true)
  const [loadingConseils, setLoadingConseils] = useState(true)

  useEffect(() => {
    fetch("/api/veille/secteurs")
      .then(r => r.json())
      .then(d => { setSecteurs(d.secteurs ?? []); setLoadingSecteurs(false) })
      .catch(() => setLoadingSecteurs(false))
  }, [])

  useEffect(() => {
    fetch("/api/veille/news")
      .then(r => r.json())
      .then(d => { setNews(d.news ?? []); setLoadingNews(false) })
      .catch(() => setLoadingNews(false))
  }, [])

  useEffect(() => {
    async function run() {
      let prof = { secteur: "", region: "", niveau: "" }
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data } = await supabase
          .from("profiles")
          .select("secteur, region, niveau")
          .eq("id", session.user.id)
          .single()
        if (data) prof = { secteur: data.secteur ?? "", region: data.region ?? "", niveau: data.niveau ?? "" }
      }
      setProfile(prof)

      try {
        const res = await fetch("/api/veille/conseils", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prof),
        })
        const d = await res.json()
        setConseils(d.conseils ?? [])
      } catch {
        setConseils([])
      } finally {
        setLoadingConseils(false)
      }
    }
    run()
  }, [])

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-6 lg:px-10 py-10">

      <div className="mb-8">
        <AgentChat
          agentName="Sarah" agentEmoji="🔍" agentTitle="Agent Veille"
          agentDescription="Je surveille le marché de l'alternance pour toi en temps réel. Tendances sectorielles, actualités et conseils personnalisés."
          features={["Tendances secteurs en direct", "Actualités officielles filtrées", "Conseils personnalisés IA"]}
          userMessage="Sarah, quels secteurs recrutent le plus en ce moment ?"
          agentMessage="Je surveille le marché en continu ! La tech et l'industrie sont en forte hausse ce mois-ci. 📈"
          accentColor="#0D9488"
        />
      </div>

      {/* Grid 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">

        {/* ── SECTION 1 : Secteurs qui recrutent ── */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="surface p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-1">Secteurs qui recrutent</h2>
          <p className="text-xs text-zinc-600 mb-5">Offres alternance actives en ce moment</p>

          {loadingSecteurs ? (
            <div className="space-y-2.5">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {secteurs.map((s, i) => (
                <motion.div key={s.secteur}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <span className="text-lg shrink-0">{s.icone}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{s.secteur}</p>
                    <p className="text-xs text-zinc-600">
                      {s.offres.toLocaleString("fr-FR")} offres
                    </p>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium shrink-0"
                    style={s.tendance === "hausse"
                      ? { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.20)", color: "#22C55E" }
                      : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#52525B" }
                    }>
                    {s.tendance === "hausse" ? (
                      <><TrendingUp className="size-3" /> En hausse</>
                    ) : (
                      <>Stable</>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* ── SECTION 2 : Actualités alternance ── */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="surface p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-1">Actualités alternance</h2>
          <p className="text-xs text-zinc-600 mb-5">5 dernières actus officielles</p>

          {loadingNews ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {news.map((n, i) => (
                <motion.a key={i} href={n.lien} target="_blank" rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="flex gap-3 p-3.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.03] group cursor-pointer transition-colors block">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 group-hover:text-white transition-colors leading-snug line-clamp-2">
                      {n.titre}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1 leading-relaxed line-clamp-2">{n.resume}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-zinc-700">{formatDate(n.date)}</span>
                      <span className="text-[10px] text-zinc-700">·</span>
                      <span className="text-[10px] text-zinc-500">{n.source}</span>
                    </div>
                  </div>
                  <ExternalLink className="size-3.5 text-zinc-700 group-hover:text-zinc-500 transition-colors shrink-0 mt-0.5" />
                </motion.a>
              ))}
            </div>
          )}
        </motion.section>

        {/* ── SECTION 3 : Conseils de Lucas ── */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="surface p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-1">Conseils personnalisés de Lucas</h2>
          <p className="text-xs text-zinc-600 mb-5">
            {profile?.secteur
              ? `Générés pour ${profile.secteur}${profile.region ? " · " + profile.region : ""}`
              : "Complète ton profil pour des conseils ciblés"
            }
          </p>

          {loadingConseils ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
              <p className="text-xs text-zinc-700 text-center">Lucas prépare tes conseils…</p>
            </div>
          ) : conseils.length > 0 ? (
            <div className="space-y-3">
              {conseils.map((c, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i }}
                  className="p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex size-5 items-center justify-center rounded border border-white/[0.06] bg-white/[0.03] text-[10px] font-medium text-zinc-400 shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-sm font-medium text-white">{c.titre}</p>
                  </div>
                  <p className="text-sm text-zinc-500 leading-relaxed mb-3">{c.conseil}</p>
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-blue-500/[0.15] bg-blue-500/[0.06] mb-2">
                    <span className="text-[10px] font-medium text-blue-500 shrink-0 mt-0.5">ACTION</span>
                    <p className="text-xs text-blue-400 leading-relaxed">{c.action}</p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                    <Clock className="size-3" />
                    <span>À faire cette semaine · {c.temps}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="size-5 text-zinc-700 animate-spin" />
            </div>
          )}
        </motion.section>

        {/* ── SECTION 4 : Calendrier ── */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
          className="surface p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-1">Calendrier alternance 2026</h2>
          <p className="text-xs text-zinc-600 mb-6">Salons, rentrées CFA et deadlines clés</p>

          {/* Timeline verticale */}
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.06]" />

            <div className="space-y-0">
              {CALENDRIER.map((evt, i) => {
                const status = STATUSES[i]
                const color = STATUS_COLORS[status]
                const isPasse = status === "passe"
                return (
                  <motion.div key={evt.mois}
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i }}
                    className="flex gap-4 pb-5">
                    <div className="flex flex-col items-center shrink-0 pt-1" style={{ width: 15 }}>
                      <div className="size-3.5 rounded-full border-2 flex-shrink-0"
                        style={{
                          background: isPasse ? "transparent" : color,
                          borderColor: color,
                        }} />
                    </div>
                    <div className="flex-1 pb-1" style={{ opacity: isPasse ? 0.45 : 1 }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-medium uppercase tracking-wider"
                          style={{ color }}>
                          {STATUS_LABELS[status]}
                        </span>
                        <span className="text-[10px] text-zinc-700">{evt.label}</span>
                      </div>
                      <p className="text-sm text-white leading-snug">{evt.titre}</p>
                      <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{evt.detail}</p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Légende */}
          <div className="flex items-center gap-4 mt-2 pt-4 border-t border-white/[0.06]">
            {(["passe", "prochain", "futur"] as const).map(s => (
              <div key={s} className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <div className="size-1.5 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                {STATUS_LABELS[s]}
              </div>
            ))}
          </div>
        </motion.section>

      </div>
    </div>
  )
}
