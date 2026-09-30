import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId, isRetained } from "@/lib/autopilot"
import {
  buildProfileSummary,
  persistScored,
  scoreWithClaude,
  type NormalizedObjective,
} from "@/lib/company-scoring"
import type { AutopilotObjective, CandidateMasterProfile, CompanyTarget } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_SCORE_BATCH = 25

// ── Filtrage des résultats (règles 1 à 4) ─────────────────────────────────────
// Les règles 1 & 2 (isRetained, seuil de score, intitulés « pas viable ») vivent
// dans lib/autopilot : /search-companies applique les mêmes sur les entreprises
// déjà scorées lors d'une recherche précédente.
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
    const profileSummary = buildProfileSummary(profile)

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
      return NextResponse.json({ error: "Le calcul du score a échoué. Réessaie." }, { status: 502 })
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
    console.log('[score-companies] retenues:', retained.length, 'filtrées:', scoredCompanies.length - retained.length)
    console.log('[score-companies] roles:', retained.map(c => c.possible_role))
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
