import type { SupabaseClient } from "@supabase/supabase-js"
import { isRetained } from "@/lib/autopilot"
import { searchAndPersistCompanies } from "@/lib/company-search"
import { buildProfileSummary, persistScored, scoreWithClaude } from "@/lib/company-scoring"
import {
  generateForOffer,
  generatePackage,
  loadStudentContext,
  persistOfferPackage,
  persistPackage,
  type LoadedStudentContext,
  type OfferInput,
  type RecipientContext,
} from "@/lib/application-generator"
import { discoverContacts } from "@/lib/agent"
import * as franceTravail from "@/lib/sources/france-travail"
import type { CompanyTarget } from "@/types"

/**
 * Session d'agent — « active l'agent pendant 30 minutes ».
 *
 * Une fonction serverless ne peut pas tourner une heure : la session est donc
 * découpée en TICKS. Chaque tick travaille pendant une tranche bornée, écrit
 * son avancement en base, et rend la main. L'interface enchaîne les ticks tant
 * que la session n'a pas expiré ; si l'onglet se ferme, la session se met en
 * pause — elle ne se perd pas, et reprend exactement où elle en était.
 *
 * Deux gisements, complémentaires :
 *   • les OFFRES publiées (France Travail, qui agrège de nombreux partenaires) ;
 *   • le MARCHÉ CACHÉ (registre des entreprises), là où ~70 % des alternances
 *     se décident sans jamais être annoncées.
 *
 * L'agent de session PRÉPARE, il n'envoie rien. L'envoi reste une décision de
 * l'étudiant (ou de l'agent nocturne, qui a ses propres garde-fous).
 */

/** Durée de travail d'un tick. Laisse une large marge sous maxDuration (300 s). */
const TICK_BUDGET_MS = 90_000
/** Marge requise avant d'entamer une rédaction : un appel Claude prend ~10-25 s. */
const GENERATION_RESERVE_MS = 30_000
/** Offres récupérées par appel à la source. */
const OFFER_PAGE_SIZE = 40
/** Au-delà, on arrête de paginer : l'étudiant n'exploitera pas 500 offres. */
const MAX_OFFERS_SCANNED = 200
/** Score d'adéquation en dessous duquel une offre n'est pas préparée. */
const MIN_FIT_TO_KEEP = 25

export type SessionMode = "offres" | "spontane" | "mixte"
export type SessionStatus = "running" | "paused" | "finished" | "stopped" | "error"

export interface SessionLogEntry {
  at: string
  kind: "offre" | "spontane" | "recherche" | "info" | "erreur"
  label: string
  detail?: string
  url?: string
  fit?: number
}

export interface SessionState {
  phase: "offres" | "spontane" | "termine"
  /** Index de pagination chez la source d'offres. */
  offerCursor: number
  /** Offres trouvées, en attente de rédaction. */
  offerQueue: OfferInput[]
  /** Identifiants d'offres déjà vues — jamais deux candidatures pour la même. */
  seenOfferIds: string[]
  /** Entreprises du marché caché en attente de rédaction. */
  companyQueue: string[]
  /** Vrai quand la source d'offres n'a plus rien à donner. */
  offersExhausted: boolean
  /** Vrai quand la recherche d'entreprises a déjà été faite pour cette session. */
  companiesSearched: boolean
}

export interface AgentSession {
  id: string
  user_id: string
  mode: SessionMode
  duration_minutes: number
  status: SessionStatus
  objective: Record<string, string>
  state: Partial<SessionState>
  log: SessionLogEntry[]
  offers_found: number
  companies_found: number
  applications_prepared: number
  contacts_found: number
  ticks: number
  message: string
  started_at: string
  expires_at: string
  last_tick_at: string | null
  finished_at: string | null
}

const EMPTY_STATE: SessionState = {
  phase: "offres",
  offerCursor: 0,
  offerQueue: [],
  seenOfferIds: [],
  companyQueue: [],
  offersExhausted: false,
  companiesSearched: false,
}

function normalizeState(raw: Partial<SessionState> | null | undefined): SessionState {
  return { ...EMPTY_STATE, ...(raw ?? {}) }
}

