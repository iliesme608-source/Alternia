import type { SupabaseClient } from "@supabase/supabase-js"
import { anthropic, MODEL } from "@/lib/anthropic"
import { parseJsonResponse } from "@/lib/autopilot"
import type { CandidateMasterProfile, CompanyTarget, CompanyPriority } from "@/types"

/**
 * Scoring IA des entreprises ciblées.
 *
 * Extrait de app/api/autopilot/score-companies pour être partagé avec l'agent
 * de démarchage nocturne : l'agent doit prioriser les entreprises exactement
 * comme le fait l'étudiant à l'étape 3.
 */

export const SCORE_SYSTEM = `Tu es un expert en recherche d'alternance en France. Tu aides un étudiant à prioriser des entreprises pour des candidatures spontanées. Tu n'as pas le droit d'inventer des informations sur l'étudiant ou sur l'entreprise. Tu dois uniquement utiliser les données fournies. Si une information est absente, tu dois rester prudent. Tu ne dois jamais affirmer qu'une entreprise recrute si ce n'est pas explicitement indiqué. Ton rôle est d'estimer la pertinence d'une candidature spontanée selon le profil, le secteur, la localisation, le poste visé et les données disponibles.

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

export interface ScoreResult {
  company_target_id: string
  match_score: number
  match_reason: string
  recommended_angle: string
  possible_role: string
}

export interface ScoredCompany {
  company_target_id: string
  company_name: string
  match_score: number
  match_reason: string
  priority: CompanyPriority
  recommended_angle: string
  possible_role: string
}

/** Objectif normalisé (les deux conventions de nommage sont déjà résolues). */
export type NormalizedObjective = Record<string, string>

/** Dérive la priorité du score (cohérence garantie côté serveur). */
export function priorityFromScore(score: number): CompanyPriority {
  if (score >= 80) return "high"
  if (score >= 60) return "medium"
  return "low"
}

/** Contexte candidat transmis au scoring — uniquement des données vérifiées. */
export function buildProfileSummary(profile: CandidateMasterProfile | null): unknown {
  if (!profile) return { note: "Profil candidat non fourni — rester prudent." }
  return {
    verified_skills: profile.verified_skills,
    tools: profile.tools,
    education: profile.education,
    experiences: profile.verified_experiences?.map((e) => `${e.poste} — ${e.entreprise}`) ?? [],
    target_roles: profile.target_roles,
  }
}

/**
 * Un tour de scoring Claude sur un batch d'entreprises.
 * Retourne les scores indexés par company_target_id, ou null si la réponse
 * est inexploitable (JSON tronqué / non parsable).
 */
export async function scoreWithClaude(
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
    // Marge volontairement large : un tableau JSON tronqué faisait échouer tout
    // le scoring (« scoring indisponible »).
    max_tokens: maxTokens,
    system: SCORE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  })

  const raw = response.content[0].type === "text" ? response.content[0].text : ""
  const parsed = parseJsonResponse<ScoreResult[]>(raw)
  console.log("[company-scoring] réponse:", {
    stop_reason: response.stop_reason,
    companiesRequested: companies.length,
    rawLength: raw.length,
    parsedCount: Array.isArray(parsed) ? parsed.length : null,
    parseOk: Array.isArray(parsed),
  })

  if (!parsed || !Array.isArray(parsed)) {
    console.error("[company-scoring] JSON non parsable:", raw.slice(0, 300))
    return null
  }

  // Ne garder que les scores dont l'id correspond à une entreprise du batch.
  const validIds = new Set(companies.map((c) => c.id))
  return new Map(
    parsed.filter((s) => validIds.has(s.company_target_id)).map((s) => [s.company_target_id, s]),
  )
}

/**
 * Persiste les scores dans company_targets et renvoie la forme exposée à l'API.
 * La persistance couvre TOUT le batch — le filtrage ne concerne que la réponse,
 * pour ne pas perdre le score des entreprises écartées.
 */
export async function persistScored(
  sb: SupabaseClient,
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
      if (error) console.error("[company-scoring] update error:", c.id, error)

      return {
        company_target_id: c.id,
        company_name: c.company_name,
        match_score: score,
        match_reason: reason,
        priority,
        recommended_angle: recommendedAngle,
        possible_role: possibleRole,
      }
    }),
  )
}
