import type { SupabaseClient } from "@supabase/supabase-js"
import { isRetained } from "@/lib/autopilot"
import { searchAndPersistCompanies } from "@/lib/company-search"
import { buildProfileSummary, persistScored, scoreWithClaude } from "@/lib/company-scoring"
import {
  generatePackage,
  loadStudentContext,
  persistPackage,
  type RecipientContext,
} from "@/lib/application-generator"
import {
  AUTO_SEND_MIN_RANK,
  persistContactLeads,
  searchContactLeads,
} from "@/lib/contacts"
import { getCvAttachment } from "@/lib/cv-attachment"
import { sendMailAsUser } from "@/lib/gmail-send"
import type { CompanyTarget } from "@/types"

/**
 * Agent de démarchage Alternia.
 *
 * Il rejoue, sans l'étudiant, exactement le parcours du wizard Autopilot :
 *   chercher → scorer → trouver le décideur → rédiger → joindre le CV → envoyer.
 *
 * Trois garde-fous non négociables :
 *   1. Il n'envoie QUE si l'étudiant a explicitement activé l'envoi automatique
 *      (autopilot_rules.auto_send). Sinon il prépare et laisse en « Prête ».
 *   2. Il respecte un plafond quotidien ET un plafond total, tous deux réglés
 *      par l'étudiant. Aucun envoi au-delà.
 *   3. Il n'écrit qu'à une adresse confirmée par l'étudiant, ou à une adresse de
 *      service (recrutement@, rh@…) sur un domaine dont le site confirme
 *      appartenir à l'entreprise. Jamais à une adresse nominative devinée, jamais
 *      à un domaine simplement joignable — une homonyme recevrait la
 *      candidature. Ces pistes restent visibles dans l'app, à l'étudiant de les
 *      valider s'il le souhaite.
 */

/** Plafond par passage — tient dans maxDuration même quand Claude est lent. */
const MAX_PER_RUN = 8
/** Entreprises scorées en un appel Claude. */
const MAX_SCORE_BATCH = 15
/** Pause entre deux envois Gmail (throttling). */
const SEND_DELAY_MS = 3000

export interface AgentRules {
  user_id: string
  is_active: boolean
  auto_send: boolean
  attach_cv: boolean
  window_start_hour: number
  window_end_hour: number
  timezone: string
  objective: Record<string, string>
  max_applications_per_day: number
  minimum_match_score: number
  total_send_cap: number
  last_run_at: string | null
}

export interface AgentRunDetail {
  company: string
  action: "envoyee" | "preparee" | "sans_contact" | "echec_generation" | "echec_envoi"
  to?: string
  contactName?: string
  contactTitle?: string
  reason?: string
}

export interface AgentRunSummary {
  status: "success" | "partial" | "skipped" | "error"
  companiesFound: number
  applicationsMade: number
  emailsSent: number
  contactsFound: number
  cvAttached: boolean
  message: string
  details: AgentRunDetail[]
}

// ── Fenêtre horaire ───────────────────────────────────────────────────────────

/** Heure locale (0-23) dans le fuseau de l'étudiant. */
export function localHour(timezone: string, now = new Date()): number {
  try {
    const formatted = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(now)
    const h = Number(formatted.replace(/[^\d]/g, ""))
    return Number.isFinite(h) ? h % 24 : now.getUTCHours()
  } catch {
    return now.getUTCHours()
  }
}

/** Vrai si `hour` tombe dans la fenêtre, y compris quand elle enjambe minuit. */
export function inWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true // fenêtre « toute la journée »
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Choix du destinataire ─────────────────────────────────────────────────────

/**
 * Adresse à laquelle l'agent est autorisé à écrire.
 *
 * Confirmée par l'étudiant d'abord. Puis une adresse PUBLIÉE par l'entreprise
 * sur son propre site (identité vérifiée). Sinon une adresse de SERVICE
 * (recrutement@, rh@, contact@…) sur un domaine dont l'enregistrement MX a été
 * vérifié. Jamais une adresse nominative devinée — elle finirait en erreur de
 * remise et grillerait la réputation d'expéditeur de l'étudiant.
 */