function entry(
  kind: SessionLogEntry["kind"],
  label: string,
  extra: Omit<SessionLogEntry, "at" | "kind" | "label"> = {},
): SessionLogEntry {
  return { at: new Date().toISOString(), kind, label, ...extra }
}

/** Le journal ne grossit pas indéfiniment : on garde les entrées récentes. */
const MAX_LOG_ENTRIES = 200

// ── Cycle de vie ──────────────────────────────────────────────────────────────

/** Session en cours de l'étudiant (running ou paused), ou null. */
export async function getActiveSession(
  sb: SupabaseClient,
  userId: string,
): Promise<AgentSession | null> {
  const { data, error } = await sb
    .from("agent_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["running", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[agent-session] lecture:", error)
    return null
  }
  return (data as AgentSession | null) ?? null
}

export interface StartInput {
  mode: SessionMode
  durationMinutes: number
  objective: Record<string, string>
}

export async function startSession(
  sb: SupabaseClient,
  userId: string,
  input: StartInput,
): Promise<{ session: AgentSession | null; error?: string }> {
  const objective = input.objective ?? {}
  const poste = (objective.poste ?? "").trim()
  const secteur = (objective.secteur ?? "").trim()
  const hasGeo = Boolean((objective.region ?? "").trim() || (objective.ville ?? "").trim())

  if (!poste || !hasGeo) {
    return { session: null, error: "Renseigne au moins le poste recherché et une région ou une ville." }
  }
  // Le marché caché a besoin du secteur pour cibler le registre ; les offres non.
  if (input.mode !== "offres" && !secteur) {
    return { session: null, error: "Le secteur est nécessaire pour explorer le marché caché." }
  }

  // Une session encore ouverte est clôturée : l'index d'unicité n'en tolère qu'une.
  await sb
    .from("agent_sessions")
    .update({ status: "finished", finished_at: new Date().toISOString(), message: "Remplacée par une nouvelle session." })
    .eq("user_id", userId)
    .in("status", ["running", "paused"])

  const duration = Math.min(180, Math.max(5, Math.round(input.durationMinutes)))
  const expiresAt = new Date(Date.now() + duration * 60_000).toISOString()

  const { data, error } = await sb
    .from("agent_sessions")
    .insert({
      user_id: userId,
      mode: input.mode,
      duration_minutes: duration,
      status: "running",
      objective,
      state: { ...EMPTY_STATE, phase: input.mode === "spontane" ? "spontane" : "offres" },
      log: [entry("info", `Session démarrée pour ${duration} minutes.`)],
      expires_at: expiresAt,
    })
    .select()
    .maybeSingle()

  if (error) {
    console.error("[agent-session] création:", error)
    return { session: null, error: "Impossible de démarrer la session. La migration SQL est-elle appliquée ?" }
  }
  return { session: data as AgentSession }
}

export async function stopSession(
  sb: SupabaseClient,
  userId: string,
  status: "stopped" | "paused" = "stopped",
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === "stopped") {
    patch.finished_at = new Date().toISOString()
    patch.message = "Session arrêtée."
  }
  const { error } = await sb
    .from("agent_sessions")
    .update(patch)
    .eq("user_id", userId)
    .in("status", ["running", "paused"])
  if (error) console.error("[agent-session] arrêt:", error)
}

// ── Recherche d'offres ────────────────────────────────────────────────────────

