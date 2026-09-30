"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { supabase } from "@/lib/supabase"
import { AgentChat } from "@/components/shared/AgentChat"
import { EnvoiEmailModal } from "@/components/shared/EnvoiEmailModal"
import { EnvoiGmailModal } from "@/components/shared/EnvoiGmailModal"
import { useGmailConnection } from "@/lib/gmail-client"
import {
  Building2, MapPin, Calendar, Loader2, LogIn, Inbox,
  Send, Bell, CalendarCheck, Check, X, Archive, Layers, TrendingUp, CalendarDays,
  Copy, ExternalLink, Mail, FileText,
} from "lucide-react"
import {
  isSuiviStatut,
  SUIVI_STATUTS,
  SUIVI_STATUT_CLASSES,
  SUIVI_STATUT_DOT,
  SUIVI_FROM_APP_STATUS,
  APP_STATUS_FROM_SUIVI,
  SUIVI_FROM_TRACKING,
  TRACKING_FROM_SUIVI,
  STATUTS_ENVOYES,
  STATUTS_ENTRETIEN,
  parseEmail,
  gmailUrl,
  mailtoUrl,
  fullEmailText,
  type SuiviStatut,
} from "@/lib/suivi"
import type { ApplicationStatus, CandidatureSuivi } from "@/types"

type LoadState = "loading" | "ready" | "unauthenticated" | "error"

/** D'où vient la candidature — détermine l'API appelée pour changer son statut. */
type Source = "prospection" | "autopilot" | "cible"

const SOURCE_LABEL: Record<Source, string> = {
  prospection: "Prospection",
  autopilot:   "Autopilot",
  cible:       "Entreprise ciblée",
}

/** Une candidature normalisée, toutes tables confondues. */
interface SuiviItem {
  key: string        // unique dans la liste fusionnée
  refId: string      // identifiant attendu par l'API de mise à jour
  source: Source
  entreprise: string
  ville: string
  poste: string
  date: string
  statut: SuiviStatut
  // Message de candidature déjà généré, s'il existe (prospection : email_genere,
  // Autopilot : email_subject + email_body). Vide pour une entreprise ciblée
  // dont aucune candidature n'a encore été rédigée.
  messageObjet: string
  messageCorps: string
}

/** Email de relance généré pour une card — panneau dépliable sous celle-ci. */
interface Relance {
  loading: boolean
  objet: string
  corps: string
  error: string
}

// ── Actions proposées sur chaque card ─────────────────────────────────────────