function pickSendableContact(
  contacts: { email?: string | null; source?: string | null; email_status?: string | null; outreach_rank?: number | null; full_name?: string | null; job_title?: string | null }[],
): { email: string; full_name: string; job_title: string } | null {
  const withEmail = contacts.filter((c) => (c.email ?? "").includes("@"))

  const confirmed = withEmail.find((c) => c.email_status === "confirme")
  // Seules les adresses de service sur un domaine CORROBORÉ passent le seuil :
  // un domaine simplement joignable peut appartenir à une homonyme.
  const published = withEmail
    .filter((c) => c.source === "site_web")
    .filter((c) => (c.outreach_rank ?? 0) >= AUTO_SEND_MIN_RANK)
    .sort((a, b) => (b.outreach_rank ?? 0) - (a.outreach_rank ?? 0))[0]
  const generic = withEmail
    .filter((c) => c.source === "email_generique")
    .filter((c) => (c.outreach_rank ?? 0) >= AUTO_SEND_MIN_RANK)
    .sort((a, b) => (b.outreach_rank ?? 0) - (a.outreach_rank ?? 0))[0]

  const chosen = confirmed ?? published ?? generic
  if (!chosen) return null
  return {
    email: (chosen.email ?? "").trim(),
    full_name: (chosen.full_name ?? "").trim(),
    job_title: (chosen.job_title ?? "").trim(),
  }
}

/**
 * Cherche les décideurs d'une entreprise et les enregistre.
 * Ne lève jamais : sans contact, la candidature est simplement préparée.
 */
export async function discoverContacts(
  sb: SupabaseClient,
  userId: string,
  company: CompanyTarget,
): Promise<Record<string, unknown>[]> {
  // Contacts déjà connus (dont ceux confirmés par l'étudiant) — prioritaires.
  const { data: known, error: knownErr } = await sb
    .from("company_contacts")
    .select("*")
    .eq("user_id", userId)
    .eq("company_target_id", company.id)
    .order("is_primary", { ascending: false })
    .order("outreach_rank", { ascending: false })

  if (knownErr) {
    console.log("[agent] company_contacts indisponible:", knownErr.code)
    return []
  }
  if ((known ?? []).some((c) => c.email_status === "confirme")) return known ?? []

  // Registre officiel + domaine vérifié + adresses publiées sur le site.
  const { leads, domain } = await searchContactLeads(company)

  const persistErr = await persistContactLeads(sb, userId, company.id, leads)
  if (persistErr) {
    console.error("[agent] persist contacts:", persistErr)
    return leads as unknown as Record<string, unknown>[]
  }

  if (domain && !company.website) {
    await sb.from("company_targets").update({ website: `https://${domain}` }).eq("id", company.id)
  }

  const { data: stored } = await sb
    .from("company_contacts")
    .select("*")
    .eq("user_id", userId)
    .eq("company_target_id", company.id)
    .order("is_primary", { ascending: false })
    .order("outreach_rank", { ascending: false })
  return (stored ?? []) as Record<string, unknown>[]
}

// ── Exécution ─────────────────────────────────────────────────────────────────

/**
 * Un passage complet de l'agent pour un étudiant.
 * `force` (test manuel depuis l'app) ignore la fenêtre horaire, jamais les plafonds.
 */
