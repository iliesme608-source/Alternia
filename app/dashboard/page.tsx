"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { supabase } from "@/lib/supabase"
import {
  MessageSquare,
  FileText,
  Search,
  Trophy,
  Send,
  CheckCircle,
  Circle,
  ArrowRight,
  TrendingUp,
  Zap,
} from "lucide-react"
import { AgentChat } from "@/components/shared/AgentChat"
import { AgentAvatarById } from "@/components/agents/AgentAvatars"

interface Stats {
  nbEntretiens: number
  scoreMoyen: number | null
  nbCvAnalyses: number
  nbEmailsEnvoyes: number
}

interface HistoriqueItem {
  id: string
  entreprise: string
  poste: string
  score: number | null
  created_at: string
}

function calcXP(s: Stats) {
  return s.nbEntretiens * 150 + s.nbCvAnalyses * 80 + s.nbEmailsEnvoyes * 40
}

function getLevel(xp: number) {
  if (xp < 200)  return { level: 1, name: "Nouveau candidat",      nextXP: 200 }
  if (xp < 500)  return { level: 2, name: "Candidat motivé",       nextXP: 500 }
  if (xp < 1000) return { level: 3, name: "Chasseur d'alternance", nextXP: 1000 }
  if (xp < 2000) return { level: 4, name: "Profil attractif",      nextXP: 2000 }
  if (xp < 4000) return { level: 5, name: "Alternant prêt",        nextXP: 4000 }
  return         { level: 6, name: "Alternant recruté",             nextXP: 10000 }
}

const teamAgents = [
  { id: "alex",  name: "Alex",  action: "Analyse ton CV",               status: "active" as const, href: "/cv" },
  { id: "sarah", name: "Sarah", action: "Prospection en cours",          status: "active" as const, href: "/prospection" },
  { id: "lucas", name: "Lucas", action: "Attend ton prochain entretien", status: "idle"   as const, href: "/entretien" },
  { id: "emma",  name: "Emma",  action: "Surveille tes candidatures",    status: "idle"   as const, href: "/dashboard" },
]