const ACTIONS: { statut: SuiviStatut; label: string; Icon: typeof Send }[] = [
  { statut: "Envoyée",         label: "Envoyée",   Icon: Send },
  { statut: "Relance à faire", label: "Relance",   Icon: Bell },
  { statut: "Entretien",       label: "Entretien", Icon: CalendarCheck },
  { statut: "Accepté",         label: "Accepté",   Icon: Check },
  { statut: "Refus",           label: "Refus",     Icon: X },
  { statut: "Archivée",        label: "Archiver",  Icon: Archive },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

/** Lundi 00:00 de la semaine en cours. */
function debutDeSemaine() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CandidaturesPage() {
  const [state, setState]         = useState<LoadState>("loading")
  const [items, setItems]         = useState<SuiviItem[]>([])
  const [onglet, setOnglet]       = useState<SuiviStatut | "Toutes">("Toutes")
  const [updatingKey, setUpdating] = useState<string | null>(null)
  const [prenom, setPrenom]       = useState("")
  // Emails de relance générés, indexés par item.key.
  const [relances, setRelances]   = useState<Record<string, Relance>>({})
  // Panneau déployé sur chaque card, indexé par item.key — une seule card à la fois.
  const [openPanels, setOpenPanels] = useState<Map<string, "message" | null>>(new Map())
  // Candidature dont la modal « Envoyer depuis mon Gmail » est ouverte (une à la fois).
  const [gmailItem, setGmailItem] = useState<SuiviItem | null>(null)
  const gmail = useGmailConnection()

  // ── Chargement : prospection_campagnes + application_packages + company_targets ──
  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session?.user || !session.access_token) {
        setState("unauthenticated")
        return
      }
      const token = session.access_token
      const auth = { Authorization: `Bearer ${token}` }
      setPrenom((session.user.user_metadata?.prenom as string | undefined) ?? "")

      try {
        const [prospectionRes, autopilotRes, ciblesRes] = await Promise.all([
          // Campagnes de prospection, déjà mises à plat par l'API.
          fetch("/api/prospection/list", { headers: auth })
            .then(r => (r.ok ? r.json() : { candidatures: [] }))
            .catch(() => ({ candidatures: [] })),
          // Candidatures Autopilot (application_packages + entreprise jointe).
          fetch("/api/autopilot/list-applications", {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: "{}",
          })
            .then(r => (r.ok ? r.json() : { applications: [] }))
            .catch(() => ({ applications: [] })),
          // Entreprises ciblées — la table peut ne pas exister (migration non jouée).
          supabase
            .from("company_targets")
            .select("*")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false }),
        ])

        if (cancelled) return

        const merged: SuiviItem[] = []

        // 1. Prospection — statut de suivi déjà normalisé par l'API.
        for (const c of (prospectionRes.candidatures ?? []) as CandidatureSuivi[]) {
          // L'email généré est stocké en un seul bloc : on en extrait l'objet.
          const { objet, corps } = parseEmail(
            c.email_genere ?? "",
            `Candidature en alternance chez ${c.entreprise}`,
          )
          merged.push({
            key:        `prospection-${c.id}`,
            refId:      c.id,
            source:     "prospection",
            entreprise: c.entreprise,
            ville:      c.ville,
            poste:      c.poste,
            date:       c.created_at,
            statut:     isSuiviStatut(c.statut) ? c.statut : "Prête",
            messageObjet: corps ? objet : "",
            messageCorps: corps,
          })
        }

        // 2. Autopilot — application_packages.status → statut de suivi.
        type AppRow = {
          id: string
          company_target_id: string
          status: ApplicationStatus
          company_name: string
          city: string | null
          created_at: string
          email_subject: string
          email_body: string
          linkedin_message: string
        }
        const applications = (autopilotRes.applications ?? []) as AppRow[]
        // Les entreprises déjà couvertes par un package ne sont pas ré-affichées.
        const couvertes = new Set(applications.map(a => a.company_target_id).filter(Boolean))

        for (const a of applications) {
          // email_body est le message de candidature ; à défaut, le message LinkedIn.
          const corps = (a.email_body || a.linkedin_message || "").trim()
          merged.push({
            key:        `autopilot-${a.id}`,
            refId:      a.id,
            source:     "autopilot",
            entreprise: a.company_name,
            ville:      a.city ?? "",
            poste:      "Alternance",
            date:       a.created_at,
            statut:     SUIVI_FROM_APP_STATUS[a.status] ?? "Prête",
            messageObjet: (a.email_subject ?? "").trim(),
            messageCorps: corps,
          })
        }

        // 3. company_targets sans candidature générée — statut_suivi sinon tracking_status.
        type CibleRow = {
          id: string
          company_name: string
          city: string | null
          possible_role: string | null
          tracking_status: string | null
          statut_suivi: string | null
          created_at: string
        }
        for (const t of ((ciblesRes.data ?? []) as CibleRow[])) {
          if (couvertes.has(t.id)) continue
          merged.push({
            key:        `target-${t.id}`,
            refId:      t.id,
            source:     "cible",
            entreprise: t.company_name,
            ville:      t.city ?? "",
            poste:      t.possible_role || "Alternance",
            date:       t.created_at,
            statut:
              (isSuiviStatut(t.statut_suivi) && t.statut_suivi) ||
              SUIVI_FROM_TRACKING[t.tracking_status ?? ""] ||
              "Prête",
            // Aucune candidature générée pour ces entreprises : pas de message.
            messageObjet: "",
            messageCorps: "",
          })
        }

        merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        // TEMPORAIRE — diagnostic des clés en double, à retirer.
        console.log("keys", merged.map(i => i.key), "uniques", new Set(merged.map(i => i.key)).size, "/", merged.length)
        setItems(merged)
        setState("ready")
      } catch {
        if (!cancelled) setState("error")
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // ── Changement de statut — route vers l'API de la bonne table ──────────────
  async function changeStatut(item: SuiviItem, statut: SuiviStatut) {
    if (item.statut === statut) return
    setUpdating(item.key)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      let ok = false

      if (item.source === "prospection") {
        const res = await fetch("/api/prospection/update-status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: item.refId, statut }),
        })
        ok = res.ok
      } else if (item.source === "autopilot") {
        const res = await fetch("/api/autopilot/update-status", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            applicationPackageId: item.refId,
            status: APP_STATUS_FROM_SUIVI[statut],
          }),
        })
        ok = res.ok
      } else {
        // company_targets : statut complet + tracking_status (lossy) pour l'Autopilot.
        const tracking = TRACKING_FROM_SUIVI[statut]
        const { error } = await supabase
          .from("company_targets")
          .update({ statut_suivi: statut, tracking_status: tracking })
          .eq("id", item.refId)
        if (error) {
          // Colonne statut_suivi absente (migration candidatures_suivi_global.sql
          // non jouée) → on retombe sur tracking_status seul.
          const retry = await supabase
            .from("company_targets")
            .update({ tracking_status: tracking })
            .eq("id", item.refId)
          ok = !retry.error
        } else {
          ok = true
        }
      }

      if (ok) {
        setItems(prev => prev.map(i => (i.key === item.key ? { ...i, statut } : i)))
      }
    } catch {
      /* silencieux — l'utilisateur peut réessayer */
    }
    setUpdating(null)
  }

  // ── Email de relance — généré par Claude Haiku côté API ────────────────────
  async function genererRelance(item: SuiviItem) {
    setRelances(prev => ({
      ...prev,
      [item.key]: { loading: true, objet: "", corps: "", error: "" },
    }))
    try {
      const res = await fetch("/api/candidatures/relance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entreprise:  item.entreprise,
          poste:       item.poste,
          prenom,
          dateContact: fmtDate(item.date),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.email) {
        throw new Error(data.error || "Génération impossible")
      }
      const { objet, corps } = parseEmail(
        data.email,
        `Relance de ma candidature en alternance chez ${item.entreprise}`,
      )
      setRelances(prev => ({
        ...prev,
        [item.key]: { loading: false, objet, corps, error: "" },
      }))
    } catch {
      setRelances(prev => ({
        ...prev,
        [item.key]: {
          loading: false, objet: "", corps: "",
          error: "Impossible de générer la relance. Réessaie dans un instant.",
        },
      }))
    }
  }

  /** Une action de card : change le statut, et génère l'email pour « Relance à faire ». */
  async function handleAction(item: SuiviItem, statut: SuiviStatut) {
    await changeStatut(item, statut)
    if (statut === "Relance à faire") await genererRelance(item)
  }

  /** Ouvre / referme le panneau « Voir le message » d'une card. */
  function togglePanel(key: string, panel: "message") {
    console.log('[togglePanel] key:', key, 'panel:', panel)
    setOpenPanels(prev => {
      const next = new Map(prev)
      next.set(key, next.get(key) === panel ? null : panel)
      console.log('[togglePanel] openPanels after:', [...next.entries()])
      return next
    })
  }

  function fermerRelance(key: string) {
    setRelances(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const envoyees   = items.filter(i => STATUTS_ENVOYES.includes(i.statut)).length
    const entretiens = items.filter(i => STATUTS_ENTRETIEN.includes(i.statut)).length
    const lundi      = debutDeSemaine()
    const semaine    = items.filter(i => {
      const t = new Date(i.date).getTime()
      return !Number.isNaN(t) && t >= lundi
    }).length
    return {
      total: items.length,
      envoyees,
      entretiens,
      taux: envoyees > 0 ? Math.round((entretiens / envoyees) * 100) : 0,
      semaine,
    }
  }, [items])

  const compte = (s: SuiviStatut) => items.filter(i => i.statut === s).length
  const visibles = onglet === "Toutes" ? items : items.filter(i => i.statut === onglet)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-6xl mx-auto px-6 lg:px-10 py-10 min-h-[calc(100vh-56px)]">

      {/* Bannière agent */}
      <div className="mb-8">
        <AgentChat
          agentName="Emma"
          agentEmoji="📅"
          agentTitle="Agent Organisation"
          agentDescription="Je rassemble toutes tes candidatures au même endroit : prospection, Autopilot et entreprises ciblées."
          features={[
            "Toutes tes candidatures réunies",
            "Statut modifiable en un clic",
            "Taux de réponse en temps réel",
          ]}
          userMessage="Emma, où en sont mes candidatures ?"
          agentMessage="Je suis là pour suivre toutes tes candidatures 📅"
        />
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Suivi des candidatures</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Toutes tes candidatures, quelle que soit leur origine.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard
          Icon={Layers}
          label="Total candidatures"
          value={String(stats.total)}
          detail={`${stats.envoyees} envoyée${stats.envoyees !== 1 ? "s" : ""}`}
          color="#3B82F6"
        />
        <StatCard
          Icon={TrendingUp}
          label="Taux de réponse"
          value={`${stats.taux} %`}
          detail={`${stats.entretiens} entretien${stats.entretiens !== 1 ? "s" : ""} / ${stats.envoyees} envoyée${stats.envoyees !== 1 ? "s" : ""}`}
          color="#7C3AED"
        />
        <StatCard
          Icon={CalendarDays}
          label="Cette semaine"
          value={String(stats.semaine)}
          detail="depuis lundi"
          color="#22C55E"
        />
      </div>

      {/* Onglets par statut */}
      {state === "ready" && items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {(["Toutes", ...SUIVI_STATUTS] as const).map(s => {
            const actif = onglet === s
            return (
              <button
                key={s}
                onClick={() => setOnglet(s)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                  actif
                    ? "border-white/[0.16] bg-white/[0.08] text-white"
                    : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s !== "Toutes" && (
                  <span className="size-1.5 rounded-full" style={{ background: SUIVI_STATUT_DOT[s] }} />
                )}
                {s}
                <span className="text-zinc-600">{s === "Toutes" ? items.length : compte(s)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* États */}
      {state === "loading" && (
        <div className="flex items-center justify-center py-16 text-zinc-500 text-sm gap-2">
          <Loader2 className="size-4 animate-spin" />
          Chargement de tes candidatures…
        </div>
      )}

      {state === "unauthenticated" && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-blue-500/10">
            <LogIn className="size-5 text-blue-400" />
          </div>
          <p className="text-white font-medium">Connexion requise</p>
          <p className="text-sm text-zinc-500 max-w-xs">
            Connecte-toi pour retrouver toutes tes candidatures au même endroit.
          </p>
          <Link
            href="/login"
            className="bg-gradient-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold glow-blue-sm hover:opacity-90 transition-opacity"
          >
            Se connecter
          </Link>
        </div>
      )}

      {state === "error" && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-300">
          Impossible de charger les candidatures. Réessaie dans un instant.
        </div>
      )}

      {state === "ready" && items.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-white/[0.04]">
            <Inbox className="size-5 text-zinc-500" />
          </div>
          <p className="text-white font-medium">Aucune candidature pour l&apos;instant</p>
          <p className="text-sm text-zinc-500 max-w-sm">
            Lance une prospection ou l&apos;Autopilot : tes candidatures apparaîtront ici automatiquement.
          </p>
          <div className="flex gap-2">
            <Link
              href="/prospection"
              className="rounded-xl px-5 py-2.5 text-sm border border-white/10 text-zinc-300 hover:bg-white/5 transition-colors"
            >
              Prospection
            </Link>
            <Link
              href="/autopilot"
              className="bg-gradient-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold glow-blue-sm hover:opacity-90 transition-opacity"
            >
              Autopilot
            </Link>
          </div>
        </div>
      )}

      {/* Liste */}
      {state === "ready" && visibles.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visibles.map(item => (
            <CandidatureCard
              key={item.key}
              item={item}
              prenom={prenom}
              onStatut={handleAction}
              updating={updatingKey === item.key}
              relance={relances[item.key]}
              onRegenerer={() => genererRelance(item)}
              onFermerRelance={() => fermerRelance(item.key)}
              messageOuvert={openPanels.get(item.key) === "message"}
              onToggleMessage={() => togglePanel(item.key, "message")}
              gmailConnecte={gmail.connected}
              onEnvoyerGmail={() => setGmailItem(item)}
            />
          ))}
        </div>
      )}

      {state === "ready" && items.length > 0 && visibles.length === 0 && (
        <p className="text-sm text-zinc-600 text-center py-10">
          Aucune candidature avec le statut « {onglet} ».
        </p>
      )}

      {gmailItem && gmail.address && (
        <EnvoiGmailModal
          onClose={() => setGmailItem(null)}
          entreprise={gmailItem.entreprise}
          objetInitial={gmailItem.messageObjet}
          corpsInitial={gmailItem.messageCorps}
          adresseGmail={gmail.address}
          prenom={prenom}
          onSent={() => handleAction(gmailItem, "Envoyée")}
        />
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  Icon, label, value, detail, color,
}: {
  Icon: typeof Layers
  label: string
  value: string
  detail: string
  color: string
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 flex items-center gap-3">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${color}1A`, border: `1px solid ${color}33` }}
      >
        <Icon className="size-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="text-xl font-semibold text-white leading-tight">{value}</p>
        <p className="text-[11px] text-zinc-600 truncate">{detail}</p>
      </div>
    </div>
  )
}

