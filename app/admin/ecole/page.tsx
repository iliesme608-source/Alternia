"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import {
  Users,
  Send,
  Mic,
  TrendingUp,
  AlertTriangle,
  Check,
  Mail,
} from "lucide-react"

/* ── Données statiques de démonstration ─────────────────────────────── */

const stats = [
  { icon: Users,      label: "Étudiants actifs cette semaine", value: "47",   delta: "+12% vs mois dernier" },
  { icon: Send,       label: "Candidatures envoyées ce mois",  value: "312",  delta: "+28% vs mois dernier" },
  { icon: Mic,        label: "Entretiens simulés",             value: "89",   delta: "+9% vs mois dernier" },
  { icon: TrendingUp, label: "Taux de réponse moyen",          value: "23%",  delta: "+4 pts vs mois dernier" },
]

const activite = [
  { jour: "Lun", valeur: 45 },
  { jour: "Mar", valeur: 67 },
  { jour: "Mer", valeur: 52 },
  { jour: "Jeu", valeur: 78 },
  { jour: "Ven", valeur: 70 },
]

const entreprises = [
  { nom: "BNP Paribas",      initiales: "BP", count: 34, couleur: "bg-emerald-500/20 text-emerald-400" },
  { nom: "L'Oréal",          initiales: "LO", count: 28, couleur: "bg-amber-500/20 text-amber-400" },
  { nom: "Société Générale", initiales: "SG", count: 24, couleur: "bg-red-500/20 text-red-400" },
  { nom: "Renault",          initiales: "RN", count: 19, couleur: "bg-yellow-500/20 text-yellow-400" },
  { nom: "LVMH",             initiales: "LV", count: 17, couleur: "bg-purple-500/20 text-purple-400" },
  { nom: "Accenture",        initiales: "AC", count: 15, couleur: "bg-violet-500/20 text-violet-400" },
  { nom: "KPMG",             initiales: "KP", count: 12, couleur: "bg-sky-500/20 text-sky-400" },
  { nom: "Deloitte",         initiales: "DL", count: 10, couleur: "bg-green-500/20 text-green-400" },
]

const secteurs = [
  { nom: "Data & IA",        pct: 31, etudiants: 15, couleur: "border-blue-500/30 bg-blue-500/[0.07] text-blue-400" },
  { nom: "Finance & Banque", pct: 24, etudiants: 11, couleur: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400" },
  { nom: "Marketing & Com",  pct: 18, etudiants: 8,  couleur: "border-pink-500/30 bg-pink-500/[0.07] text-pink-400" },
  { nom: "Commerce & Vente", pct: 15, etudiants: 7,  couleur: "border-amber-500/30 bg-amber-500/[0.07] text-amber-400" },
  { nom: "Dev & Tech",       pct: 12, etudiants: 6,  couleur: "border-violet-500/30 bg-violet-500/[0.07] text-violet-400" },
]

type Urgence = "rouge" | "orange" | "jaune"

const inactifs: { nom: string; niveau: string; secteur: string; jours: number; urgence: Urgence }[] = [
  { nom: "Étudiant A", niveau: "Master 1 Data",     secteur: "Finance",   jours: 8,  urgence: "rouge" },
  { nom: "Étudiant B", niveau: "Bachelor Data",     secteur: "Marketing", jours: 5,  urgence: "orange" },
  { nom: "Étudiant C", niveau: "Master 2 Finance",  secteur: "Banque",    jours: 12, urgence: "rouge" },
  { nom: "Étudiant D", niveau: "Master 1 Commerce", secteur: "Conseil",   jours: 3,  urgence: "jaune" },
  { nom: "Étudiant E", niveau: "Bachelor Marketing", secteur: "Luxe",     jours: 7,  urgence: "orange" },
]

const urgenceBadge: Record<Urgence, { label: string; classes: string }> = {
  rouge:  { label: "Relance recommandée", classes: "bg-red-500/10 text-red-400 border-red-500/25" },
  orange: { label: "À surveiller",        classes: "bg-orange-500/10 text-orange-400 border-orange-500/25" },
  jaune:  { label: "Récent",              classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25" },
}

const placements = [
  { initiales: "BNP", niveau: "Master 1",  couleur: "bg-emerald-500/20 text-emerald-400" },
  { initiales: "RNL", niveau: "Bachelor",  couleur: "bg-yellow-500/20 text-yellow-400" },
  { initiales: "LOR", niveau: "Master 2",  couleur: "bg-amber-500/20 text-amber-400" },
  { initiales: "DEC", niveau: "Bachelor",  couleur: "bg-blue-500/20 text-blue-400" },
  { initiales: "SNCF", niveau: "Master 1", couleur: "bg-red-500/20 text-red-400" },
  { initiales: "ACC", niveau: "Master 2",  couleur: "bg-violet-500/20 text-violet-400" },
]

const offreItems = [
  "Accès illimité pour tous les étudiants alternants PSB",
  "Tableau de bord école en temps réel (cette page)",
  "Alertes étudiants inactifs",
  "Rapport mensuel d'insertion",
  "Intégration dans vos cours d'insertion professionnelle",
  "Support prioritaire",
  "Prix garanti 3 ans",
]

/* ── Composants ─────────────────────────────────────────────────────── */

function LogoAlternaAI() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-6 items-center justify-center rounded-md bg-gradient-blue">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M7 2 L11 7 L7 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 2 L3 7 L7 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5" />
        </svg>
      </div>
      <span className="font-semibold text-white text-sm tracking-tight">Alternia</span>
    </div>
  )
}

