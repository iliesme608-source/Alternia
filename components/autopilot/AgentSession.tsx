"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, Building2, CheckCircle2, ClipboardList, Clock, ExternalLink,
  FileText, Info, Loader2, Play, Plug, Radar, Search, Sparkles, Square, Zap,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { SECTEURS } from "@/lib/autopilot-options"

/**
 * « Active l'agent pendant 30 minutes. »
 *
 * Le travail serveur est découpé en tranches (une fonction serverless ne tourne
 * pas une heure). Ce composant enchaîne les tranches et affiche l'avancement en
 * direct. Fermer l'onglet interrompt la boucle mais ne perd rien : la session
 * reprend là où elle s'était arrêtée.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionMode = "offres" | "spontane" | "mixte"
type SessionStatus = "running" | "paused" | "finished" | "stopped" | "error"

interface LogEntry {
  at: string
  kind: "offre" | "spontane" | "recherche" | "info" | "erreur"
  label: string
  detail?: string
  url?: string
  fit?: number
}

interface Session {
  id: string
  mode: SessionMode
  duration_minutes: number
  status: SessionStatus
  log: LogEntry[]
  offers_found: number
  companies_found: number
  applications_prepared: number
  contacts_found: number
  ticks: number
  message: string
  started_at: string
  expires_at: string
}

interface Sources {
  offers: { available: boolean; label: string; hint: string | null }
  hiddenMarket: { available: boolean; label: string; hint: string | null }
}

interface Diagnosis {
  configured: boolean
  tokenOk: boolean
  referentialOk: boolean
  alternanceCodes: string[]
  alternanceLabels: string[]
  searchOk: boolean
  sampleCount: number
  sampleTitles: string[]
  error?: string
}

interface Objective {
  poste: string; secteur: string; region: string; ville: string
  niveau: string; rythme: string; date_debut: string; duree: string
}

const EMPTY_OBJECTIVE: Objective = {
  poste: "", secteur: "", region: "", ville: "", niveau: "", rythme: "", date_debut: "", duree: "",
}

const MODES: { value: SessionMode; label: string; description: string }[] = [
  {
    value: "mixte",
    label: "Les deux",
    description: "Offres publiées d'abord, puis le marché caché. La couverture la plus large.",
  },
  {
    value: "offres",
    label: "Offres publiées",
    description: "Uniquement les annonces en ligne, avec analyse d'adéquation offre par offre.",
  },
  {
    value: "spontane",
    label: "Marché caché",
    description: "Entreprises du registre public qui n'ont rien publié. ~70 % des alternances.",
  },
]

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`)
  return data as T
}

/** Pur : l'instant courant vient de l'état, jamais de Date.now() au rendu. */
function remainingLabel(expiresAt: string, now: number): string {
  if (now === 0) return "…"
  const ms = new Date(expiresAt).getTime() - now
  if (ms <= 0) return "terminée"
  const min = Math.floor(ms / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  return min > 0 ? `${min} min ${String(sec).padStart(2, "0")}s` : `${sec}s`
}

const LOG_META: Record<LogEntry["kind"], { icon: React.ReactNode; tone: string }> = {
  offre: { icon: <FileText className="size-3.5 text-[#60A5FA]" />, tone: "text-foreground" },
  spontane: { icon: <Building2 className="size-3.5 text-[#2DD4BF]" />, tone: "text-foreground" },
  recherche: { icon: <Search className="size-3.5 text-muted-foreground" />, tone: "text-muted-foreground" },
  info: { icon: <Info className="size-3.5 text-muted-foreground" />, tone: "text-muted-foreground" },
  erreur: { icon: <AlertTriangle className="size-3.5 text-amber-400" />, tone: "text-amber-300" },
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function AgentSession() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [session, setSession] = useState<Session | null>(null)
  const [sources, setSources] = useState<Sources | null>(null)
  const [durations, setDurations] = useState<number[]>([15, 30, 60, 120])

  const [mode, setMode] = useState<SessionMode>("mixte")
  const [duration, setDuration] = useState(30)
  const [objective, setObjective] = useState<Objective>(EMPTY_OBJECTIVE)

  // Horloge locale : le compte à rebours ne doit pas attendre la fin d'un tick.
  // 0 = pas encore lue (le rendu doit rester pur, on ne lit l'heure que dans un
  // callback de minuterie).
  const [now, setNow] = useState(0)

  // Diagnostic de la source d'offres — on constate ce que l'API répond
  // réellement plutôt que de supposer que les identifiants sont bons.
  const [diag, setDiag] = useState<Diagnosis | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)

  // La boucle de ticks est arrêtée proprement au démontage.
  const running = useRef(false)
  const mounted = useRef(true)

  const lire = useCallback(async () => {
    return api<{ session: Session | null; sources: Sources; durations: number[] }>(
      "/api/autopilot/agent/session",
    )
  }, [])

  // Chargement initial — les setState vivent dans le callback de la promesse.
  useEffect(() => {
    mounted.current = true
    Promise.all([
      lire(),
      // L'objectif est celui déjà réglé pour l'agent : une seule cible à tenir à jour.
      api<{ rules?: { objective?: Partial<Objective> }; suggestedObjective?: Partial<Objective> }>(
        "/api/autopilot/agent/rules",
      ).catch(() => null),
    ])
      .then(([state, rules]) => {
        if (!mounted.current) return
        setSession(state.session)
        setSources(state.sources)
        setDurations(state.durations ?? [15, 30, 60, 120])
        if (state.session) setMode(state.session.mode)

        const saved = rules?.rules?.objective ?? {}
        const hasSaved = Object.values(saved).some((v) => typeof v === "string" && v.trim())
        setObjective({ ...EMPTY_OBJECTIVE, ...(hasSaved ? saved : rules?.suggestedObjective ?? {}) })
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!mounted.current) return
        setError(e instanceof Error ? e.message : "Chargement impossible.")
        setLoading(false)
      })
    return () => { mounted.current = false }
  }, [lire])

  // Compte à rebours, une fois par seconde tant qu'une session tourne.
  useEffect(() => {
    if (session?.status !== "running") return
    const lire = () => setNow(Date.now())
    const amorce = setTimeout(lire, 0) // première lecture hors du corps de l'effet
    const id = setInterval(lire, 1000)
    return () => { clearTimeout(amorce); clearInterval(id) }
  }, [session?.status])

  /** Enchaîne les tranches de travail jusqu'à la fin de la session. */
  const boucler = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      while (running.current && mounted.current) {
        const res = await api<{ session: Session | null; continueTicking: boolean; warning?: string }>(
          "/api/autopilot/agent/session/tick",
          { method: "POST", body: "{}" },
        )
        if (!mounted.current) break
        if (res.session) setSession(res.session)
        if (res.warning) setError(res.warning)
        if (!res.continueTicking) break
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "La session s'est interrompue.")
    } finally {
      running.current = false
    }
  }, [])

  // Reprend automatiquement une session laissée en cours (onglet rouvert).
  useEffect(() => {
    if (session?.status === "running" && !running.current) boucler()
  }, [session?.status, boucler])

  useEffect(() => () => { running.current = false }, [])

  async function demarrer() {
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ session: Session }>("/api/autopilot/agent/session", {
        method: "POST",
        body: JSON.stringify({ mode, durationMinutes: duration, objective }),
      })
      setSession(res.session)
      boucler()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Démarrage impossible.")
    }
    setBusy(false)
  }

  async function tester() {
    setDiagBusy(true)
    setDiag(null)
    try {
      const res = await api<Diagnosis>("/api/autopilot/sources/diagnose", {
        method: "POST",
        body: JSON.stringify({ keywords: objective.poste || "alternance" }),
      })
      setDiag(res)
      // Une connexion qui marche débloque immédiatement le mode « offres ».
      if (res.searchOk) {
        const state = await lire()
        setSources(state.sources)
      }
    } catch (e) {
      setDiag({
        configured: false, tokenOk: false, referentialOk: false,
        alternanceCodes: [], alternanceLabels: [], searchOk: false,
        sampleCount: 0, sampleTitles: [],
        error: e instanceof Error ? e.message : "Test impossible.",
      })
    }
    setDiagBusy(false)
  }

  async function arreter() {
    setBusy(true)
    running.current = false
    try {
      await api("/api/autopilot/agent/session", { method: "DELETE" })
      const state = await lire()
      setSession(state.session)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arrêt impossible.")
    }
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Chargement de l&apos;agent…
      </div>
    )
  }

  const active = session?.status === "running"
  const objectifOk = Boolean(
    objective.poste.trim() && (objective.region.trim() || objective.ville.trim()) &&
      (mode === "offres" || objective.secteur),
  )

  return (
    <div className="flex flex-col gap-5">
      {/* ── Bandeau ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-md">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-[#2DD4BF]/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-blue ${active ? "glow-blue" : "glow-blue-sm"}`}>
              <Radar className={`size-5 text-white ${active ? "animate-pulse" : ""}`} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold sm:text-lg">Session de recherche intensive</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Tu lances l&apos;agent pour une durée donnée. Il ratisse les offres et le marché
                caché, et prépare pour chaque piste un CV adapté, une lettre et un message
                personnalisé. Il ne les envoie pas — tu gardes la main.
              </p>
            </div>
          </div>

          {active && (
            <div className="flex items-center gap-2 rounded-xl border border-[#2DD4BF]/30 bg-[#2DD4BF]/10 px-3 py-2">
              <Clock className="size-4 text-[#2DD4BF]" />
              <span className="font-mono text-sm text-[#2DD4BF]">
                {remainingLabel(session.expires_at, now)}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex animate-fade-in items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* ── Sources disponibles ──────────────────────────────────────────── */}
      {sources && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <SourceCard
            available={sources.offers.available}
            label={`Offres publiées — ${sources.offers.label}`}
            hint={
              sources.offers.hint ??
              "Agrège les annonces de nombreux sites partenaires. Chaque offre est analysée contre ton profil."
            }
          />
          <SourceCard
            available={sources.hiddenMarket.available}
            label="Marché caché — registre des entreprises"
            hint="Entreprises qui n'ont rien publié : dirigeants identifiés et candidature spontanée ciblée."
          />
        </div>
      )}

      {/* Diagnostic de la source d'offres — masqué pendant une session active. */}
      {!active && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={diagBusy}
              onClick={tester}
            >
              {diagBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
              Tester la connexion France Travail
            </Button>
            <span className="text-xs text-muted-foreground">
              Vérifie le jeton, les codes de contrat alternance et lance une vraie recherche.
            </span>
          </div>

          {diag && <DiagnosisView diag={diag} />}
        </div>
      )}

      {/* ── Session en cours ─────────────────────────────────────────────── */}
      {active ? (
        <>
          <div className="grid gap-2.5 sm:grid-cols-4">
            <Stat label="Offres repérées" value={session.offers_found} icon={<FileText className="size-3.5" />} />
            <Stat label="Entreprises ciblées" value={session.companies_found} icon={<Building2 className="size-3.5" />} />
            <Stat label="Candidatures prêtes" value={session.applications_prepared} icon={<Sparkles className="size-3.5" />} accent />
            <Stat label="Contacts trouvés" value={session.contacts_found} icon={<Zap className="size-3.5" />} />
          </div>

          <TimeBar startedAt={session.started_at} expiresAt={session.expires_at} now={now} />

          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="outline" className="gap-2" disabled={busy} onClick={arreter}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
              Arrêter la session
            </Button>
            <Button variant="ghost" className="gap-2" asChild>
              <Link href="/autopilot/suivi">
                <ClipboardList className="size-4" /> Voir les candidatures préparées
              </Link>
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Tranche {session.ticks + 1} en cours…
            </span>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Tu peux fermer cet onglet : la session se met en pause et reprend à la réouverture.
            Garde-le ouvert pour qu&apos;elle travaille en continu.
          </p>

          <LogView log={session.log} />
        </>
      ) : (
        <>
          {/* ── Configuration ──────────────────────────────────────────── */}
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
            <h3 className="mb-3.5 text-sm font-semibold">Où chercher</h3>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {MODES.map((m) => {
                const indisponible = m.value === "offres" && !sources?.offers.available
                return (
                  <button
                    key={m.value}
                    type="button"
                    disabled={indisponible}
                    onClick={() => setMode(m.value)}
                    className={`flex flex-col gap-1 rounded-xl border p-3.5 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                      mode === m.value
                        ? "border-[#3B82F6]/45 bg-[#3B82F6]/10"
                        : "border-white/[0.08] bg-white/[0.02] hover:-translate-y-px hover:border-white/20"
                    }`}
                  >
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{m.description}</span>
                    {indisponible && (
                      <span className="mt-1 text-[11px] text-amber-400">Identifiants France Travail requis</span>
                    )}
                  </button>
                )
              })}
            </div>

            <h3 className="mb-2.5 mt-5 text-sm font-semibold">Pendant combien de temps</h3>
            <div className="flex flex-wrap gap-2">
              {durations.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`rounded-xl border px-4 py-2 text-sm transition-all duration-200 ${
                    duration === d
                      ? "border-[#3B82F6]/45 bg-[#3B82F6]/15 text-[#93C5FD]"
                      : "border-white/10 text-zinc-400 hover:-translate-y-px hover:border-white/20 hover:text-white"
                  }`}
                >
                  {d >= 60 ? `${d / 60} h` : `${d} min`}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
            <h3 className="mb-3.5 text-sm font-semibold">Ce qu&apos;il cherche</h3>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Poste recherché">
                <Input
                  placeholder="Ex : Data Analyst"
                  value={objective.poste}
                  onChange={(e) => setObjective((o) => ({ ...o, poste: e.target.value }))}
                />
              </Field>
              <Field label={mode === "offres" ? "Secteur (facultatif)" : "Secteur visé"}>
                <Select
                  value={objective.secteur}
                  onValueChange={(v) => setObjective((o) => ({ ...o, secteur: v }))}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choisir un secteur" /></SelectTrigger>
                  <SelectContent>
                    {SECTEURS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Région">
                <Input
                  placeholder="Ex : Île-de-France"
                  value={objective.region}
                  onChange={(e) => setObjective((o) => ({ ...o, region: e.target.value }))}
                />
              </Field>
              <Field label="Ville">
                <Input
                  placeholder="Ex : Paris"
                  value={objective.ville}
                  onChange={(e) => setObjective((o) => ({ ...o, ville: e.target.value }))}
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button className="gap-2" disabled={busy || !objectifOk} onClick={demarrer}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Lancer l&apos;agent pour {duration >= 60 ? `${duration / 60} h` : `${duration} min`}
              </Button>
              {!objectifOk && (
                <span className="text-xs text-muted-foreground">
                  Renseigne au moins le poste, un lieu{mode !== "offres" ? " et le secteur" : ""}.
                </span>
              )}
            </div>
          </section>

          {session && (session.status === "finished" || session.status === "stopped") && (
            <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4 sm:p-5">
              <div className="mb-2.5 flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <h3 className="text-sm font-semibold">Dernière session</h3>
              </div>
              <p className="text-sm text-muted-foreground">{session.message || "Session terminée."}</p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-4">
                <Stat label="Offres repérées" value={session.offers_found} icon={<FileText className="size-3.5" />} />
                <Stat label="Entreprises ciblées" value={session.companies_found} icon={<Building2 className="size-3.5" />} />
                <Stat label="Candidatures prêtes" value={session.applications_prepared} icon={<Sparkles className="size-3.5" />} accent />
                <Stat label="Contacts trouvés" value={session.contacts_found} icon={<Zap className="size-3.5" />} />
              </div>
              <div className="mt-3">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href="/autopilot/suivi">
                    <ClipboardList className="size-3.5" /> Ouvrir mes candidatures
                  </Link>
                </Button>
              </div>
              <div className="mt-4">
                <LogView log={session.log} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function SourceCard({ available, label, hint }: { available: boolean; label: string; hint: string }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
        available ? "border-white/[0.08] bg-white/[0.02]" : "border-amber-500/25 bg-amber-500/[0.06]"
      }`}
    >
      {available ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

function DiagnosisView({ diag }: { diag: Diagnosis }) {
  const steps = [
    { ok: diag.configured, label: "Identifiants présents" },
    { ok: diag.tokenOk, label: "Jeton OAuth accepté" },
    {
      ok: diag.referentialOk,
      label: diag.referentialOk
        ? `Codes alternance résolus : ${diag.alternanceCodes.join(", ")} (${diag.alternanceLabels.join(" / ")})`
        : "Codes alternance non résolus — filtrage effectué côté Alternia",
    },
    {
      ok: diag.searchOk,
      label: diag.searchOk ? `Recherche réelle : ${diag.sampleCount} offre(s) correspondantes` : "Recherche impossible",
    },
  ]

  return (
    <div className="animate-fade-in rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <ul className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            {s.ok ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
            )}
            <span className={s.ok ? "text-foreground" : "text-amber-300"}>{s.label}</span>
          </li>
        ))}
      </ul>

      {diag.error && (
        <p className="mt-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-300">
          {diag.error}
        </p>
      )}

      {diag.sampleTitles.length > 0 && (
        <div className="mt-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Exemples remontés à l&apos;instant
          </p>
          <ul className="flex flex-col gap-0.5">
            {diag.sampleTitles.map((t, i) => (
              <li key={i} className="truncate text-xs text-muted-foreground">• {t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stat({
  label, value, icon, accent,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-3 ${
        accent ? "border-[#3B82F6]/35 bg-[#3B82F6]/10" : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? "text-[#93C5FD]" : ""}`}>{value}</p>
    </div>
  )
}

function TimeBar({
  startedAt, expiresAt, now,
}: {
  startedAt: string
  expiresAt: string
  /** Instant courant fourni par le parent — le rendu reste pur. */
  now: number
}) {
  const start = new Date(startedAt).getTime()
  const end = new Date(expiresAt).getTime()
  const pct = now === 0 || end <= start
    ? 0
    : Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#2DD4BF] to-[#3B82F6] transition-[width] duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function LogView({ log }: { log: LogEntry[] }) {
  const entries = Array.isArray(log) ? [...log].reverse() : []
  const box = useRef<HTMLDivElement>(null)

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        L&apos;agent démarre — les premières pistes apparaîtront ici dans quelques secondes.
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
        <Radar className="size-3.5 text-[#60A5FA]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ce que l&apos;agent fait
        </span>
      </div>
      <div ref={box} className="max-h-[340px] overflow-y-auto px-3.5 py-2.5">
        <ul className="flex flex-col gap-2">
          {entries.map((e, i) => {
            const meta = LOG_META[e.kind] ?? LOG_META.info
            return (
              <li key={`${e.at}-${i}`} className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 shrink-0">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${meta.tone}`}>{e.label}</span>
                    {typeof e.fit === "number" && (
                      <Badge
                        className={`text-[10px] ${
                          e.fit >= 70
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                            : e.fit >= 45
                              ? "border-[#3B82F6]/30 bg-[#3B82F6]/15 text-[#93C5FD]"
                              : "border-amber-500/30 bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {e.fit}/100
                      </Badge>
                    )}
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#60A5FA] hover:underline"
                      >
                        <ExternalLink className="size-3" /> l&apos;offre
                      </a>
                    )}
                  </div>
                  {e.detail && <p className="mt-0.5 leading-relaxed text-muted-foreground">{e.detail}</p>}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                  {new Date(e.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