// ── Candidature card ──────────────────────────────────────────────────────────

function CandidatureCard({
  item, prenom, onStatut, updating, relance, onRegenerer, onFermerRelance,
  messageOuvert, onToggleMessage, gmailConnecte, onEnvoyerGmail,
}: {
  item: SuiviItem
  prenom: string
  onStatut: (item: SuiviItem, statut: SuiviStatut) => Promise<void>
  updating: boolean
  relance?: Relance
  onRegenerer: () => void
  onFermerRelance: () => void
  messageOuvert: boolean
  onToggleMessage: () => void
  /** L'étudiant a relié son Gmail dans /profil. */
  gmailConnecte: boolean
  /** Ouvre la modal d'envoi depuis le Gmail de l'étudiant. */
  onEnvoyerGmail: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.06]">
            <Building2 className="size-4 text-zinc-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{item.entreprise}</p>
            <p className="text-xs text-zinc-500 truncate">{item.poste}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-zinc-600">
              {item.ville && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3 shrink-0" />
                  {item.ville}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3 shrink-0" />
                {fmtDate(item.date)}
              </span>
              <span className="text-zinc-700">{SOURCE_LABEL[item.source]}</span>
            </div>
          </div>
        </div>

        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${SUIVI_STATUT_CLASSES[item.statut]}`}
        >
          {item.statut}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-4 pl-12 flex flex-wrap items-center gap-1.5">
        {ACTIONS.map(({ statut, label, Icon }) => {
          const actif = item.statut === statut
          // « Relance » reste cliquable même si le statut est déjà posé : le clic
          // sert aussi à (re)générer l'email.
          const relanceAction = statut === "Relance à faire"
          return (
            <button
              key={statut}
              type="button"
              disabled={updating || (actif && !relanceAction)}
              onClick={() => onStatut(item, statut)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors disabled:cursor-default ${
                actif
                  ? ""
                  : "border-white/[0.06] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] disabled:opacity-50"
              }`}
              style={
                actif
                  ? {
                      borderColor: `${SUIVI_STATUT_DOT[statut]}55`,
                      background: `${SUIVI_STATUT_DOT[statut]}1F`,
                      color: SUIVI_STATUT_DOT[statut],
                    }
                  : undefined
              }
            >
              {updating && !actif ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
              {label}
            </button>
          )
        })}
      </div>

      {/* Message de candidature — uniquement si un message a été généré */}
      {item.messageCorps && (
        <div className="mt-3 pl-12 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleMessage}
            aria-expanded={messageOuvert}
            className="inline-flex items-center gap-1.5 border border-white/10 text-zinc-300 rounded-lg px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
          >
            <FileText className="size-3" />
            {messageOuvert ? "Masquer le message" : "Voir le message"}
          </button>

          {gmailConnecte ? (
            <button
              type="button"
              onClick={onEnvoyerGmail}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
            >
              <Send className="size-3" />
              Envoyer depuis mon Gmail
            </button>
          ) : (
            <Link
              href="/profil"
              title="Relie ton Gmail dans ton profil pour envoyer depuis ta vraie adresse"
              className="inline-flex items-center gap-1.5 border border-white/10 text-zinc-500 rounded-lg px-3 py-1.5 text-xs hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              <Mail className="size-3" />
              Connecter mon Gmail
            </Link>
          )}
        </div>
      )}

      {messageOuvert && item.messageCorps && (
        <MessagePanel
          objet={item.messageObjet}
          corps={item.messageCorps}
          entreprise={item.entreprise}
          prenom={prenom}
          onEnvoye={() => onStatut(item, "Envoyée")}
        />
      )}

      {/* Panneau de relance */}
      {relance && (
        <RelancePanel
          relance={relance}
          entreprise={item.entreprise}
          onRegenerer={onRegenerer}
          onFermer={onFermerRelance}
        />
      )}
    </motion.div>
  )
}

