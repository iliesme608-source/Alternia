import type { SupabaseClient } from "@supabase/supabase-js"
import { isNonViableRole } from "@/lib/autopilot"

/**
 * Recherche d'entreprises dans le registre public
 * (recherche-entreprises.api.gouv.fr) + persistance dans company_targets.
 *
 * Extrait de app/api/autopilot/search-companies pour être partagé avec l'agent
 * de démarchage nocturne : les deux parcours doivent chercher EXACTEMENT les
 * mêmes entreprises, avec le même filtre géographique et le même dédoublonnage.
 *
 * Aucune donnée n'est inventée : `website` reste null tant qu'aucune source ne
 * le fournit.
 */

export const SOURCE = "recherche-entreprises.api.gouv.fr"
export const MAX_SAVED = 50

// ── Mapping secteur → section NAF (INSEE) ─────────────────────────────────────
export const SECTEUR_NAF_SECTION: Record<string, string> = {
  "Informatique / Tech": "J",
  "Commerce / Marketing": "G",
  "Finance / Comptabilité": "K",
  "RH / Management": "N",
  "Communication / Média": "J",
  "Ingénierie / Industrie": "C",
  "Santé / Social": "Q",
  "Droit / Juridique": "M",
}

// ── Mapping ville/région → département (pour cibler la recherche) ─────────────
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

// ── Régions → départements (filtre géographique côté code) ───────────────────
// L'API gouv élargit parfois la recherche hors du périmètre demandé (ex. Roubaix
// ou Lyon pour une recherche Île-de-France). On re-filtre donc les résultats.
const REGION_DEPARTMENTS: Record<string, string[]> = {
  "ile-de-france": ["75", "77", "78", "91", "92", "93", "94", "95"],
  "auvergne-rhone-alpes": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  "bourgogne-franche-comte": ["21", "25", "39", "58", "70", "71", "89", "90"],
  bretagne: ["22", "29", "35", "56"],
  "centre-val de loire": ["18", "28", "36", "37", "41", "45"],
  corse: ["2A", "2B"],
  "grand est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "hauts-de-france": ["02", "59", "60", "62", "80"],
  normandie: ["14", "27", "50", "61", "76"],
  "nouvelle-aquitaine": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  occitanie: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "pays de la loire": ["44", "49", "53", "72", "85"],
  "provence-alpes-cote d'azur": ["04", "05", "06", "13", "83", "84"],
  guadeloupe: ["971"],
  martinique: ["972"],
  guyane: ["973"],
  "la reunion": ["974"],
  mayotte: ["976"],
}

// Alias fréquents saisis par l'utilisateur → clé canonique de REGION_DEPARTMENTS.
const REGION_ALIASES: Record<string, string> = {
  idf: "ile-de-france",
  paris: "ile-de-france",
  "region parisienne": "ile-de-france",
  "ile de france": "ile-de-france",
  paca: "provence-alpes-cote d'azur",
  "provence alpes cote d'azur": "provence-alpes-cote d'azur",
  "auvergne rhone alpes": "auvergne-rhone-alpes",
  "rhone-alpes": "auvergne-rhone-alpes",
  "bourgogne franche comte": "bourgogne-franche-comte",
  "centre-val-de-loire": "centre-val de loire",
  "grand-est": "grand est",
  "hauts de france": "hauts-de-france",
  "nord-pas-de-calais": "hauts-de-france",
  "nouvelle aquitaine": "nouvelle-aquitaine",
  "pays-de-la-loire": "pays de la loire",
  reunion: "la reunion",
}

/** Minuscules + accents retirés, pour comparer villes/régions de façon fiable. */
function normalizeGeo(v: string): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

/**
 * Départements autorisés pour la recherche demandée.
 * Retourne null si le périmètre n'est pas identifiable (aucun filtre appliqué).
 */
function allowedDepartments(region: string, city: string): string[] | null {
  const r = normalizeGeo(region)
  if (r) {
    const key = REGION_ALIASES[r] ?? r
    if (REGION_DEPARTMENTS[key]) return REGION_DEPARTMENTS[key]
    const dept = REGION_TO_DEPT[r]
    if (dept) return [dept] // "région" saisie comme une ville (ex. "Lyon")
  }
  const c = normalizeGeo(city)
  if (c && REGION_TO_DEPT[c]) return [REGION_TO_DEPT[c]]
  return null
}

// Département d'une entreprise : champ dédié, sinon code postal, sinon ville connue.
function companyDepartment(e: RawApiResult): string | null {
  const dept = e.siege?.departement?.trim()
  if (dept) return dept.toUpperCase()

  const cp = e.siege?.code_postal?.trim()
  if (cp && /^\d{5}$/.test(cp)) return cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)

  const commune = normalizeGeo(e.siege?.libelle_commune ?? "")
  return REGION_TO_DEPT[commune] ?? null
}

/**
 * Vrai si l'entreprise appartient bien au périmètre demandé.
 * Département inconnu : on ne garde que si la ville correspond à la demande.
 */
function matchesRequestedArea(
  e: RawApiResult,
  allowed: string[],
  region: string,
  city: string,
): boolean {
  const dept = companyDepartment(e)
  if (dept) return allowed.includes(dept)

  const commune = normalizeGeo(e.siege?.libelle_commune ?? "")
  if (!commune) return false
  return commune === normalizeGeo(city) || commune === normalizeGeo(region)
}

