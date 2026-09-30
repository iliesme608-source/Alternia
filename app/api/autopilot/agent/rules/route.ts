import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import { getCvAttachment, isMissingTable } from "@/lib/cv-attachment"
import { getGmailToken } from "@/lib/gmail"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Réglages de l'agent de démarchage + état de préparation.
 *
 * GET  → règles courantes, CV joint, Gmail relié, derniers passages.
 * POST → enregistre les règles (activation, fenêtre nocturne, plafonds…).
 */

const MIGRATION_HINT =
  "Tables de l'agent absentes. Exécute supabase/autopilot_contacts_agent.sql dans Supabase."

/** Valeurs par défaut : agent éteint, envoi manuel, nuit 22 h → 7 h. */
const DEFAULTS = {
  is_active: false,
  auto_send: false,
  attach_cv: true,
  window_start_hour: 22,
  window_end_hour: 7,
  timezone: "Europe/Paris",
  max_applications_per_day: 5,
  minimum_match_score: 60,
  total_send_cap: 100,
  require_validation: true,
  frequency: "daily" as const,
  objective: {} as Record<string, string>,
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Objectif nettoyé : uniquement des chaînes, jamais d'objet imbriqué. */
function sanitizeObjective(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {}
  const allowed = [
    "poste", "secteur", "region", "ville", "niveau",
    "rythme", "date_debut", "duree", "type_contrat",
  ]
  const out: Record<string, string> = {}
  for (const key of allowed) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 200)
  }
  return out
}

export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

  const sb = createServerClient()

  const { data: existing, error } = await sb
    .from("autopilot_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error && isMissingTable(error)) {
    return NextResponse.json({ error: MIGRATION_HINT, migrationMissing: true }, { status: 500 })
  }
  if (error) console.error("[agent/rules] lecture:", error)

  // Pré-remplit l'objectif depuis le profil quand l'étudiant n'a rien réglé.
  const { data: profile } = await sb
    .from("profiles")
    .select("prenom, nom, poste_recherche, secteur, region, niveau, rythme, date_debut_alternance, duree_alternance")
    .eq("id", userId)
    .maybeSingle()

  const suggestedObjective = {
    poste: (profile?.poste_recherche as string) ?? "",
    secteur: (profile?.secteur as string) ?? "",
    region: (profile?.region as string) ?? "",
    ville: "",
    niveau: (profile?.niveau as string) ?? "",
    rythme: (profile?.rythme as string) ?? "",
    date_debut: (profile?.date_debut_alternance as string) ?? "",
    duree: (profile?.duree_alternance as string) ?? "",
    type_contrat: "les_deux",
  }

  const displayName = [profile?.prenom, profile?.nom].filter(Boolean).join(" ")
  const [cv, gmail] = await Promise.all([
    getCvAttachment(userId, displayName),
    getGmailToken(userId),
  ])

  const { data: runs } = await sb
    .from("autopilot_runs")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(10)

  // Compteurs affichés dans le panneau (plafonds restants).
  const since24h = new Date(Date.now() - 86_400_000).toISOString()
  const { count: sentLast24h } = await sb
    .from("application_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "agent_sent")
    .gte("created_at", since24h)

  const { count: sentTotal } = await sb
    .from("application_packages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("sent_at", "is", null)

  return NextResponse.json({
    rules: existing ?? { ...DEFAULTS, user_id: userId, objective: suggestedObjective },
    suggestedObjective,
    readiness: {
      cvAttached: Boolean(cv),
      cvFileName: cv?.filename ?? null,
      cvOrigin: cv?.origin ?? null,
      gmailConnected: Boolean(gmail),
      gmailAddress: gmail?.email_address ?? null,
    },
    counters: {
      sentLast24h: sentLast24h ?? 0,
      sentTotal: sentTotal ?? 0,
    },
    runs: runs ?? [],
  })
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request)
    if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    const autoSend = body.auto_send === true
    const objective = sanitizeObjective(body.objective)

    // Activer l'agent sans objectif exploitable ne produirait rien : on le dit
    // tout de suite plutôt que de laisser l'étudiant attendre une nuit pour rien.
    const isActive = body.is_active === true
    if (isActive) {
      const hasGeo = Boolean(objective.region || objective.ville)
      if (!objective.poste || !objective.secteur || !hasGeo) {
        return NextResponse.json(
          { error: "Pour activer l'agent, renseigne au moins le poste, le secteur et une région ou une ville." },
          { status: 400 },
        )
      }
    }

    const payload = {
      user_id: userId,
      is_active: isActive,
      auto_send: autoSend,
      // require_validation existe depuis la première version : on le garde
      // cohérent avec auto_send pour ne pas avoir deux sources de vérité.
      require_validation: !autoSend,
      attach_cv: body.attach_cv !== false,
      window_start_hour: clampInt(body.window_start_hour, 0, 23, DEFAULTS.window_start_hour),
      window_end_hour: clampInt(body.window_end_hour, 0, 23, DEFAULTS.window_end_hour),
      timezone: typeof body.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim().slice(0, 64)
        : DEFAULTS.timezone,
      max_applications_per_day: clampInt(body.max_applications_per_day, 0, 100, DEFAULTS.max_applications_per_day),
      minimum_match_score: clampInt(body.minimum_match_score, 0, 100, DEFAULTS.minimum_match_score),
      total_send_cap: clampInt(body.total_send_cap, 0, 2000, DEFAULTS.total_send_cap),
      objective,
      target_role: objective.poste ?? "",
      frequency: "daily",
    }

    const sb = createServerClient()

    // Une seule ligne de règles par étudiant : on met à jour celle qui existe.
    const { data: existing } = await sb
      .from("autopilot_rules")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const query = existing?.id
      ? sb.from("autopilot_rules").update(payload).eq("id", existing.id).eq("user_id", userId)
      : sb.from("autopilot_rules").insert(payload)

    const { data, error } = await query.select().maybeSingle()

    if (error) {
      console.error("[agent/rules] écriture:", error)
      return NextResponse.json(
        { error: isMissingTable(error) ? MIGRATION_HINT : "Impossible d'enregistrer les réglages." },
        { status: 500 },
      )
    }

    return NextResponse.json({ rules: data })
  } catch (err) {
    console.error("[agent/rules]", err)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