// ── Panneau message de candidature ────────────────────────────────────────────

function MessagePanel({
  objet, corps, entreprise, prenom, onEnvoye,
}: {
  objet: string
  corps: string
  entreprise: string
  prenom: string
  /** Marque la candidature comme « Envoyée » après un envoi Resend réussi. */
  onEnvoye: () => void | Promise<void>
}) {
  const [copie, setCopie] = useState(false)
  const [modalOuverte, setModalOuverte] = useState(false)

  async function copier() {
    try {
      await navigator.clipboard.writeText(fullEmailText(objet, corps))
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      /* presse-papier indisponible — l'utilisateur peut sélectionner le texte */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.2 }}
      className="mt-3 ml-12 overflow-hidden"
    >
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        {objet && (
          <p className="text-xs font-bold text-white mb-2 break-words">{objet}</p>
        )}
        <p className="text-xs leading-relaxed text-zinc-400 whitespace-pre-wrap">
          {corps}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copier}
            className="inline-flex items-center gap-1.5 border border-white/10 text-zinc-300 rounded-lg px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
          >
            {copie ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            {copie ? "Copié ✓" : "Copier le message"}
          </button>
          <button
            type="button"
            onClick={() => setModalOuverte(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            <Send className="size-3" />
            Envoyer via Alternia
          </button>
          <a
            href={gmailUrl(objet, corps)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-white/10 text-zinc-300 rounded-lg px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
          >
            <ExternalLink className="size-3" />
            Ouvrir dans Gmail
          </a>
          <a
            href={mailtoUrl(objet, corps)}
            className="inline-flex items-center gap-1.5 border border-white/10 text-zinc-300 rounded-lg px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
          >
            <Mail className="size-3" />
            Ouvrir dans ma messagerie
          </a>
        </div>
      </div>

      {modalOuverte && (
        <EnvoiEmailModal
          onClose={() => setModalOuverte(false)}
          entreprise={entreprise}
          objetInitial={objet}
          corpsInitial={corps}
          prenom={prenom}
          onSent={onEnvoye}
        />
      )}
    </motion.div>
  )
}

// ── Panneau email de relance ──────────────────────────────────────────────────

function RelancePanel({
  relance, entreprise, onRegenerer, onFermer,
}: {
  relance: Relance
  entreprise: string
  onRegenerer: () => void
  onFermer: () => void
}) {
  const [copie, setCopie] = useState(false)

  async function copier() {
    try {
      await navigator.clipboard.writeText(fullEmailText(relance.objet, relance.corps))
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      /* presse-papier indisponible — l'utilisateur peut sélectionner le texte */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.2 }}
      className="mt-4 ml-12 overflow-hidden"
    >
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] p-4">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-orange-400">
            <Mail className="size-3.5 shrink-0" />
            Email de relance pour {entreprise}
          </p>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer la relance"
            className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {relance.loading && (
          <div className="flex items-center gap-2 py-4 text-xs text-zinc-500">
            <Loader2 className="size-3.5 animate-spin" />
            Rédaction de ta relance…
          </div>
        )}

        {!relance.loading && relance.error && (
          <div className="space-y-3">
            <p className="text-xs text-red-300">{relance.error}</p>
            <button
              type="button"
              onClick={onRegenerer}
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.05] transition-colors"
            >
              Réessayer
            </button>
          </div>
        )}

        {!relance.loading && !relance.error && (
          <>
            {relance.objet && (
              <p className="text-xs text-zinc-300 mb-2">
                <span className="text-zinc-600">Objet : </span>
                {relance.objet}
              </p>
            )}
            <p className="text-xs leading-relaxed text-zinc-400 whitespace-pre-wrap">
              {relance.corps}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copier}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.05] transition-colors"
              >
                {copie ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                {copie ? "Copié" : "Copier"}
              </button>
              <a
                href={gmailUrl(relance.objet, relance.corps)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-medium text-orange-300 hover:bg-orange-500/[0.16] transition-colors"
              >
                <ExternalLink className="size-3" />
                Ouvrir dans Gmail
              </a>
              <button
                type="button"
                onClick={onRegenerer}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                Régénérer
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
