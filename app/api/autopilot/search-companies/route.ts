import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import type { AutopilotObjective } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 30

const SOURCE = "recherche-entreprises.api.gouv.fr"
const MAX_SAVED = 50

// ── Mapping secteur → section NAF (INSEE) — repris de la logique prospection ────
const SECTEUR_NAF_SECTION: Record<string, string> = {
  "Informatique / Tech": "J",
  "Commerce / Marketing": "G",
  "Finance / Comptabilité": "K",
  "RH / Management": "N",
  "Communication / Média": "J",
  "Ingénierie / Industrie": "C",
  "Santé / Social": "Q",
  "Droit / Juridique": "M",
}

// ── Mapping ville/région → département (pour cibler la recherche) ───────────────
const REGION_TO_DEPT: Record<string, string> = {
  paris: "75", "île-de-france": "75", "ile-de-france": "75", idf: "75",
  lyon: "69", villeurbanne: "69", marseille: "13", toulouse: "31",
  bordeaux: "33", nantes: "44", strasbourg: "67", lille: "59", rennes: "35",
  grenoble: "38", montpellier: "34", nice: "06", tours: "37", dijon: "21",
  angers: "49", metz: "57", reims: "51", nancy: "54", caen: "14", rouen: "76",
  limoges: "87", amiens: "80", brest: "29", "clermont-ferrand": "63",
  perpignan: "66", toulon: "83", mulhouse: "68", "la rochelle": "17",
  besançon: "25", besancon: "25", poitiers: "86", pau: "64",
  orléans: "45", orleans: "45",
}

function tailleTranche(code: string): string {
  const map: Record<string, string> = {
    "00": "0 salarié", "01": "1-2 salariés", "02": "3-5 salariés",
    "03": "6-9 salariés", "11": "10-19 salariés", "12": "20-49 salariés",
    "21": "50-99 salariés", "22": "100-199 salariés", "31": "200-249 salariés",
    "32": "250-499 salariés", "41": "500-999 salariés", "42": "1 000-1 999 salariés",
    "51": "2 000-4 999 salariés", "52": "5 000-9 999 salariés", "53": "10 000+ salariés",
  }
  return map[code] ?? ""
}

// Forme brute renvoyée par l'API gouv (champs utilisés uniquement).
interface RawApiResult {
  siren?: string
  nom_raison_sociale?: string
  nom_complet?: string
  activite_principale?: string
  siege?: {
    siret?: string
    libelle_commune?: string
    departement?: string
    activite_principale?: string
    tranche_effectif_salarie?: string
  }
}

interface NormalizedCompany {
  company_name: string
  siren: string | null
  siret: string | null
  city: string | null
  region: string | null
  sector: string | null
  naf_code: string | null
  employee_range: string | null
  website: string | null
  source: string
  raw_data: RawApiResult
}

// Tables Autopilot obligatoires (cf. supabase/autopilot.sql).
const REQUIRED_TABLES = [
  "candidate_master_profiles",
  "company_targets",
  "application_packages",
  "application_events",
  "autopilot_rules",
] as const

// Détecte une erreur Supabase/PostgREST "table absente".
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === "42P01" || // PostgreSQL: undefined_table
    error.code === "PGRST205" || // PostgREST: table introuvable dans le schéma
    /does not exist|could not find the table/i.test(error.message ?? "")
  )
}

// Clé de dédoublonnage : siret > siren > company_name|city (jamais vide).
function dedupKey(c: {
  siret?: string | null
  siren?: string | null
  company_name?: string | null
  city?: string | null
}): string {
  if (c.siret) return `siret:${c.siret}`
  if (c.siren) return `siren:${c.siren}`
  return `nc:${(c.company_name ?? "").toLowerCase().trim()}|${(c.city ?? "").toLowerCase().trim()}`
}

/**
 * Recherche isolée d'entreprises via recherche-entreprises.api.gouv.fr.
 * Aucun scraping, aucune donnée inventée : website reste null si non fourni.
 */
