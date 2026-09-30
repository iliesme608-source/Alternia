"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Building2, Calendar, ChevronDown, Loader2, LogIn, Inbox } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { EntrepriseDetails } from "@/components/prospection/EntrepriseDetails"
import { CandidatureActions } from "@/components/prospection/CandidatureActions"
import { EnvoiManuelBanner } from "@/components/prospection/EnvoiManuelBanner"
import {
  parseEmail,
  isSuiviStatut,
  SUIVI_STATUTS,
  SUIVI_STATUT_CLASSES,
  SUIVI_STATUT_DOT,
  type SuiviStatut,
} from "@/lib/suivi"
import type { CandidatureSuivi } from "@/types"

type LoadState = "loading" | "ready" | "unauthenticated" | "error"

function fmtDate(iso: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

// ── Card ──────────────────────────────────────────────────────────────────────

function CandidatureCard({
  candidature,
  onStatut,
  updating,
}: {
  candidature: CandidatureSuivi
  onStatut: (id: string, statut: SuiviStatut) => Promise<void>
  updating: boolean
}) {
  const [showEmail, setShowEmail] = useState(false)

  const statut: SuiviStatut = isSuiviStatut(candidature.statut) ? candidature.statut : "Prête"
  const { objet, corps } = parseEmail(
    candidature.email_genere,
    `Candidature spontanée en alternance chez ${candidature.entreprise}`
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.06]">
            <Building2 className="size-4 text-zinc-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{candidature.entreprise}</p>
            <p className="text-xs text-zinc-500 truncate">
              {candidature.poste}
              {candidature.ville ? ` · ${candidature.ville}` : ""}
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-zinc-600">
              <Calendar className="size-3 shrink-0" />
              Générée le {fmtDate(candidature.created_at)}
            </div>
          </div>
        </div>

        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${SUIVI_STATUT_CLASSES[statut]}`}
        >
          {statut}
        </span>
      </div>

      {/* Détails entreprise (SIREN / SIRET / NAF …) */}
      <div className="pl-12">
        <EntrepriseDetails
          siret={candidature.siret}
          siren={candidature.siren}
          naf_code={candidature.naf_code}
          ville={candidature.ville}
        />
      </div>

      {/* Email généré */}
      {candidature.email_genere && (
        <div className="mt-3 pl-12">
          <button
            type="button"
            onClick={() => setShowEmail((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronDown className={`size-3 transition-transform duration-150 ${showEmail ? "rotate-180" : ""}`} />
            {showEmail ? "Masquer l'email" : "Voir l'email"}
          </button>
          {showEmail && (
            <pre className="mt-2 text-[12px] text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 max-h-64 overflow-y-auto">
              {candidature.email_genere}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 pl-12 flex flex-wrap items-center gap-2">
        <CandidatureActions
          objet={objet}
          corps={corps}
          onMarkSent={() => onStatut(candidature.id, "Envoyée")}
          marking={updating}
          sent={statut === "Envoyée"}
        />

        <select
          value={statut}
          disabled={updating}
          onChange={(e) => onStatut(candidature.id, e.target.value as SuiviStatut)}
          className="h-8 px-2 rounded-lg text-[11px] text-zinc-300 bg-[#09090B] border border-white/[0.10] outline-none cursor-pointer disabled:opacity-50"
        >
          {SUIVI_STATUTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuiviPage() {
  const [state, setState] = useState<LoadState>("loading")
  const [candidatures, setCandidatures] = useState<CandidatureSuivi[]>([])
  const [filtre, setFiltre] = useState<SuiviStatut | "Toutes">("Toutes")
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session?.access_token) {
        setState("unauthenticated")
        return
      }
      try {
        const res = await fetch("/api/prospection/list", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (cancelled) return
        if (!res.ok) {
          setState(res.status === 401 ? "unauthenticated" : "error")
          return
        }
        const data = await res.json()
        if (cancelled) return
        setCandidatures((data.candidatures ?? []) as CandidatureSuivi[])
        setState("ready")
      } catch {
        if (!cancelled) setState("error")
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // Change le statut d'une candidature — Supabase + rafraîchissement local.
  async function updateStatut(id: string, statut: SuiviStatut) {
    setUpdatingId(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (token) {
        const res = await fetch("/api/prospection/update-status", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id, statut }),
        })
        if (res.ok) {
          setCandidatures((prev) =>
            prev.map((c) => (c.id === id ? { ...c, statut } : c))
          )
        }
      }
    } catch {
      /* silencieux — l'utilisateur peut réessayer */
    }
    setUpdatingId(null)
  }

  const visibles = filtre === "Toutes"
    ? candidatures
    : candidatures.filter((c) => c.statut === filtre)

  const compte = (s: SuiviStatut) => candidatures.filter((c) => c.statut === s).length

  return (
    <div className="w-full max-w-4xl mx-auto px-6 lg:px-10 py-10 min-h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Suivi des candidatures</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {candidatures.length} candidature{candidatures.length !== 1 ? "s" : ""} préparée
          {candidatures.length !== 1 ? "s" : ""}. Mets à jour leur statut au fil de tes envois.
        </p>
      </div>

      <EnvoiManuelBanner className="mb-6" />

      {/* Filtres */}
      {state === "ready" && candidatures.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {(["Toutes", ...SUIVI_STATUTS] as const).map((s) => {
            const actif = filtre === s
            return (
              <button
                key={s}
                onClick={() => setFiltre(s)}
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
                <span className="text-zinc-600">{s === "Toutes" ? candidatures.length : compte(s)}</span>
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
            Connecte-toi pour retrouver les candidatures préparées par Sarah.
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

      {state === "ready" && candidatures.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-white/[0.04]">
            <Inbox className="size-5 text-zinc-500" />
          </div>
          <p className="text-white font-medium">Aucune candidature pour l&apos;instant</p>
          <p className="text-sm text-zinc-500 max-w-sm">
            Lance une recherche d&apos;entreprises et génère tes premiers emails : ils apparaîtront ici.
          </p>
          <Link
            href="/prospection"
            className="bg-gradient-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold glow-blue-sm hover:opacity-90 transition-opacity"
          >
            Aller à la prospection
          </Link>
        </div>
      )}

      {/* Liste */}
      {state === "ready" && visibles.length > 0 && (
        <div className="flex flex-col gap-3">
          {visibles.map((c) => (
            <CandidatureCard
              key={c.id}
              candidature={c}
              onStatut={updateStatut}
              updating={updatingId === c.id}
            />
          ))}
        </div>
      )}

      {state === "ready" && candidatures.length > 0 && visibles.length === 0 && (
        <p className="text-sm text-zinc-600 text-center py-10">
          Aucune candidature avec le statut « {filtre} ».
        </p>
      )}
    </div>
  )
}
