"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, Bot, CheckCircle2, ChevronRight, Circle, Clock,
  FileText, Gauge, Loader2, Mail, Moon, Paperclip, Play, Save, Send,
  ShieldCheck, Sparkles, Trash2, Upload,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CONTRATS, NIVEAUX, SECTEURS } from "@/lib/autopilot-options"

/**
 * Panneau de l'agent de démarchage nocturne.
 *
 * L'étudiant y décide TOUT ce que l'agent a le droit de faire : s'il envoie
 * vraiment ou se contente de préparer, dans quelle plage horaire, combien de
 * candidatures par nuit, à partir de quel score, et avec quel CV joint.
 * Rien n'est activé par défaut.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface Objective {
  poste: string; secteur: string; region: string; ville: string; niveau: string
  rythme: string; date_debut: string; duree: string; type_contrat: string
}

interface Rules {
  is_active: boolean
  auto_send: boolean
  attach_cv: boolean
  window_start_hour: number
  window_end_hour: number
  timezone: string
  max_applications_per_day: number
  minimum_match_score: number
  total_send_cap: number
  objective: Partial<Objective>
  last_run_at?: string | null
}

interface Readiness {
  cvAttached: boolean
  cvFileName: string | null
  cvOrigin: "fichier" | "genere" | null
  gmailConnected: boolean
  gmailAddress: string | null
}

interface RunDetail {
  company: string
  action: "envoyee" | "preparee" | "sans_contact" | "echec_generation" | "echec_envoi"
  to?: string
  contactName?: string
  contactTitle?: string
  reason?: string
}

interface Run {
  id: string
  trigger_source: "cron" | "manuel"
  status: "running" | "success" | "partial" | "skipped" | "error"
  companies_found: number
  applications_made: number
  emails_sent: number
  contacts_found: number
  cv_attached: boolean
  message: string
  details: RunDetail[]
  started_at: string
  finished_at: string | null
}

const EMPTY_OBJECTIVE: Objective = {
  poste: "", secteur: "", region: "", ville: "", niveau: "",
  rythme: "", date_debut: "", duree: "", type_contrat: "les_deux",
}

const DEFAULT_RULES: Rules = {
  is_active: false,
  auto_send: false,
  attach_cv: true,
  window_start_hour: 22,
  window_end_hour: 7,
  timezone: "Europe/Paris",
  max_applications_per_day: 5,
  minimum_match_score: 60,
  total_send_cap: 100,
  objective: {},
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function AgentNuit() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [objective, setObjective] = useState<Objective>(EMPTY_OBJECTIVE)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [counters, setCounters] = useState({ sentLast24h: 0, sentTotal: 0 })
  const [runs, setRuns] = useState<Run[]>([])
  const [openRun, setOpenRun] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  /** Lecture seule — aucun setState ici, pour pouvoir l'appeler depuis un effet. */
  const lireEtat = useCallback(async () => {
    const token = await getToken()
    const res = await fetch("/api/autopilot/agent/rules", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`)
    return data as {
      rules?: Partial<Rules>
      suggestedObjective?: Partial<Objective>
      readiness?: Readiness
      counters?: { sentLast24h: number; sentTotal: number }
      runs?: Run[]
    }
  }, [])

  const appliquer = useCallback((data: Awaited<ReturnType<typeof lireEtat>>) => {
    const r = { ...DEFAULT_RULES, ...(data.rules ?? {}) } as Rules
    setRules(r)
    // L'objectif enregistré prime ; sinon on pré-remplit depuis le profil.
    const saved = (r.objective ?? {}) as Partial<Objective>
    const hasSaved = Object.values(saved).some((v) => typeof v === "string" && v.trim())
    setObjective({
      ...EMPTY_OBJECTIVE,
      ...(hasSaved ? saved : (data.suggestedObjective ?? {})),
    })
    setReadiness(data.readiness ?? null)
    setCounters(data.counters ?? { sentLast24h: 0, sentTotal: 0 })
    setRuns(data.runs ?? [])
  }, [])

  /** Rechargement déclenché par l'utilisateur (après un enregistrement, un test…). */
  const charger = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      appliquer(await lireEtat())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.")
    }
    setLoading(false)
  }, [appliquer, lireEtat])

  // Au montage, les setState vivent dans le callback de la promesse — jamais
  // dans le corps de l'effet, sinon React enchaîne les rendus en cascade.
  useEffect(() => {
    let annule = false
    lireEtat()
      .then((data) => { if (!annule) { appliquer(data); setLoading(false) } })
      .catch((e: unknown) => {
        if (annule) return
        setError(e instanceof Error ? e.message : "Chargement impossible.")
        setLoading(false)
      })
    return () => { annule = true }
  }, [appliquer, lireEtat])

  const set = (patch: Partial<Rules>) => setRules((r) => ({ ...r, ...patch }))
  const setObj = (patch: Partial<Objective>) => setObjective((o) => ({ ...o, ...patch }))

  async function enregistrer(overrides: Partial<Rules> = {}) {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const token = await getToken()
      const res = await fetch("/api/autopilot/agent/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...rules, ...overrides, objective }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`)
      if (data.rules) setRules((r) => ({ ...r, ...data.rules }))
      setNotice("Réglages enregistrés.")
      setTimeout(() => setNotice(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.")
    }
    setSaving(false)
  }

  async function tester() {
    setTesting(true)
    setError(null)
    setNotice(null)
    try {
      const token = await getToken()
      const res = await fetch("/api/autopilot/agent/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`)
      setNotice(data.message ?? "Passage terminé.")
      await charger()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le passage a échoué.")
    }
    setTesting(false)
  }

  async function televerserCv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const token = await getToken()
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/cv-file", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`)
      setNotice(`${data.fileName} sera joint à chaque candidature.`)
      await charger()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi du CV impossible.")
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function supprimerCv() {
    setUploading(true)
    try {
      const token = await getToken()
      await fetch("/api/cv-file", {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      await charger()
    } catch {
      setError("Suppression impossible.")
    }
    setUploading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Chargement de ton agent…
      </div>
    )
  }

  const objectifComplet = Boolean(
    objective.poste.trim() && objective.secteur && (objective.region.trim() || objective.ville.trim()),
  )
  const pretAEnvoyer = Boolean(readiness?.gmailConnected) && objectifComplet

  return (
    <div className="flex flex-col gap-5">
      {/* ── Bandeau principal ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-md">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#3B82F6]/20 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-blue glow-blue-sm">
              <Moon className="size-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold sm:text-lg">Démarchage automatique</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Pendant la nuit, l&apos;agent cherche des entreprises, identifie le décideur,
                rédige une candidature personnalisée et y joint ton CV.
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Dernier passage : {formatDateTime(rules.last_run_at)}
              </p>
            </div>
          </div>

          <ToggleSwitch
            checked={rules.is_active}
            onChange={(v) => { set({ is_active: v }); enregistrer({ is_active: v }) }}
            label={rules.is_active ? "Agent actif" : "Agent en pause"}
            disabled={saving}
          />
        </div>
      </div>

      {error && (
        <div className="flex animate-fade-in items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex animate-fade-in items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> <span>{notice}</span>
        </div>
      )}

      {/* ── Checklist de préparation ─────────────────────────────────────── */}
      <Section title="Ce dont l'agent a besoin" icon={<ShieldCheck className="size-4 text-[#2DD4BF]" />}>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <ReadyCard
            done={objectifComplet}
            label="Objectif de recherche"
            detail={objectifComplet ? `${objective.poste} · ${objective.ville || objective.region}` : "Poste, secteur et lieu"}
          />
          <ReadyCard
            done={Boolean(readiness?.cvAttached)}
            label="CV à joindre"
            detail={
              readiness?.cvAttached
                ? readiness.cvOrigin === "fichier"
                  ? readiness.cvFileName ?? "Fichier téléversé"
                  : "Généré depuis ton CV maître"
                : "Aucun CV disponible"
            }
          />
          <ReadyCard
            done={Boolean(readiness?.gmailConnected)}
            label="Gmail relié"
            detail={readiness?.gmailAddress ?? "Requis pour l'envoi automatique"}
          />
        </div>

        {/* CV */}
        <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
          <Paperclip className="size-4 shrink-0 text-[#60A5FA]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Pièce jointe</p>
            <p className="text-xs text-muted-foreground">
              {readiness?.cvAttached
                ? readiness.cvOrigin === "fichier"
                  ? `${readiness.cvFileName} — joint tel quel à chaque candidature.`
                  : "Aucun fichier téléversé : un .docx est reconstruit depuis le texte de ton CV maître."
                : "Téléverse ton CV en PDF ou DOCX pour qu'il parte avec chaque candidature."}
            </p>
          </div>
          <input
            ref={fileRef}
            id="agent-cv-file"
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={televerserCv}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {readiness?.cvOrigin === "fichier" ? "Remplacer" : "Téléverser mon CV"}
          </Button>
          {readiness?.cvOrigin === "fichier" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              disabled={uploading}
              onClick={supprimerCv}
            >
              <Trash2 className="size-3.5" /> Retirer
            </Button>
          )}
        </div>

        {!readiness?.gmailConnected && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <p className="text-xs leading-relaxed text-amber-300/90">
                Sans Gmail relié, l&apos;agent prépare les candidatures mais ne peut rien envoyer.
                Elles t&apos;attendent dans le suivi.
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link href="/profil">Connecter mon Gmail</Link>
            </Button>
          </div>
        )}
      </Section>

      {/* ── Objectif ─────────────────────────────────────────────────────── */}
      <Section title="Ce que l'agent cherche" icon={<Sparkles className="size-4 text-[#60A5FA]" />}>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Poste recherché">
            <Input
              placeholder="Ex : Data Analyst, Assistant RH…"
              value={objective.poste}
              onChange={(e) => setObj({ poste: e.target.value })}
            />
          </Field>
          <Field label="Secteur visé">
            <Select value={objective.secteur} onValueChange={(v) => setObj({ secteur: v })}>
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
              onChange={(e) => setObj({ region: e.target.value })}
            />
          </Field>
          <Field label="Ville">
            <Input
              placeholder="Ex : Paris, Lyon…"
              value={objective.ville}
              onChange={(e) => setObj({ ville: e.target.value })}
            />
          </Field>
          <Field label="Niveau d'études">
            <Select value={objective.niveau} onValueChange={(v) => setObj({ niveau: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>
                {NIVEAUX.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rythme école / entreprise">
            <Input
              placeholder="Ex : 3 jours entreprise / 2 jours école"
              value={objective.rythme}
              onChange={(e) => setObj({ rythme: e.target.value })}
            />
          </Field>
          <Field label="Date de début">
            <Input
              type="month"
              value={objective.date_debut}
              onChange={(e) => setObj({ date_debut: e.target.value })}
            />
          </Field>
          <Field label="Durée">
            <Input
              placeholder="Ex : 24 mois"
              value={objective.duree}
              onChange={(e) => setObj({ duree: e.target.value })}
            />
          </Field>
          <Field label="Type de contrat">
            <Select value={objective.type_contrat} onValueChange={(v) => setObj({ type_contrat: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTRATS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Section>

      {/* ── Limites ──────────────────────────────────────────────────────── */}
      <Section title="Ce que l'agent a le droit de faire" icon={<Gauge className="size-4 text-[#60A5FA]" />}>
        <div className="flex flex-col gap-3">
          <SwitchRow
            checked={rules.auto_send}
            onChange={(v) => set({ auto_send: v })}
            disabled={!pretAEnvoyer}
            title="Envoyer vraiment les candidatures"
            description={
              pretAEnvoyer
                ? "Désactivé, l'agent prépare tout et laisse les candidatures en « Prête » pour que tu valides toi-même."
                : "Relie ton Gmail et complète l'objectif pour pouvoir activer l'envoi automatique."
            }
          />
          <SwitchRow
            checked={rules.attach_cv}
            onChange={(v) => set({ attach_cv: v })}
            title="Joindre mon CV à chaque candidature"
            description="Ton fichier téléversé, ou à défaut un .docx reconstruit depuis ton CV maître."
          />

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Fenêtre de démarchage">
              <div className="flex items-center gap-2">
                <Select
                  value={String(rules.window_start_hour)}
                  onValueChange={(v) => set({ window_start_hour: Number(v) })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}h</SelectItem>)}
                  </SelectContent>
                </Select>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                <Select
                  value={String(rules.window_end_hour)}
                  onValueChange={(v) => set({ window_end_hour: Number(v) })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}h</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Field>

            <Field label={`Candidatures max par nuit — ${rules.max_applications_per_day}`}>
              <input
                type="range"
                min={1}
                max={20}
                value={rules.max_applications_per_day}
                onChange={(e) => set({ max_applications_per_day: Number(e.target.value) })}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#3B82F6]"
              />
            </Field>

            <Field label={`Score minimum de l'entreprise — ${rules.minimum_match_score}/100`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={rules.minimum_match_score}
                onChange={(e) => set({ minimum_match_score: Number(e.target.value) })}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#3B82F6]"
              />
            </Field>

            <Field label="Plafond total de candidatures envoyées">
              <Input
                type="number"
                min={0}
                max={2000}
                value={rules.total_send_cap}
                onChange={(e) => set({ total_send_cap: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-xs text-muted-foreground">
            <Clock className="size-3.5 shrink-0" />
            <span>
              {counters.sentLast24h} envoyée(s) ces 24 h sur {rules.max_applications_per_day} ·{" "}
              {counters.sentTotal} au total sur {rules.total_send_cap}
            </span>
          </div>
        </div>
      </Section>

      {/* ── Garde-fous ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-[#3B82F6]/25 bg-[#3B82F6]/[0.07] px-4 py-3 text-xs leading-relaxed text-[#93C5FD]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          L&apos;agent n&apos;écrit jamais à une adresse devinée au format prénom.nom : il n&apos;utilise
          qu&apos;une adresse que tu as confirmée, ou une adresse de service (recrutement@, rh@…) sur
          un domaine dont la réception d&apos;e-mails a été vérifiée. Les candidatures partent de ton
          propre Gmail, et rien n&apos;est inventé sur ton parcours.
        </span>
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Button className="gap-2" disabled={saving} onClick={() => enregistrer()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Enregistrer les réglages
        </Button>
        <Button variant="outline" className="gap-2" disabled={testing || !objectifComplet} onClick={tester}>
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {testing ? "Passage en cours…" : "Lancer un passage maintenant"}
        </Button>
        {!objectifComplet && (
          <span className="text-xs text-muted-foreground">
            Complète le poste, le secteur et un lieu pour lancer un passage.
          </span>
        )}
      </div>

      {/* ── Journal ──────────────────────────────────────────────────────── */}
      <Section title="Journal des passages" icon={<Bot className="size-4 text-[#60A5FA]" />}>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun passage pour l&apos;instant. Lance-en un maintenant, ou active l&apos;agent et
            laisse-le travailler cette nuit.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                open={openRun === run.id}
                onToggle={() => setOpenRun((id) => (id === run.id ? null : run.id))}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function Section({
  title, icon, children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-3.5 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function ToggleSwitch({
  checked, onChange, label, disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-50 ${
        checked
          ? "border-[#3B82F6]/40 bg-[#3B82F6]/15 text-[#93C5FD]"
          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20"
      }`}
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked ? "bg-[#3B82F6]" : "bg-white/15"
        }`}
      >
        <span
          className={`inline-block size-3.5 rounded-full bg-white transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </span>
      {label}
    </button>
  )
}

function SwitchRow({
  checked, onChange, title, description, disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  description: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        label={checked ? "Activé" : "Désactivé"}
      />
    </div>
  )
}

function ReadyCard({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 transition-colors duration-200 ${
        done ? "border-emerald-500/25 bg-emerald-500/[0.07]" : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      {done ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

const RUN_STATUS: Record<Run["status"], { label: string; className: string }> = {
  running: { label: "En cours", className: "bg-white/10 text-zinc-300 border-white/15" },
  success: { label: "Réussi", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  partial: { label: "Partiel", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  skipped: { label: "Ignoré", className: "bg-white/10 text-zinc-400 border-white/15" },
  error: { label: "Échec", className: "bg-red-500/15 text-red-300 border-red-500/30" },
}

const DETAIL_META: Record<RunDetail["action"], { label: string; icon: React.ReactNode }> = {
  envoyee: { label: "Envoyée", icon: <Send className="size-3 text-emerald-400" /> },
  preparee: { label: "Préparée", icon: <FileText className="size-3 text-[#60A5FA]" /> },
  sans_contact: { label: "Sans contact", icon: <AlertTriangle className="size-3 text-amber-400" /> },
  echec_generation: { label: "Rédaction échouée", icon: <AlertTriangle className="size-3 text-red-400" /> },
  echec_envoi: { label: "Envoi échoué", icon: <AlertTriangle className="size-3 text-red-400" /> },
}

function RunRow({ run, open, onToggle }: { run: Run; open: boolean; onToggle: () => void }) {
  const status = RUN_STATUS[run.status] ?? RUN_STATUS.skipped
  const details = Array.isArray(run.details) ? run.details : []

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] transition-colors duration-200 hover:border-white/[0.12]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Badge className={`text-[10px] ${status.className}`}>{status.label}</Badge>
          <span className="text-xs text-muted-foreground">{formatDateTime(run.started_at)}</span>
          <Badge className="border-white/10 bg-white/5 text-[10px] text-zinc-400">
            {run.trigger_source === "cron" ? "Automatique" : "Manuel"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{run.applications_made} préparée(s)</span>
          <span className="text-emerald-400">{run.emails_sent} envoyée(s)</span>
          {run.cv_attached && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" /> CV
            </span>
          )}
          <ChevronRight className={`size-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="animate-fade-in border-t border-white/[0.06] px-3.5 py-3">
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{run.message}</p>
          {details.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {details.map((d, i) => {
                const meta = DETAIL_META[d.action] ?? DETAIL_META.preparee
                return (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    {meta.icon}
                    <span className="font-medium">{d.company}</span>
                    <span className="text-muted-foreground">— {meta.label}</span>
                    {d.to && <code className="rounded bg-black/30 px-1.5 py-0.5 text-[#93C5FD]">{d.to}</code>}
                    {d.contactTitle && <span className="text-muted-foreground">({d.contactTitle})</span>}
                    {d.reason && <span className="text-muted-foreground/70">· {d.reason}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