async function searchCompanies(
  sector: string,
  region: string,
  city: string
): Promise<NormalizedCompany[]> {
  const naf = SECTEUR_NAF_SECTION[sector]
  const geo = (city || region || "").toLowerCase().trim()
  const dept = REGION_TO_DEPT[geo]

  const collected: NormalizedCompany[] = []

  // Jusqu'à 2 pages (per_page max = 25) pour atteindre ~50 résultats.
  for (let page = 1; page <= 2 && collected.length < MAX_SAVED; page++) {
    const params = new URLSearchParams({ per_page: "25", page: String(page) })
    if (naf) params.set("section_activite_principale", naf)
    if (dept) params.set("departement", dept)
    else if (geo) params.set("q", geo)

    let data: { results?: RawApiResult[] }
    try {
      const res = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?${params}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) break
      data = await res.json()
    } catch {
      break // erreur API externe : on s'arrête proprement avec ce qu'on a
    }

    const results = data.results ?? []
    if (results.length === 0) break

    for (const e of results) {
      const name = e.nom_raison_sociale ?? e.nom_complet
      const siret = e.siege?.siret ?? null
      if (!name) continue
      collected.push({
        company_name: name,
        siren: e.siren ?? null,
        siret,
        city: e.siege?.libelle_commune ?? (city || null),
        region: region || null,
        sector: sector || null,
        naf_code: e.siege?.activite_principale ?? e.activite_principale ?? null,
        employee_range: tailleTranche(e.siege?.tranche_effectif_salarie ?? "") || null,
        website: null, // l'API ne fournit pas de site web → on n'invente pas
        source: SOURCE,
        raw_data: e,
      })
    }
  }

  return collected
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { objective } = body as {
      objective?: Partial<AutopilotObjective> & {
        targetRole?: string
        sector?: string
        region?: string
        city?: string
      }
      profileId?: string
    }

    // Accepte les deux conventions de nommage (targetRole/poste, etc.).
    const poste = objective?.targetRole ?? objective?.poste ?? ""
    const sector = objective?.sector ?? objective?.secteur ?? ""
    const region = objective?.region ?? ""
    const city = objective?.city ?? objective?.ville ?? ""

    // 2. Validation des champs principaux.
    if (!poste || !sector || (!region && !city)) {
      return NextResponse.json(
        { error: "Champs requis : poste, secteur, et région ou ville." },
        { status: 400 }
      )
    }

    // 1. Auth OBLIGATOIRE pour Autopilot — aucune exception en dev.
    //    Sans persistance, les entreprises n'auraient pas d'`id` Supabase et
    //    seraient inutilisables (sélection / génération). On exige donc un user.
    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const sb = createServerClient()

    // 2. Vérifie que les tables Autopilot existent (message clair sinon).
    const tableChecks = await Promise.all(
      REQUIRED_TABLES.map(async (t) => {
        const { error } = await sb.from(t).select("id", { head: true, count: "exact" }).limit(1)
        return { table: t, missing: isMissingTable(error) }
      })
    )
    const missing = tableChecks.filter((c) => c.missing).map((c) => c.table)
    if (missing.length > 0) {
      console.error("[autopilot/search-companies] tables manquantes:", missing)
      return NextResponse.json(
        { error: "Tables Autopilot manquantes. Exécute supabase/autopilot.sql dans Supabase." },
        { status: 500 }
      )
    }

    // 3/4. Recherche isolée (réutilise la logique API gouv, pas de Claude ici).
    const found = await searchCompanies(sector, region, city)

    // Dédoublonnage interne : siret > siren > company_name + city.
    const seen = new Set<string>()
    const unique = found.filter((c) => {
      const key = dedupKey(c)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, MAX_SAVED)

    if (unique.length === 0) {
      return NextResponse.json({
        companies: [],
        count: 0,
        message: "Aucune entreprise trouvée pour ces critères. Élargis la région ou le secteur.",
      })
    }

    // 3/4. Persistance dans company_targets.
    // IMPORTANT : le frontend a besoin de l'`id` Supabase de CHAQUE entreprise
    // (sélection + /score-companies + /generate-applications). On renvoie donc
    // systématiquement des lignes persistées — celles déjà en base (doublons d'une
    // recherche précédente) comme celles fraîchement insérées.

    // Récupère les entreprises déjà en base pour ce user, indexées par clé de dédoublonnage.
    // On filtre par company_name (toujours présent) pour limiter le volume, puis on
    // matche localement sur siret > siren > name+city — robuste aux caractères spéciaux.
    const names = Array.from(new Set(unique.map((c) => c.company_name)))
    const existingByKey = new Map<string, Record<string, unknown>>()
    {
      const { data: existing, error } = await sb
        .from("company_targets")
        .select("*")
        .eq("user_id", userId)
        .in("company_name", names)
      if (error) console.error("[autopilot/search-companies] select existing error:", error)
      for (const row of existing ?? []) {
        const key = dedupKey(row as Record<string, string | null>)
        if (!existingByKey.has(key)) existingByKey.set(key, row)
      }
    }

    // N'insère que les entreprises absentes de la base.
    const toInsert = unique
      .filter((c) => !existingByKey.has(dedupKey(c)))
      .map((c) => ({
        user_id: userId,
        company_name: c.company_name,
        siren: c.siren,
        siret: c.siret,
        city: c.city,
        region: c.region,
        sector: c.sector,
        naf_code: c.naf_code,
        employee_range: c.employee_range,
        website: c.website,
        source: c.source,
        match_score: null,   // rempli par /score-companies
        match_reason: null,
        priority: null,
      }))

    const insertedByKey = new Map<string, Record<string, unknown>>()
    if (toInsert.length > 0) {
      const { data, error } = await sb.from("company_targets").insert(toInsert).select()
      if (error) {
        console.error("[autopilot/search-companies] insert error:", error)
        return NextResponse.json(
          { error: "Impossible d'enregistrer les entreprises. Réessaie." },
          { status: 500 }
        )
      }
      for (const row of data ?? []) {
        insertedByKey.set(dedupKey(row as Record<string, string | null>), row)
      }
    }

    // Reconstitue la liste finale dans l'ordre de `unique`, chaque entrée AVEC son id.
    const saved: Record<string, unknown>[] = unique.map((c) => {
      const key = dedupKey(c)
      return existingByKey.get(key) ?? insertedByKey.get(key) ?? (c as unknown as Record<string, unknown>)
    })

    return NextResponse.json({ companies: saved, count: saved.length })
  } catch (err) {
    console.error("[autopilot/search-companies]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