/** Départements déduits de l'objectif, pour cibler la recherche d'offres. */
const DEPT_BY_CITY: Record<string, string> = {
  paris: "75", lyon: "69", marseille: "13", toulouse: "31", bordeaux: "33",
  nantes: "44", strasbourg: "67", lille: "59", rennes: "35", grenoble: "38",
  montpellier: "34", nice: "06", tours: "37", dijon: "21", angers: "49",
  metz: "57", reims: "51", nancy: "54", caen: "14", rouen: "76",
}
const DEPTS_BY_REGION: Record<string, string[]> = {
  "ile-de-france": ["75", "77", "78", "91", "92", "93", "94", "95"],
  "auvergne-rhone-alpes": ["01", "26", "38", "42", "43", "63", "69", "73", "74"],
  bretagne: ["22", "29", "35", "56"],
  "grand est": ["08", "10", "51", "54", "57", "67", "68", "88"],
  "hauts-de-france": ["02", "59", "60", "62", "80"],
  normandie: ["14", "27", "50", "61", "76"],
  "nouvelle-aquitaine": ["16", "17", "19", "24", "33", "40", "47", "64", "79", "86", "87"],
  occitanie: ["09", "11", "30", "31", "34", "46", "65", "66", "81", "82"],
  "pays de la loire": ["44", "49", "53", "72", "85"],
  "provence-alpes-cote d'azur": ["04", "05", "06", "13", "83", "84"],
  "centre-val de loire": ["18", "28", "36", "37", "41", "45"],
  "bourgogne-franche-comte": ["21", "25", "39", "58", "70", "71", "89", "90"],
}