export async function runAgentForUser(
  sb: SupabaseClient,
  rules: AgentRules,
  options: { force?: boolean } = {},
): Promise<AgentRunSummary> {
  const userId = rules.user_id
  const details: AgentRunDetail[] = []

  const skip = (message: string): AgentRunSummary => ({
    status: "skipped",
    companiesFound: 0,
    applicationsMade: 0,
    emailsSent: 0,
    contactsFound: 0,
    cvAttached: false,
    message,
    details,
  })

  // 1. Fenêtre horaire — sautée pour un test manuel.
  if (!options.force) {
    const hour = localHour(rules.timezone)
    if (!inWindow(hour, rules.window_start_hour, rules.window_end_hour)) {
      return skip(
        `Hors fenêtre de démarchage (${rules.window_start_hour}h–${rules.window_end_hour}h, il est ${hour}h à ${rules.timezone}).`,
      )
    }
  }

  // 2. Objectif de recherche — sans lui, l'agent ne sait pas quoi chercher.
  const objective = rules.objective ?? {}
  const sector = (objective.secteur ?? objective.sector ?? "").trim()
  const region = (objective.region ?? "").trim()
  const city = (objective.ville ?? objective.city ?? "").trim()
  const poste = (objective.poste ?? objective.targetRole ?? "").trim()

  if (!poste || !sector || (!region && !city)) {
    return skip("Objectif incomplet : renseigne le poste, le secteur et une région ou une ville.")
  }

  // 3. Plafonds. Le quotidien est glissant sur 24 h — un cron nocturne ne tourne
  //    qu'une fois, mais un test manuel ne doit pas permettre de le contourner.
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

  const dailyLeft = Math.max(0, rules.max_applications_per_day - (sentLast24h ?? 0))
  const totalLeft = Math.max(0, rules.total_send_cap - (sentTotal ?? 0))
  const budget = Math.min(dailyLeft, totalLeft, MAX_PER_RUN)

  if (budget === 0) {
    return skip(
      dailyLeft === 0
        ? `Plafond quotidien atteint (${rules.max_applications_per_day} candidatures / 24 h).`
        : `Plafond total atteint (${rules.total_send_cap} candidatures envoyées).`,
    )
  }

  // 4. Recherche d'entreprises.
  const search = await searchAndPersistCompanies(sb, userId, { sector, region, city })
  if (search.missingTables?.length) {
    return {
      status: "error",
      companiesFound: 0, applicationsMade: 0, emailsSent: 0, contactsFound: 0,
      cvAttached: false,
      message: "Tables Autopilot manquantes. Exécute supabase/autopilot.sql dans Supabase.",
      details,
    }
  }
  if (search.error) {
    return {
      status: "error",
      companiesFound: 0, applicationsMade: 0, emailsSent: 0, contactsFound: 0,
      cvAttached: false, message: search.error, details,
    }
  }

  const found = (search.companies as unknown as CompanyTarget[]).filter((c) => c?.id)
  if (found.length === 0) {
    return skip(search.message ?? "Aucune entreprise trouvée pour ces critères.")
  }

  // 5. Écarte les entreprises déjà démarchées (candidature non archivée).
  const { data: existing } = await sb
    .from("application_packages")
    .select("company_target_id")
    .eq("user_id", userId)
    .neq("status", "archived")
    .in("company_target_id", found.map((c) => c.id))

  const alreadyDone = new Set((existing ?? []).map((p) => p.company_target_id as string))
  const fresh = found.filter((c) => !alreadyDone.has(c.id))

  if (fresh.length === 0) {
    return skip("Toutes les entreprises trouvées ont déjà été démarchées. Élargis le secteur ou la région.")
  }

  // 6. Scoring des entreprises pas encore scorées.
  const { student, datesGuidance, profile, displayName } = await loadStudentContext(sb, userId, {
    objective: objective as Record<string, string>,
  })

  const toScore = fresh.filter((c) => c.match_score === null).slice(0, MAX_SCORE_BATCH)
  if (toScore.length > 0) {
    const byId = await scoreWithClaude(toScore, buildProfileSummary(profile), objective, 8000)
    if (byId) {
      const scored = await persistScored(sb, toScore, byId)
      const scoreById = new Map(scored.map((s) => [s.company_target_id, s]))
      for (const c of fresh) {
        const s = scoreById.get(c.id)
        if (!s) continue
        c.match_score = s.match_score
        c.match_reason = s.match_reason
        c.priority = s.priority
        c.recommended_angle = s.recommended_angle
        c.possible_role = s.possible_role
      }
    } else {
      console.warn("[agent] scoring indisponible — sélection sur les seules données registre")
    }
  }

  // 7. Sélection : score minimum de l'étudiant + règles de viabilité partagées.
  const eligible = fresh
    .filter((c) => (c.match_score ?? 0) >= rules.minimum_match_score)
    .filter((c) => isRetained({ match_score: c.match_score ?? 0, possible_role: c.possible_role ?? "" }))
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
    .slice(0, budget)

  if (eligible.length === 0) {
    return skip(
      `Aucune entreprise au-dessus de ton score minimum (${rules.minimum_match_score}/100). Baisse le seuil ou élargis la recherche.`,
    )
  }

  // 8. CV à joindre — résolu une seule fois pour tout le passage.
  const cv = rules.attach_cv ? await getCvAttachment(userId, displayName) : null

  let applicationsMade = 0
  let emailsSent = 0
  let contactsFound = 0
  let sendFailures = 0

  for (const company of eligible) {
    // 8a. Décideurs.
    const contacts = await discoverContacts(sb, userId, company)
    if (contacts.length > 0) contactsFound++

    const best = contacts[0] as Record<string, unknown> | undefined
    const recipient: RecipientContext | undefined =
      best && (best.full_name || best.job_title)
        ? {
            fullName: ((best.full_name as string) ?? "").trim() || undefined,
            jobTitle: ((best.job_title as string) ?? "").trim() || undefined,
          }
        : undefined

    // 8b. Rédaction.
    const pkg = await generatePackage(student, company, datesGuidance, recipient)
    if (!pkg) {
      details.push({ company: company.company_name, action: "echec_generation" })
      continue
    }

    const saved = await persistPackage(
      sb, userId, company, pkg,
      "Candidature préparée par l'agent de démarchage Alternia",
    )
    applicationsMade++

    // 8c. Envoi — uniquement si l'étudiant l'a activé.
    if (!rules.auto_send) {
      details.push({ company: company.company_name, action: "preparee", reason: "Envoi automatique désactivé" })
      continue
    }

    const sendable = pickSendableContact(contacts)
    if (!sendable) {
      details.push({
        company: company.company_name,
        action: "sans_contact",
        reason: "Aucune adresse rattachée de façon sûre à cette entreprise — à valider à la main dans l'app",
      })
      continue
    }

    if (emailsSent > 0) await sleep(SEND_DELAY_MS)

    const result = await sendMailAsUser(userId, {
      to: sendable.email,
      subject: pkg.email_subject || `Candidature alternance — ${company.company_name}`,
      body: pkg.email_body,
      fromName: displayName || undefined,
      attachments: cv
        ? [{ filename: cv.filename, mimeType: cv.mimeType, contentB64: cv.contentB64 }]
        : undefined,
    })

    if (!result.ok) {
      sendFailures++
      details.push({
        company: company.company_name,
        action: "echec_envoi",
        to: sendable.email,
        reason: result.error,
      })
      // Gmail déconnecté : inutile d'insister sur les entreprises suivantes.
      if (result.needsConnection) break
      continue
    }

    emailsSent++
    const now = new Date().toISOString()
    if (saved.id) {
      await sb
        .from("application_packages")
        .update({ status: "sent", sent_at: now })
        .eq("id", saved.id)
        .eq("user_id", userId)

      await sb.from("application_events").insert({
        user_id: userId,
        application_package_id: saved.id,
        event_type: "agent_sent",
        note: `Envoyée automatiquement à ${sendable.email}`,
        metadata: {
          company_name: company.company_name,
          to: sendable.email,
          contact_name: sendable.full_name,
          contact_title: sendable.job_title,
          cv_attached: Boolean(cv),
          cv_file: cv?.filename ?? null,
        },
      })
    }

    // Le suivi par entreprise passe à « Contactée ».
    await sb
      .from("company_targets")
      .update({ tracking_status: "contactee" })
      .eq("id", company.id)
      .eq("user_id", userId)

    details.push({
      company: company.company_name,
      action: "envoyee",
      to: sendable.email,
      contactName: sendable.full_name,
      contactTitle: sendable.job_title,
    })
  }

  const status: AgentRunSummary["status"] =
    applicationsMade === 0 ? "error" : sendFailures > 0 ? "partial" : "success"

  const message = rules.auto_send
    ? `${applicationsMade} candidature(s) préparée(s), ${emailsSent} envoyée(s)${cv ? ` avec ${cv.filename} en pièce jointe` : " sans CV joint"}.`
    : `${applicationsMade} candidature(s) préparée(s) et en attente de ta validation.`

  return {
    status,
    companiesFound: fresh.length,
    applicationsMade,
    emailsSent,
    contactsFound,
    cvAttached: Boolean(cv),
    message,
    details,
  }
}