function GraphiqueActivite() {
  const [monte, setMonte] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setMonte(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const max = Math.max(...activite.map(a => a.valeur))
  const largeurBarre = 48
  const espacement = 110
  const hauteurZone = 180
  const baseline = 210

  return (
    <svg viewBox="0 0 560 250" className="w-full max-w-xl" role="img" aria-label="Candidatures par jour, du lundi au vendredi">
      {activite.map((a, i) => {
        const h = monte ? (a.valeur / max) * hauteurZone : 0
        const x = 30 + i * espacement
        const actif = a.valeur === max
        return (
          <g key={a.jour}>
            <rect
              x={x}
              width={largeurBarre}
              rx={6}
              fill="#3B82F6"
              opacity={actif ? 1 : 0.6}
              style={{
                y: baseline - h,
                height: h,
                transition: "height 1s ease-out, y 1s ease-out",
              }}
            />
            <text x={x + largeurBarre / 2} y={baseline + 22} textAnchor="middle" fill="#94A3B8" fontSize="13">
              {a.jour}
            </text>
            <text x={x + largeurBarre / 2} y={baseline - h - 8} textAnchor="middle" fill="#E2E8F0" fontSize="13" fontWeight="600" opacity={monte ? 1 : 0} style={{ transition: "opacity 0.4s ease-out 0.8s" }}>
              {a.valeur}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function PageEcole() {
  const [dateJour, setDateJour] = useState("")
  useEffect(() => {
    setDateJour(new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))
  }, [])

  const maxEntreprise = Math.max(...entreprises.map(e => e.count))
  const card = "rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm"

  return (
    <div className="min-h-screen bg-[#080D1A] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#080D1A]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
          <LogoAlternaAI />
          <div className="text-center">
            <p className="text-sm font-medium text-white">Tableau de bord · Paris School of Business</p>
            {dateJour && <p className="text-xs text-[#94A3B8] capitalize">{dateJour}</p>}
          </div>
          <span className="self-center rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400 sm:self-auto">
            Aperçu partenariat
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {/* Stats */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(s => (
            <div key={s.label} className={`${card} p-5`}>
              <div className="mb-3 flex size-8 items-center justify-center rounded-md border border-blue-500/20 bg-blue-500/10">
                <s.icon className="size-4 text-blue-400" />
              </div>
              <p className="text-3xl font-semibold tracking-tight">{s.value}</p>
              <p className="mt-1 text-sm text-[#94A3B8]">{s.label}</p>
              <p className="mt-2 text-xs font-medium text-emerald-400">{s.delta}</p>
            </div>
          ))}
        </section>

        {/* Activité */}
        <section className={`${card} p-6`}>
          <h2 className="mb-4 text-base font-semibold">Activité cette semaine</h2>
          <p className="mb-2 text-xs text-[#94A3B8]">Candidatures envoyées par jour</p>
          <GraphiqueActivite />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top entreprises */}
          <section className={`${card} p-6`}>
            <h2 className="mb-5 text-base font-semibold">Entreprises les plus contactées par les étudiants PSB</h2>
            <ul className="space-y-3.5">
              {entreprises.map(e => (
                <li key={e.nom} className="flex items-center gap-3">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${e.couleur}`}>
                    {e.initiales}
                  </span>
                  <span className="w-36 shrink-0 truncate text-sm text-zinc-300">{e.nom}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${(e.count / maxEntreprise) * 100}%` }} />
                  </div>
                  <span className="w-7 shrink-0 text-right text-sm font-medium text-white">{e.count}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Secteurs */}
          <section className={`${card} p-6`}>
            <h2 className="mb-5 text-base font-semibold">Secteurs visés par les étudiants PSB</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {secteurs.map(s => (
                <div key={s.nom} className={`rounded-lg border p-4 ${s.couleur}`}>
                  <p className="text-2xl font-semibold">{s.pct}%</p>
                  <p className="mt-0.5 text-sm text-zinc-300">{s.nom}</p>
                  <p className="mt-1 text-xs text-[#94A3B8]">{s.etudiants} étudiants</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Étudiants inactifs */}
        <section className={`${card} p-6`}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">Étudiants sans activité cette semaine</h2>
            <span className="flex items-center gap-1.5 rounded-full border border-orange-500/25 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
              <AlertTriangle className="size-3" />
              {inactifs.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-white/[0.06] text-xs uppercase tracking-wide text-[#94A3B8]">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Étudiant</th>
                  <th className="pb-3 pr-4 font-medium">Formation</th>
                  <th className="pb-3 pr-4 font-medium">Secteur visé</th>
                  <th className="pb-3 pr-4 font-medium">Inactivité</th>
                  <th className="pb-3 pr-4 font-medium">Statut</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {inactifs.map(e => {
                  const badge = urgenceBadge[e.urgence]
                  return (
                    <tr key={e.nom}>
                      <td className="py-3 pr-4 font-medium text-white">{e.nom}</td>
                      <td className="py-3 pr-4 text-zinc-400">{e.niveau}</td>
                      <td className="py-3 pr-4 text-zinc-400">{e.secteur}</td>
                      <td className="py-3 pr-4 text-zinc-400">Inactif depuis {e.jours} jours</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.classes}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3">
                        <span title="Disponible dans le plan École" className="inline-block cursor-not-allowed">
                          <button
                            disabled
                            className="pointer-events-none rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-500"
                          >
                            Envoyer un rappel
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Placements */}
        <section className={`${card} p-6`}>
          <h2 className="mb-5 text-base font-semibold">12 étudiants PSB ont trouvé leur alternance ce mois</h2>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {placements.map(p => (
              <div key={p.initiales} className="flex flex-col items-center gap-2">
                <span className={`flex size-12 items-center justify-center rounded-lg text-xs font-semibold ${p.couleur}`}>
                  {p.initiales}
                </span>
                <span className="text-xs text-[#94A3B8]">{p.niveau}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Offre */}
        <section className="rounded-xl border border-blue-500/40 bg-blue-500/[0.05] p-6 shadow-[0_0_40px_-12px_rgba(59,130,246,0.4)] sm:p-8">
          <h2 className="text-xl font-semibold">Plan École — 299€ / an</h2>
          <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {offreItems.map(item => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <Check className="mt-0.5 size-4 shrink-0 text-blue-400" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <a
              href="mailto:iliesme608@gmail.com?subject=Partenariat%20Alternia%20PSB"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-400"
            >
              <Mail className="size-4" />
              Démarrer le partenariat
            </a>
            <p className="mt-3 text-xs text-[#94A3B8]">
              Ou me contacter directement : iliesme608@gmail.com · 06 52 91 46 95
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/[0.06] pt-6 text-center">
          <p className="mx-auto max-w-2xl text-xs leading-relaxed text-[#94A3B8]/70">
            Ces données sont calculées en temps réel depuis l&apos;activité des étudiants PSB sur Alternia.
            Ce tableau de bord est inclus dans le plan École à 299€/an.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md px-3 py-1.5 text-xs text-[#94A3B8]/60 transition-colors hover:text-white"
          >
            ← Retour au site
          </Link>
        </footer>
      </main>
    </div>
  )
}