function deburr(v: string): string {
  return (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

function departmentsFor(objective: Record<string, string>): string[] {
  const ville = deburr(objective.ville ?? "")
  if (ville && DEPT_BY_CITY[ville]) return [DEPT_BY_CITY[ville]]

  const region = deburr(objective.region ?? "").replace(/\s+/g, " ")
  const key = region.replace(/^ile de france$/, "ile-de-france")
  if (DEPTS_BY_REGION[key]) return DEPTS_BY_REGION[key]
  if (DEPT_BY_CITY[region]) return [DEPT_BY_CITY[region]]
  return []
}

function toOfferInput(o: franceTravail.JobOffer): OfferInput {
  return {
    id: `${o.source}:${o.id}`,
    source: o.source,
    title: o.title,
    company: o.company,
    location: o.location,
    contractLabel: o.contractLabel,
    salary: o.salary,
    workingTime: o.workingTime,
    experience: o.experience,
    description: o.description,
    skills: o.skills,
    sector: o.sector,
    url: o.url,
    contactEmail: o.contactEmail,
    applyUrl: o.applyUrl,
  }
}

/** Offres pour lesquelles une candidature existe déjà — jamais de doublon. */
async function alreadyApplied(
  sb: SupabaseClient,
  userId: string,
  offerIds: string[],
): Promise<Set<string>> {
  if (offerIds.length === 0) return new Set()
  const { data, error } = await sb
    .from("application_packages")
    .select("offer_id")
    .eq("user_id", userId)
    .in("offer_id", offerIds)
  if (error) {
    console.error("[agent-session] doublons offres:", error)
    return new Set()
  }
  return new Set((data ?? []).map((r) => r.offer_id as string))
}

// ── Tick ──────────────────────────────────────────────────────────────────────

export interface TickResult {
  session: AgentSession | null
  /** Faux quand la session est terminée : l'interface arrête de boucler. */
  continueTicking: boolean
  error?: string
}

/**
 * Une tranche de travail. Idempotente et reprenable : tout l'état utile est
 * relu depuis la base au début et réécrit à la fin.
 */
export async function tickSession(
  sb: SupabaseClient,
  userId: string,
): Promise<TickResult> {
  const session = await getActiveSession(sb, userId)
  if (!session) return { session: null, continueTicking: false, error: "Aucune session en cours." }

  // Expiration — c'est la fin normale d'une session.
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    const finished = await closeSession(
      sb, session,
      `Session terminée : ${session.applications_prepared} candidature(s) préparée(s).`,
    )
    return { session: finished, continueTicking: false }
  }

  const deadline = Date.now() + TICK_BUDGET_MS
  const state = normalizeState(session.state)
  const log: SessionLogEntry[] = Array.isArray(session.log) ? [...session.log] : []
  const objective = session.objective ?? {}

  let offersFound = session.offers_found
  let companiesFound = session.companies_found
  let prepared = session.applications_prepared
  let contactsFound = session.contacts_found

  // Contexte étudiant chargé une fois par tick — il ne change pas en 90 s.
  let ctx: LoadedStudentContext
  try {
    ctx = await loadStudentContext(sb, userId, { objective: objective as Record<string, string> })
  } catch (err) {
    console.error("[agent-session] contexte étudiant:", err)
    return { session, continueTicking: false, error: "Profil étudiant illisible." }
  }

  const wantsOffers = session.mode === "offres" || session.mode === "mixte"
  const wantsSpontaneous = session.mode === "spontane" || session.mode === "mixte"

  // ── Boucle de travail, bornée par le budget du tick ────────────────────────
  while (Date.now() < deadline - GENERATION_RESERVE_MS) {
    // 1. Préparer une offre en attente.
    if (state.offerQueue.length > 0) {
      const offer = state.offerQueue.shift()!
      const result = await prepareOffer(sb, userId, session.id, ctx, offer)
      if (result.prepared) {
        prepared++
        log.push(entry("offre", `${offer.title} chez ${offer.company || "une entreprise non communiquée"}`, {
          detail: result.detail,
          url: offer.url,
          fit: result.fit,
        }))
      } else if (result.detail) {
        log.push(entry("info", `${offer.title} : écartée`, { detail: result.detail, url: offer.url }))
      }
      continue
    }

    // 2. Chercher d'autres offres.
    if (wantsOffers && !state.offersExhausted && state.offerCursor < MAX_OFFERS_SCANNED) {
      const fetched = await fetchOffers(sb, userId, objective, state)
      offersFound += fetched.added
      if (fetched.log) log.push(fetched.log)
      if (fetched.stop) state.offersExhausted = true
      continue
    }

    // 3. Marché caché — préparer une entreprise en attente.
    if (wantsSpontaneous && state.companyQueue.length > 0) {
      const companyId = state.companyQueue.shift()!
      const result = await prepareSpontaneous(sb, userId, ctx, companyId)
      if (result.contacts) contactsFound++
      if (result.prepared) {
        prepared++
        log.push(entry("spontane", result.companyName, { detail: result.detail }))
      } else if (result.detail) {
        log.push(entry("info", `${result.companyName} : écartée`, { detail: result.detail }))
      }
      continue
    }

    // 4. Marché caché — constituer la file d'entreprises (une fois par session).
    if (wantsSpontaneous && !state.companiesSearched) {
      const found = await fillCompanyQueue(sb, userId, objective, ctx, state)
      companiesFound += found.added
      state.companiesSearched = true
      if (found.log) log.push(found.log)
      continue
    }

    // 5. Plus rien à faire.
    state.phase = "termine"
    break
  }

  const exhausted = state.phase === "termine"
  const patch = {
    state,
    log: log.slice(-MAX_LOG_ENTRIES),
    offers_found: offersFound,
    companies_found: companiesFound,
    applications_prepared: prepared,
    contacts_found: contactsFound,
    ticks: session.ticks + 1,
    last_tick_at: new Date().toISOString(),
  }

  if (exhausted) {
    const finished = await closeSession(
      sb,
      { ...session, ...patch } as AgentSession,
      `Tout le gisement disponible a été exploré : ${prepared} candidature(s) préparée(s).`,
      patch,
    )
    return { session: finished, continueTicking: false }
  }

  const { data, error } = await sb
    .from("agent_sessions")
    .update(patch)
    .eq("id", session.id)
    .select()
    .maybeSingle()

  if (error) {
    console.error("[agent-session] mise à jour:", error)
    return { session, continueTicking: true, error: "Progression non enregistrée." }
  }

  return { session: data as AgentSession, continueTicking: true }
}

async function closeSession(
  sb: SupabaseClient,
  session: AgentSession,
  message: string,
  patch: Record<string, unknown> = {},
): Promise<AgentSession | null> {
  const { data, error } = await sb
    .from("agent_sessions")
    .update({
      ...patch,
      status: "finished",
      finished_at: new Date().toISOString(),
      message,
    })
    .eq("id", session.id)
    .select()
    .maybeSingle()
  if (error) console.error("[agent-session] clôture:", error)
  return (data as AgentSession | null) ?? null
}

// ── Étapes ────────────────────────────────────────────────────────────────────

/** Remplit la file d'offres depuis la source. */
async function fetchOffers(
  sb: SupabaseClient,
  userId: string,
  objective: Record<string, string>,
  state: SessionState,
): Promise<{ added: number; stop: boolean; log?: SessionLogEntry }> {
  if (!franceTravail.isConfigured()) {
    return {
      added: 0,
      stop: true,
      log: entry("erreur", "Source d'offres non configurée", {
        detail:
          "Ajoute FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET pour chercher dans les offres publiées. L'agent continue sur le marché caché.",
      }),
    }
  }

  const result = await franceTravail.searchOffers({
    keywords: objective.poste ?? "",
    departments: departmentsFor(objective),
    from: state.offerCursor,
    size: OFFER_PAGE_SIZE,
    publishedWithinDays: 31,
  })

  state.offerCursor += OFFER_PAGE_SIZE

  if (result.error) {
    return { added: 0, stop: true, log: entry("erreur", "Recherche d'offres interrompue", { detail: result.error }) }
  }
  if (result.offers.length === 0) {
    return {
      added: 0,
      stop: true,
      log: entry("recherche", "Plus d'offres à explorer", {
        detail: `${state.seenOfferIds.length} offre(s) parcourue(s) au total.`,
      }),
    }
  }

  const seen = new Set(state.seenOfferIds)
  const candidates = result.offers.map(toOfferInput).filter((o) => !seen.has(o.id))
  const applied = await alreadyApplied(sb, userId, candidates.map((o) => o.id))

  const fresh = candidates.filter((o) => !applied.has(o.id))
  for (const o of fresh) seen.add(o.id)
  // Les offres déjà traitées comptent aussi comme « vues » : sans ça, elles
  // reviendraient à chaque page.
  for (const o of candidates) seen.add(o.id)

  state.seenOfferIds = Array.from(seen).slice(-500)
  state.offerQueue.push(...fresh)

  return {
    added: fresh.length,
    stop: false,
    log: entry("recherche", `${fresh.length} nouvelle(s) offre(s) trouvée(s)`, {
      detail:
        result.total !== null
          ? `${result.total} offre(s) correspondent à tes critères chez ${franceTravail.SOURCE_LABEL}.`
          : undefined,
    }),
  }
}

/** Rédige et enregistre la candidature pour une offre. */
async function prepareOffer(
  sb: SupabaseClient,
  userId: string,
  sessionId: string,
  ctx: LoadedStudentContext,
  offer: OfferInput,
): Promise<{ prepared: boolean; detail?: string; fit?: number }> {
  const recipient: RecipientContext | undefined = undefined // l'annonce ne nomme pas de recruteur

  const pkg = await generateForOffer(ctx.student, offer, ctx.datesGuidance, recipient)
  if (!pkg) return { prepared: false, detail: "Rédaction impossible, l'offre sera reproposée." }

  // Une offre très éloignée du profil ne mérite pas de figurer dans le suivi :
  // mieux vaut dix candidatures crédibles que cent envoyées au hasard.
  if (pkg.fit_score < MIN_FIT_TO_KEEP) {
    return {
      prepared: false,
      detail: `Adéquation trop faible (${pkg.fit_score}/100) : ${pkg.gaps.slice(0, 2).join(", ") || "profil trop éloigné"}.`,
    }
  }

  await persistOfferPackage(sb, userId, offer, pkg, {
    sessionId,
    eventNote: "Candidature préparée par l'agent pendant une session",
  })

  const gaps = pkg.gaps.length > 0 ? ` · à travailler : ${pkg.gaps.slice(0, 2).join(", ")}` : ""
  return {
    prepared: true,
    fit: pkg.fit_score,
    detail: `Adéquation ${pkg.fit_score}/100${gaps}${offer.contactEmail ? ` · contact : ${offer.contactEmail}` : ""}`,
  }
}

/** Constitue la file d'entreprises du marché caché (recherche + scoring). */
async function fillCompanyQueue(
  sb: SupabaseClient,
  userId: string,
  objective: Record<string, string>,
  ctx: LoadedStudentContext,
  state: SessionState,
): Promise<{ added: number; log?: SessionLogEntry }> {
  const search = await searchAndPersistCompanies(sb, userId, {
    sector: objective.secteur ?? "",
    region: objective.region ?? "",
    city: objective.ville ?? "",
  })

  if (search.missingTables?.length || search.error) {
    return {
      added: 0,
      log: entry("erreur", "Marché caché indisponible", {
        detail: search.error ?? "Migration Autopilot manquante.",
      }),
    }
  }

  const found = (search.companies as unknown as CompanyTarget[]).filter((c) => c?.id)
  if (found.length === 0) {
    return { added: 0, log: entry("recherche", "Aucune entreprise trouvée sur le marché caché") }
  }

  // Écarte celles déjà démarchées.
  const { data: existing } = await sb
    .from("application_packages")
    .select("company_target_id")
    .eq("user_id", userId)
    .neq("status", "archived")
    .in("company_target_id", found.map((c) => c.id))
  const done = new Set((existing ?? []).map((p) => p.company_target_id as string))
  const fresh = found.filter((c) => !done.has(c.id))

  // Scoring pour ne préparer que ce qui a du sens.
  const toScore = fresh.filter((c) => c.match_score === null).slice(0, 15)
  if (toScore.length > 0) {
    const byId = await scoreWithClaude(toScore, buildProfileSummary(ctx.profile), objective, 8000)
    if (byId) {
      const scored = await persistScored(sb, toScore, byId)
      const map = new Map(scored.map((s) => [s.company_target_id, s]))
      for (const c of fresh) {
        const s = map.get(c.id)
        if (!s) continue
        c.match_score = s.match_score
        c.possible_role = s.possible_role
        c.match_reason = s.match_reason
        c.recommended_angle = s.recommended_angle
        c.priority = s.priority
      }
    }
  }

  const eligible = fresh
    .filter((c) => isRetained({ match_score: c.match_score ?? 0, possible_role: c.possible_role ?? "" }))
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
    .slice(0, 15)

  state.companyQueue = eligible.map((c) => c.id)

  return {
    added: eligible.length,
    log: entry("recherche", `${eligible.length} entreprise(s) retenue(s) sur le marché caché`, {
      detail: `${found.length} entreprise(s) parcourue(s) dans le registre public.`,
    }),
  }
}

/** Rédige et enregistre une candidature spontanée, contacts compris. */
async function prepareSpontaneous(
  sb: SupabaseClient,
  userId: string,
  ctx: LoadedStudentContext,
  companyId: string,
): Promise<{ prepared: boolean; contacts: boolean; companyName: string; detail?: string }> {
  const { data: company } = await sb
    .from("company_targets")
    .select("*")
    .eq("id", companyId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!company) return { prepared: false, contacts: false, companyName: "Entreprise inconnue" }
  const target = company as CompanyTarget

  const contacts = await discoverContacts(sb, userId, target)
  const best = contacts[0] as Record<string, unknown> | undefined
  const recipient: RecipientContext | undefined =
    best && (best.full_name || best.job_title)
      ? {
          fullName: ((best.full_name as string) ?? "").trim() || undefined,
          jobTitle: ((best.job_title as string) ?? "").trim() || undefined,
        }
      : undefined

  const pkg = await generatePackage(ctx.student, target, ctx.datesGuidance, recipient)
  if (!pkg) {
    return {
      prepared: false,
      contacts: contacts.length > 0,
      companyName: target.company_name,
      detail: "Rédaction impossible.",
    }
  }

  await persistPackage(
    sb, userId, target, pkg,
    "Candidature spontanée préparée par l'agent pendant une session",
  )

  const who = recipient?.fullName ? ` · ${recipient.fullName}${recipient.jobTitle ? ` (${recipient.jobTitle})` : ""}` : ""
  return {
    prepared: true,
    contacts: contacts.length > 0,
    companyName: target.company_name,
    detail: `${target.city ?? ""}${target.match_score !== null ? ` · score ${target.match_score}/100` : ""}${who}`,
  }
}