export function tailleTranche(code: string): string {
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
export interface RawApiResult {
  siren?: string
  nom_raison_sociale?: string
  nom_complet?: string
  activite_principale?: string
  siege?: {
    siret?: string
    libelle_commune?: string
    code_postal?: string
    departement?: string
    activite_principale?: string
    tranche_effectif_salarie?: string
  }
}

export interface NormalizedCompany {
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
export const REQUIRED_TABLES = [
  "candidate_master_profiles",
  "company_targets",
  "application_packages",
  "application_events",
  "autopilot_rules",
] as const

/** Détecte une erreur Supabase/PostgREST "table absente". */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === "42P01" || // PostgreSQL: undefined_table
    error.code === "PGRST205" || // PostgREST: table introuvable dans le schéma
    /does not exist|could not find the table/i.test(error.message ?? "")
  )
}

/** Clé de dédoublonnage : siret > siren > company_name|city (jamais vide). */
export function dedupKey(c: {
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
export async function searchRegistry(
  sector: string,
  region: string,
  city: string,
): Promise<NormalizedCompany[]> {
  const naf = SECTEUR_NAF_SECTION[sector]
  const geo = (city || region || "").toLowerCase().trim()
  const dept = REGION_TO_DEPT[geo]

  // Périmètre géographique attendu : null = non identifiable → pas de filtre.
  const allowed = allowedDepartments(region, city)

  const collected: NormalizedCompany[] = []
  let rejected = 0

  // Jusqu'à 2 pages (per_page max = 25) pour atteindre ~50 résultats.
  for (let page = 1; page <= 2 && collected.length < MAX_SAVED; page++) {
    const params = new URLSearchParams({ per_page: "25", page: String(page) })
    if (naf) params.set("section_activite_principale", naf)
    if (dept) params.set("departement", dept)
    else if (geo) params.set("q", geo)

    let data: { results?: RawApiResult[] }
    try {
      const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${params}`, {
        signal: AbortSignal.timeout(8000),
      })
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

      // Filtre géographique : l'API renvoie parfois des villes hors périmètre
      // (Roubaix, Lille, Lyon… pour une recherche Île-de-France) → on les retire.
      if (allowed && !matchesRequestedArea(e, allowed, region, city)) {
        rejected++
        continue
      }

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

  if (rejected > 0) {
    console.log(
      `[company-search] ${rejected} entreprise(s) hors périmètre écartée(s)`,
      { region, city, allowed },
    )
  }

  return collected
}

export interface SearchAndPersistResult {
  companies: Record<string, unknown>[]
  count: number
  message?: string
  /** Tables Autopilot manquantes (migration non jouée). */
  missingTables?: string[]
  /** Erreur bloquante côté persistance. */
  error?: string
}

/**
 * Cherche dans le registre PUIS persiste dans company_targets, en renvoyant
 * toujours des lignes qui portent leur `id` Supabase — sans cet id, une
 * entreprise est inutilisable en aval (sélection, scoring, génération).
 *
 * Les entreprises déjà marquées non viables par un scoring précédent sont
 * écartées de la réponse (mais conservées en base).
 */
export async function searchAndPersistCompanies(
  sb: SupabaseClient,
  userId: string,
  input: { sector: string; region: string; city: string },
  options: { checkTables?: boolean } = {},
): Promise<SearchAndPersistResult> {
  const { sector, region, city } = input

  // Vérifie que les tables Autopilot existent (message clair sinon).
  if (options.checkTables !== false) {
    const tableChecks = await Promise.all(
      REQUIRED_TABLES.map(async (t) => {
        const { error } = await sb.from(t).select("id", { head: true, count: "exact" }).limit(1)
        return { table: t, missing: isMissingTable(error) }
      }),
    )
    const missing = tableChecks.filter((c) => c.missing).map((c) => c.table)
    if (missing.length > 0) {
      console.error("[company-search] tables manquantes:", missing)
      return { companies: [], count: 0, missingTables: missing }
    }
  }

  const found = await searchRegistry(sector, region, city)

  // Dédoublonnage interne : siret > siren > company_name + city.
  const seen = new Set<string>()
  const unique = found
    .filter((c) => {
      const key = dedupKey(c)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_SAVED)

  if (unique.length === 0) {
    return {
      companies: [],
      count: 0,
      message: "Aucune entreprise trouvée pour ces critères. Élargis la région ou le secteur.",
    }
  }

  // Entreprises déjà en base pour ce user, indexées par clé de dédoublonnage.
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
    if (error) console.error("[company-search] select existing error:", error)
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
      match_score: null, // rempli par le scoring
      match_reason: null,
      priority: null,
    }))

  const insertedByKey = new Map<string, Record<string, unknown>>()
  if (toInsert.length > 0) {
    const { data, error } = await sb.from("company_targets").insert(toInsert).select()
    if (error) {
      console.error("[company-search] insert error:", error)
      return { companies: [], count: 0, error: "Impossible d'enregistrer les entreprises. Réessaie." }
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

  // Les lignes déjà en base peuvent porter un possible_role issu d'un scoring
  // précédent : on écarte celles marquées non viables. Les entreprises jamais
  // scorées (possible_role vide) passent toujours.
  const companies = saved.filter((c) => !isNonViableRole(c.possible_role as string | null))
  const excluded = saved.length - companies.length
  if (excluded > 0) console.log("[company-search] non viables écartées:", excluded)

  return { companies, count: companies.length }
}
