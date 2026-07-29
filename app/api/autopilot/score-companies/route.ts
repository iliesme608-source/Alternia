import { NextRequest, NextResponse } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId, parseJsonResponse } from "@/lib/autopilot"
import type { AutopilotObjective, CandidateMasterProfile, CompanyTarget, CompanyPriority } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_SCORE_BATCH = 25

// ── Filtrage des résultats (règles 1 à 4) ─────────────────────────────────────
// Attention : l'échelle interne est 0-100, pas 0-10. Le seuil « 3/10 » vaut donc 30.
const MIN_SCORE = 30
// En dessous de ce nombre de résultats retenus, on complète via une recherche
// SIRENE élargie (règle 4).
const MIN_RESULTS = 5
const TARGET_RESULTS = 10
// Le complément est scoré par un 2e appel Claude : batch volontairement réduit
// pour rester dans maxDuration (60 s) même quand le premier scoring a été lent.
const MAX_TOPUP_BATCH = 15

/**
 * Secteurs voisins utilisés pour élargir la recherche (règle 4).
 * Les clés reprennent SECTEUR_NAF_SECTION de /search-companies : un secteur
 * absent de ce mapping ne pose aucune restriction NAF côté API gouv, d'où
 * « Tous secteurs » en dernier recours.
 */
const BROADER_SECTORS: Record<string, string[]> = {
  "Informatique / Tech":     ["Communication / Média", "Ingénierie / Industrie", "Commerce / Marketing"],
  "Commerce / Marketing":    ["Communication / Média", "Finance / Comptabilité", "Informatique / Tech"],
  "Finance / Comptabilité":  ["Commerce / Marketing", "Droit / Juridique", "RH / Management"],
  "RH / Management":         ["Finance / Comptabilité", "Commerce / Marketing", "Droit / Juridique"],
  "Communication / Média":   ["Commerce / Marketing", "Informatique / Tech"],
  "Ingénierie / Industrie":  ["Informatique / Tech", "Commerce / Marketing"],
  "Santé / Social":          ["RH / Management", "Ingénierie / Industrie"],
  "Droit / Juridique":       ["Finance / Comptabilité", "RH / Management"],
}

