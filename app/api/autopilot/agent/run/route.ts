import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import { runAgentForUser, type AgentRules, type AgentRunSummary } from "@/lib/agent"

export const runtime = "nodejs"
// Un passage enchaîne recherche, scoring, rédaction et envois : il lui faut du temps.
export const maxDuration = 300

/**
 * Exécution de l'agent de démarchage.
 *
 * Deux appelants, deux régimes :
 *
 *   • Le cron Vercel — `Authorization: Bearer $CRON_SECRET`. Passe sur TOUS les
 *     étudiants ayant activé l'agent, chacun dans sa fenêtre horaire.
 *
 *   • L'étudiant lui-même — jeton Supabase. Test manuel sur son seul compte, la
 *     fenêtre horaire est ignorée mais AUCUN plafond ne l'est.
 *
 * Sans CRON_SECRET configuré, l'appel cron est refusé : mieux vaut un agent qui
 * ne tourne pas qu'un endpoint d'envoi d'emails ouvert à tous.
 */

const MAX_USERS_PER_RUN = 20

function bearer(request: NextRequest): string {
  return (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
}

/** Ouvre une ligne de journal et renvoie son id (null si la table manque). */
async function openRun(
  sb: ReturnType<typeof createServerClient>,
  userId: string,
  trigger: "cron" | "manuel",
): Promise<string | null> {
  const { data, error } = await sb
    .from("autopilot_runs")
    .insert({ user_id: userId, trigger_source: trigger, status: "running" })
    .select("id")
    .maybeSingle()
  if (error) {
    console.error("[agent/run] ouverture du journal:", error)
    return null
  }
  return (data?.id as string) ?? null
}

async function closeRun(
  sb: ReturnType<typeof createServerClient>,
  runId: string | null,
  summary: AgentRunSummary,
): Promise<void> {
  if (!runId) return
  const { error } = await sb
    .from("autopilot_runs")
    .update({
      status: summary.status,
      companies_found: summary.companiesFound,
      applications_made: summary.applicationsMade,
      emails_sent: summary.emailsSent,
      contacts_found: summary.contactsFound,
      cv_attached: summary.cvAttached,
      message: summary.message,
      details: summary.details,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)
  if (error) console.error("[agent/run] clôture du journal:", error)
}

/** Un passage complet pour un étudiant, journalisé de bout en bout. */
async function executeFor(
  sb: ReturnType<typeof createServerClient>,
  rules: AgentRules,
  trigger: "cron" | "manuel",
  force: boolean,
): Promise<AgentRunSummary & { userId: string }> {
  const runId = await openRun(sb, rules.user_id, trigger)

  let summary: AgentRunSummary
  try {
    summary = await runAgentForUser(sb, rules, { force })
  } catch (err) {
    console.error("[agent/run] échec pour", rules.user_id, err)
    summary = {
      status: "error",
      companiesFound: 0, applicationsMade: 0, emailsSent: 0, contactsFound: 0,
      cvAttached: false,
      message: "Le passage de l'agent a échoué. Réessaie ou contacte le support.",
      details: [],
    }
  }

  await closeRun(sb, runId, summary)
  await sb
    .from("autopilot_rules")
    .update({ last_run_at: new Date().toISOString() })
    .eq("user_id", rules.user_id)

  return { ...summary, userId: rules.user_id }
}

export async function POST(request: NextRequest) {
  try {
    const sb = createServerClient()
    const token = bearer(request)
    const cronSecret = process.env.CRON_SECRET

    // ── Mode cron ────────────────────────────────────────────────────────────
    if (cronSecret && token && token === cronSecret) {
      const { data: activeRules, error } = await sb
        .from("autopilot_rules")
        .select("*")
        .eq("is_active", true)
        .limit(MAX_USERS_PER_RUN)

      if (error) {
        console.error("[agent/run] lecture des règles actives:", error)
        return NextResponse.json({ error: "Lecture des règles impossible." }, { status: 500 })
      }

      const results = []
      // Séquentiel : les envois Gmail et les appels Claude ne doivent pas se
      // marcher dessus, et le journal reste lisible étudiant par étudiant.
      for (const rules of (activeRules ?? []) as unknown as AgentRules[]) {
        results.push(await executeFor(sb, rules, "cron", false))
      }

      return NextResponse.json({
        mode: "cron",
        users: results.length,
        emailsSent: results.reduce((n, r) => n + r.emailsSent, 0),
        applicationsMade: results.reduce((n, r) => n + r.applicationsMade, 0),
        results,
      })
    }

    // ── Mode étudiant (test manuel) ──────────────────────────────────────────
    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const { data: rules, error } = await sb
      .from("autopilot_rules")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("[agent/run] lecture des règles:", error)
      return NextResponse.json(
        { error: "Règles introuvables. Exécute supabase/autopilot_contacts_agent.sql dans Supabase." },
        { status: 500 },
      )
    }
    if (!rules) {
      return NextResponse.json(
        { error: "Configure d'abord ton agent (objectif, plafonds) puis relance." },
        { status: 400 },
      )
    }

    const summary = await executeFor(sb, rules as unknown as AgentRules, "manuel", true)
    return NextResponse.json({ mode: "manuel", ...summary })
  } catch (err) {
    console.error("[agent/run]", err)
    return NextResponse.json({ error: "Erreur serveur pendant le passage de l'agent." }, { status: 500 })
  }
}

/** Vercel Cron appelle en GET par défaut : on délègue au même traitement. */
export async function GET(request: NextRequest) {
  return POST(request)
}