function StatCard({ icon: Icon, label, value, delay }: {
  icon: React.ElementType
  label: string
  value: string | number
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      className="surface p-5"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex size-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03]">
          <Icon className="size-3.5 text-zinc-500" />
        </div>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
    </motion.div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ nbEntretiens: 0, scoreMoyen: null, nbCvAnalyses: 0, nbEmailsEnvoyes: 0 })
  const [historique, setHistorique] = useState<HistoriqueItem[]>([])
  const [prenom, setPrenom] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user || cancelled) { setLoading(false); return }

      const userId = session.user.id
      const meta = session.user.user_metadata
      if (meta?.prenom) setPrenom(meta.prenom)

      const [entretiens, cvAnalyses, campagnes, autopilot] = await Promise.all([
        supabase.from("entretien_sessions").select("id, entreprise, poste, score, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("cv_analyses").select("id", { count: "exact" }).eq("user_id", userId),
        supabase.from("prospection_campagnes").select("entreprises").eq("user_id", userId),
        // Candidatures Autopilot : tout statut postérieur à « ready » signifie que
        // l'email est parti (cf. STATUTS_ENVOYES dans lib/suivi.ts).
        supabase
          .from("application_packages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("status", ["sent", "follow_up", "interview", "rejected", "accepted"]),
      ])

      if (cancelled) return

      const sessions = entretiens.data ?? []
      const scores = sessions.map((s) => s.score).filter((s): s is number => s !== null)
      const scoreMoyen = scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null

      let prospectionSent = 0
      for (const c of campagnes.data ?? []) {
        const ents = c.entreprises as Array<{ statut: string }> | null
        if (Array.isArray(ents)) prospectionSent += ents.filter((e) => e.statut === "envoye" || e.statut === "repondu").length
      }
      const nbEmailsEnvoyes = prospectionSent + (autopilot.count ?? 0)

      setStats({ nbEntretiens: sessions.length, scoreMoyen, nbCvAnalyses: cvAnalyses.count ?? 0, nbEmailsEnvoyes })
      setHistorique(sessions.slice(0, 6) as HistoriqueItem[])
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  const xp = calcXP(stats)
  const { level, name: levelName, nextXP } = getLevel(xp)
  const xpProgress = Math.min((xp / nextXP) * 100, 100)

  const missions = [
    { label: "Analyser un CV",            done: stats.nbCvAnalyses > 0,    href: "/cv",          xpReward: 80 },
    { label: "Envoyer 3 candidatures",    done: stats.nbEmailsEnvoyes >= 3, href: "/prospection", xpReward: 120 },
    { label: "Faire un entretien simulé", done: stats.nbEntretiens > 0,     href: "/entretien",   xpReward: 150 },
    { label: "Relancer une entreprise",   done: false,                       href: "/prospection", xpReward: 60 },
  ]
  const missionsDone = missions.filter((m) => m.done).length
  const missionsProgress = Math.round((missionsDone / missions.length) * 100)

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">
      <div className="mb-8">
        <AgentChat
          agentName="Emma" agentEmoji="📅" agentTitle="Agent Organisation"
          agentDescription="Je suis ta copilote quotidienne. Je suis tes candidatures et te rappelle les actions importantes."
          features={["Missions du jour", "Suivi des candidatures", "Rappels automatiques"]}
          userMessage="Emma, où en suis-je dans ma recherche ?"
          agentMessage="Bonjour Iliès ! Tu as complété 2 missions sur 4 aujourd'hui. Encore 2 efforts et tu passes niveau 7 ! 💪"
          accentColor="#7C3AED"
        />
      </div>

      {/* QG Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="surface p-5 mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex-1">
            <h1 className="text-4xl font-semibold tracking-tight text-white mb-1">
              {prenom ? `Bonjour ${prenom}` : "Bonjour"}
            </h1>
            <p className="text-sm text-zinc-500">Ton QG Alternance</p>
          </div>

          {/* XP block */}
          <div className="sm:shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/[0.06] bg-white/[0.03]"
              >
                <Zap className="size-3 text-blue-500" />
                <span className="text-xs font-medium text-zinc-300">Niv. {level} · {levelName}</span>
              </div>
              <span className="text-xs text-zinc-600">{xp} / {nextXP} XP</span>
            </div>
            <div className="w-full sm:w-52 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress}%` }}
                transition={{ duration: 1.2, delay: 0.5, ease: "easeOut" }}
                className="h-full rounded-full bg-blue-600"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Team + Missions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Équipe */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="surface p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <h2 className="text-sm font-medium text-zinc-400">Ton équipe</h2>
          </div>
          <div className="space-y-0.5">
            {teamAgents.map((agent) => (
              <Link
                key={agent.name}
                href={agent.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.04] transition-colors group"
              >
                <div
                  className="flex size-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03] shrink-0"
                >
                  <AgentAvatarById agentId={agent.id} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{agent.name}</span>
                  <p className="text-xs text-zinc-500 truncate">{agent.action}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className="size-1.5 rounded-full"
                    style={{ background: agent.status === "active" ? "#22C55E" : "rgba(255,255,255,0.15)" }}
                  />
                  <ArrowRight className="size-3 text-zinc-700 group-hover:text-zinc-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Missions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="surface p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-400">Missions du jour</h2>
            <span className="text-xs text-zinc-600">{missionsDone}/{missions.length}</span>
          </div>

          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mb-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${missionsProgress}%` }}
              transition={{ duration: 1.2, delay: 0.7, ease: "easeOut" }}
              className="h-full rounded-full bg-blue-600"
            />
          </div>

          <div className="space-y-0.5">
            {missions.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.04] transition-colors group"
              >
                {m.done
                  ? <CheckCircle className="size-4 text-emerald-500 shrink-0" />
                  : <Circle className="size-4 text-zinc-700 shrink-0" />
                }
                <span className={`text-sm flex-1 ${m.done ? "text-zinc-600 line-through" : "text-zinc-300"}`}>
                  {m.label}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded border shrink-0 ${
                  m.done
                    ? "text-zinc-700 border-white/[0.04] bg-transparent"
                    : "text-blue-400 border-blue-500/20 bg-blue-500/[0.08]"
                }`}>
                  +{m.xpReward} XP
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" id="main-feature">
        <StatCard icon={MessageSquare} label="Entretiens"     value={loading ? "—" : stats.nbEntretiens} delay={0.20} />
        <StatCard icon={Trophy}        label="Score moyen"   value={loading ? "—" : stats.scoreMoyen !== null ? `${stats.scoreMoyen}/10` : "—"} delay={0.25} />
        <StatCard icon={FileText}      label="CV analysés"   value={loading ? "—" : stats.nbCvAnalyses} delay={0.30} />
        <StatCard icon={Send}          label="Emails envoyés" value={loading ? "—" : stats.nbEmailsEnvoyes} delay={0.35} />
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.4 }}
        className="mb-8"
      >
        <p className="text-xs font-medium text-zinc-600 uppercase tracking-widest mb-3">Actions rapides</p>
        <div className="flex flex-wrap gap-2">
          {[
            { icon: MessageSquare, label: "Parler à Lucas",          href: "/entretien" },
            { icon: FileText,      label: "Optimiser mon CV",        href: "/cv" },
            { icon: Search,        label: "Trouver des entreprises", href: "/prospection" },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="pill-btn pill-btn-ghost"
            >
              <a.icon className="size-3.5" />
              {a.label}
            </Link>
          ))}
        </div>
      </motion.div>

      {/* History */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.45 }}
      >
        <p className="text-xs font-medium text-zinc-600 uppercase tracking-widest mb-3 flex items-center gap-2">
          <TrendingUp className="size-3" />
          Historique
        </p>

        {loading ? (
          <div className="surface h-24 flex items-center justify-center">
            <div className="flex items-center gap-2 text-zinc-600 text-xs">
              <div className="size-1.5 rounded-full bg-blue-600 animate-pulse" />
              Chargement…
            </div>
          </div>
        ) : historique.length === 0 ? (
          <div className="surface p-12 text-center">
            <div className="flex size-9 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] mx-auto mb-4">
              <MessageSquare className="size-4 text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-500 mb-6">Aucun entretien pour l&apos;instant.</p>
            <Link href="/entretien" className="pill-btn pill-btn-primary" style={{ display: "inline-flex" }}>
              Lancer Lucas, coach entretien
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : (
          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  {["Date", "Poste", "Entreprise", "Score"].map((h) => (
                    <th key={h} className={`px-5 py-3 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-widest ${h === "Entreprise" ? "hidden sm:table-cell" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {historique.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-zinc-500 text-xs whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-5 py-3 text-white text-sm truncate max-w-[140px]">{item.poste || "—"}</td>
                    <td className="px-5 py-3 text-zinc-500 hidden sm:table-cell truncate max-w-[120px]">{item.entreprise || "—"}</td>
                    <td className="px-5 py-3">
                      {item.score === null ? (
                        <span className="text-zinc-700 text-xs">—</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded border border-white/[0.06] bg-white/[0.03] text-zinc-300">
                          {item.score}/10
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}