/** Minuscules + accents retirés, pour comparer les intitulés de poste. */
function normalizeRole(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

// Formulations par lesquelles le modèle signale qu'aucun poste ne correspond.
const NO_ROLE_PATTERNS: RegExp[] = [
  /pas viable/,
  /non viable/,
  /non applicable/,
  /^n\.?\/?a\.?$/,
  /aucune?\s+(role|poste|fonction|opportunite|correspondance|piste)/,
  /pas\s+(de|d')\s*(role|poste|fonction)/,
  /non\s+(pertinent|concerne|adapte|identifie)/,
  /sans\s+(objet|correspondance)/,
  /inadapte/,
  /^(aucun|aucune|neant|rien|non|-{1,2}|—|\.{1,3})$/,
]

// Intitulés non négatifs mais trop vagues pour compter comme « poste concret ».
const VAGUE_ROLES = new Set([
  "alternance", "stage", "poste", "emploi", "a definir", "a preciser",
  "variable", "divers", "indetermine", "inconnu", "non precise",
])

/** Règle 1 — l'intitulé indique qu'aucun poste correspondant n'existe. */
function isNoRole(role: string): boolean {
  const r = normalizeRole(role)
  if (!r) return true
  return NO_ROLE_PATTERNS.some((re) => re.test(r))
}

/** Règle 2 — intitulé concret et positif (« Data Analyst », « Chargé de reporting »…). */
function isConcreteRole(role: string): boolean {
  const r = normalizeRole(role)
  if (isNoRole(role) || VAGUE_ROLES.has(r)) return false
  return r.length >= 3 && /[a-z]/.test(r)
}

/** Règles 1 + 2 réunies : l'entreprise mérite-t-elle d'être retournée ? */
function isRetained(c: { match_score: number; possible_role: string }): boolean {
  if (isNoRole(c.possible_role)) return false
  return c.match_score >= MIN_SCORE || isConcreteRole(c.possible_role)
}

// Dérive la priorité du score (cohérence garantie côté serveur). Anglais partout.
function priorityFromScore(score: number): CompanyPriority {
  if (score >= 80) return "high"
  if (score >= 60) return "medium"
  return "low"
}

const SCORE_SYSTEM = `Tu es un expert en recherche d'alternance en France. Tu aides un étudiant à prioriser des entreprises pour des candidatures spontanées. Tu n'as pas le droit d'inventer des informations sur l'étudiant ou sur l'entreprise. Tu dois uniquement utiliser les données fournies. Si une information est absente, tu dois rester prudent. Tu ne dois jamais affirmer qu'une entreprise recrute si ce n'est pas explicitement indiqué. Ton rôle est d'estimer la pertinence d'une candidature spontanée selon le profil, le secteur, la localisation, le poste visé et les données disponibles.

Tu renvoies UNIQUEMENT un tableau JSON valide (aucun texte autour), un objet par entreprise :
[
  {
    "company_target_id": "id fourni",
    "match_score": 0-100,
    "match_reason": "justification courte, prudente. Formuler du type : Cette entreprise semble pertinente pour une candidature spontanée car...",
    "recommended_angle": "angle de candidature recommandé, basé uniquement sur les données",
    "possible_role": "type de poste possible cohérent avec le profil et le secteur"
  }
]

Règles :
- match_score entre 0 et 100.
- Ne jamais prétendre que l'entreprise recrute si ce n'est pas indiqué.
- Si des données entreprise manquent, reste prudent et baisse la confiance.
- Réponds pour CHAQUE entreprise fournie, en réutilisant exactement son company_target_id.`

interface ScoreResult {
  company_target_id: string
  match_score: number
  match_reason: string
  recommended_angle: string
  possible_role: string
}

interface ScoredCompany {
  company_target_id: string
  company_name: string
  match_score: number
  match_reason: string
  priority: CompanyPriority
  recommended_angle: string
  possible_role: string
}

/** Objectif normalisé (les deux conventions de nommage sont déjà résolues). */
type NormalizedObjective = Record<string, string>

/**
 * Un tour de scoring Claude sur un batch d'entreprises.
 * Retourne les scores indexés par company_target_id, ou null si la réponse
 * est inexploitable (JSON tronqué / non parsable).
 */
async function scoreWithClaude(
  companies: CompanyTarget[],
  profileSummary: unknown,
  obj: NormalizedObjective,
  maxTokens: number,
): Promise<Map<string, ScoreResult> | null> {
  const companyList = companies.map((c) => ({
    company_target_id: c.id,
    company_name: c.company_name,
    city: c.city,
    region: c.region,
    sector: c.sector,
    naf_code: c.naf_code,
    employee_range: c.employee_range,
  }))

  const userPrompt = `PROFIL CANDIDAT (données vérifiées) :
${JSON.stringify(profileSummary, null, 2)}

OBJECTIF D'ALTERNANCE :
${JSON.stringify(obj, null, 2)}

ENTREPRISES À ÉVALUER (${companyList.length}) :
${JSON.stringify(companyList, null, 2)}

Score chaque entreprise pour une candidature spontanée. Réponds avec le tableau JSON demandé.`

  const response = await anthropic.messages.create({
    model: MODEL,
    // 8000 tokens : évite la troncature du tableau JSON quand on score jusqu'à 25
    // entreprises (chaque objet = id + reason + angle + role). Un JSON tronqué
    // était la cause du "scoring indisponible" (502 → parse échouait).
    max_tokens: maxTokens,
    system: SCORE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  })

  const raw = response.content[0].type === "text" ? response.content[0].text : ""
  const parsed = parseJsonResponse<ScoreResult[]>(raw)
  console.log("[autopilot/score-companies] Scoring response:", {
    stop_reason: response.stop_reason,
    companiesRequested: companies.length,
    rawLength: raw.length,
    parsedCount: Array.isArray(parsed) ? parsed.length : null,
    parseOk: Array.isArray(parsed),
  })

  if (!parsed || !Array.isArray(parsed)) {
    console.error("[autopilot/score-companies] JSON non parsable:", raw.slice(0, 300))
    return null
  }

  // Ne garder que les scores dont l'id correspond à une entreprise du batch.
  const validIds = new Set(companies.map((c) => c.id))
  return new Map(parsed.filter((s) => validIds.has(s.company_target_id)).map((s) => [s.company_target_id, s]))
}

/**
 * Persiste les scores dans company_targets et renvoie la forme exposée à l'API.
 * La persistance couvre TOUT le batch — le filtrage ne concerne que la réponse,
 * pour ne pas perdre le score des entreprises écartées.
 */
async function persistScored(
  sb: ReturnType<typeof createServerClient>,
  companies: CompanyTarget[],
  byId: Map<string, ScoreResult>,
): Promise<ScoredCompany[]> {
  return Promise.all(
    companies.map(async (c) => {
      const s = byId.get(c.id)
      const score = Math.max(0, Math.min(100, Math.round(Number(s?.match_score ?? 0))))
      const priority = priorityFromScore(score)
      const reason = s?.match_reason ?? ""
      const recommendedAngle = s?.recommended_angle ?? ""
      const possibleRole = s?.possible_role ?? ""

      const { error } = await sb
        .from("company_targets")
        .update({
          match_score: score,
          match_reason: reason,
          priority,
          recommended_angle: recommendedAngle,
          possible_role: possibleRole,
        })
        .eq("id", c.id)
        .eq("user_id", c.user_id)
      if (error) console.error("[autopilot/score-companies] update error:", c.id, error)

      return {
        company_target_id: c.id,
        company_name: c.company_name,
        match_score: score,
        match_reason: reason,
        priority, // anglais partout
        recommended_angle: recommendedAngle,
        possible_role: possibleRole,
      }
    })
  )
}

/**
 * Règle 4 — complément SIRENE à critères élargis.
 * Réutilise /search-companies (persistance + dédoublonnage + filtre géographique
 * déjà gérés là-bas) sur les secteurs voisins, en retirant la contrainte de ville
 * quand une région est disponible. Les entreprises déjà connues sont exclues.
 */
async function fetchBroaderCompanies(
  request: NextRequest,
  obj: NormalizedObjective,
  excludeIds: Set<string>,
  limit: number,
): Promise<CompanyTarget[]> {
  // /search-companies exige poste + secteur + (région ou ville).
  if (!obj.poste || (!obj.region && !obj.ville)) return []

  const sectors = [...(BROADER_SECTORS[obj.secteur] ?? []), "Tous secteurs"]
  // Périmètre élargi : on abandonne la ville dès qu'une région est connue.
  const region = obj.region || obj.ville
  const city = obj.region ? "" : obj.ville

  const auth = request.headers.get("authorization")
  const cookie = request.headers.get("cookie")
  const collected: CompanyTarget[] = []
  const seen = new Set(excludeIds)

  for (const sector of sectors) {
    if (collected.length >= limit) break

    let payload: { companies?: CompanyTarget[] }
    try {
      const res = await fetch(new URL("/api/autopilot/search-companies", request.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: auth } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({
          objective: { targetRole: obj.poste, sector, region, city },
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) continue
      payload = await res.json()
    } catch (e) {
      console.error("[autopilot/score-companies] élargissement échoué:", sector, e)
      continue
    }

    for (const c of payload.companies ?? []) {
      // Sans id Supabase, l'entreprise est inutilisable en aval (génération).
      if (!c?.id || seen.has(c.id)) continue
      seen.add(c.id)
      collected.push(c)
      if (collected.length >= limit) break
    }
  }

  console.log("[autopilot/score-companies] élargissement SIRENE:", {
    secteurOrigine: obj.secteur, secteursTestes: sectors, trouvees: collected.length,
  })
  return collected
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { profileId, objective, companyTargetIds } = body as {
      profileId?: string
      objective?: Partial<AutopilotObjective> & {
        targetRole?: string
        sector?: string
        region?: string
        city?: string
        educationLevel?: string
        rhythm?: string
        startDate?: string
        duration?: string
        contractType?: string
      }
      companyTargetIds?: string[]
    }

    // 1/2. Auth requise (401 hors dev).
    const userId = await resolveUserId(request)
    const isDev = process.env.NODE_ENV === "development"
    if (!userId && !isDev) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const sb = createServerClient()

    // 3. Profil candidat maître : profileId fourni, sinon le dernier du user.
    let profile: CandidateMasterProfile | null = null
    {
      let q = sb.from("candidate_master_profiles").select("*")
      if (userId) q = q.eq("user_id", userId)
      if (profileId) q = q.eq("id", profileId)
      else q = q.order("created_at", { ascending: false })
      const { data } = await q.limit(1).maybeSingle()
      profile = (data as CandidateMasterProfile) ?? null
    }

    // 4/5. Entreprises à scorer (appartenant au user), max 25.
    let companies: CompanyTarget[] = []
    {
      let q = sb.from("company_targets").select("*")
      if (userId) q = q.eq("user_id", userId)
      if (companyTargetIds && companyTargetIds.length > 0) {
        q = q.in("id", companyTargetIds)
      } else {
        q = q.is("match_score", null).order("created_at", { ascending: false })
      }
      const { data } = await q.limit(MAX_SCORE_BATCH)
      companies = (data as CompanyTarget[]) ?? []
    }

    if (companies.length === 0) {
      return NextResponse.json({ scoredCompanies: [], count: 0, message: "Aucune entreprise à scorer." })
    }

    // 7. Construction du contexte pour Claude (données vérifiées uniquement).
    const profileSummary = profile
      ? {
          verified_skills: profile.verified_skills,
          tools: profile.tools,
          education: profile.education,
          experiences: profile.verified_experiences?.map((e) => `${e.poste} — ${e.entreprise}`) ?? [],
          target_roles: profile.target_roles,
        }
      : { note: "Profil candidat non fourni — rester prudent." }

    const obj = {
      poste: objective?.targetRole ?? objective?.poste ?? "",
      secteur: objective?.sector ?? objective?.secteur ?? "",
      region: objective?.region ?? "",
      ville: objective?.city ?? objective?.ville ?? "",
      niveau: objective?.educationLevel ?? objective?.niveau ?? "",
      rythme: objective?.rhythm ?? objective?.rythme ?? "",
      date_debut: objective?.startDate ?? objective?.date_debut ?? "",
      duree: objective?.duration ?? objective?.duree ?? "",
      type_contrat: objective?.contractType ?? objective?.type_contrat ?? "",
    }

    // 8. Scoring du batch initial.
    const byId = await scoreWithClaude(companies, profileSummary, obj, 8000)
    if (!byId) {
      return NextResponse.json({ error: "Scoring impossible (réponse IA invalide). Réessaie." }, { status: 502 })
    }

    // 9. Mise à jour de company_targets (priorité dérivée + mappée en français).
    const scoredCompanies = await persistScored(sb, companies, byId)

    console.log("[autopilot/score-companies] scoredCompanies persisted:", scoredCompanies.map((s) => ({
      id: s.company_target_id, name: s.company_name, score: s.match_score, priority: s.priority,
    })))

    // 10. Règles 1 & 2 : on écarte les « pas de poste correspondant », puis on ne
    //     garde que score >= MIN_SCORE ou un intitulé de poste concret.
    //     Règle 3 : tri par score décroissant.
    const retained = scoredCompanies.filter(isRetained).sort((a, b) => b.match_score - a.match_score)
    const filteredOut = scoredCompanies.length - retained.length

    // 11. Règle 4 : moins de MIN_RESULTS retenues → recherche SIRENE élargie,
    //     scorée et filtrée avec les mêmes règles, jusqu'à TARGET_RESULTS.
    let broadened = false
    if (retained.length < MIN_RESULTS) {
      const excludeIds = new Set(companies.map((c) => c.id))
      const extra = await fetchBroaderCompanies(
        request, obj, excludeIds, Math.min(MAX_TOPUP_BATCH, (TARGET_RESULTS - retained.length) * 3),
      )

      if (extra.length > 0) {
        broadened = true
        // Batch réduit → 4000 tokens suffisent et tiennent dans maxDuration.
        const extraById = await scoreWithClaude(extra, profileSummary, obj, 4000)
        if (extraById) {
          const extraScored = await persistScored(sb, extra, extraById)
          retained.push(...extraScored.filter(isRetained))
          retained.sort((a, b) => b.match_score - a.match_score)
          retained.splice(TARGET_RESULTS)
        }
      }
    }

    console.log("[autopilot/score-companies] filtrage:", {
      scorees: scoredCompanies.length, retenues: retained.length, ecartees: filteredOut, elargissement: broadened,
    })
    return NextResponse.json({
      scoredCompanies: retained,
      count: retained.length,
      filtered: filteredOut,
      broadened,
    })
  } catch (err) {
    console.error("[autopilot/score-companies]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
