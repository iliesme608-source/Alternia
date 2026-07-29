import { NextRequest, NextResponse } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId, parseJsonResponse } from "@/lib/autopilot"
import type { AutopilotObjective, CandidateMasterProfile, CompanyTarget, CompanyPriority } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_SCORE_BATCH = 25

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
      max_tokens: 8000,
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
      return NextResponse.json({ error: "Scoring impossible (réponse IA invalide). Réessaie." }, { status: 502 })
    }

    // Ne garder que les scores dont l'id correspond à une entreprise du batch.
    const validIds = new Set(companies.map((c) => c.id))
    const byId = new Map(parsed.filter((s) => validIds.has(s.company_target_id)).map((s) => [s.company_target_id, s]))

    // 9. Mise à jour de company_targets (priorité dérivée + mappée en français).
    const scoredCompanies = await Promise.all(
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

    console.log("[autopilot/score-companies] scoredCompanies persisted:", scoredCompanies.map((s) => ({
      id: s.company_target_id, name: s.company_name, score: s.match_score, priority: s.priority,
    })))
    return NextResponse.json({ scoredCompanies, count: scoredCompanies.length })
  } catch (err) {
    console.error("[autopilot/score-companies]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
