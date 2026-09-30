/**
 * Source d'offres — France Travail, API « Offres d'emploi v2 ».
 *
 * C'est le plus gros gisement d'offres accessible légalement en France
 * (~300 000 offres actives) et il AGRÈGE de nombreux partenaires : une offre
 * renvoyée porte dans `origineOffre.partenaires` le site d'où elle vient. On
 * couvre donc bien plus que le seul site France Travail, sans scraper personne.
 *
 * Deux choix de conception importants :
 *
 * 1. Les codes de contrat alternance ne sont JAMAIS codés en dur. On lit le
 *    référentiel `naturesContrats` de l'API et on retient les codes dont le
 *    libellé parle d'apprentissage ou de professionnalisation. Si France Travail
 *    renumérote ses codes, on suit automatiquement au lieu de renvoyer zéro
 *    offre en silence.
 *
 * 2. Rien n'est inventé. Sans identifiants, `isConfigured()` est faux et
 *    l'appelant le dit à l'étudiant — on ne sert pas de fausses offres.
 *
 * Identifiants : inscription gratuite sur francetravail.io, création d'une app,
 * activation de l'API « Offres d'emploi v2 ».
 *   FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET
 */

const TOKEN_URL =
  "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire"
const API_BASE = "https://api.francetravail.io/partenaire/offresdemploi/v2"
const SCOPE = "api_offresdemploiv2 o2dsoffre"

export const SOURCE_LABEL = "France Travail"

// ── Offre normalisée, indépendante de la source ───────────────────────────────

export interface JobOffer {
  /** Identifiant stable chez la source — sert à ne jamais postuler deux fois. */
  id: string
  source: string
  /** Sites partenaires ayant diffusé l'offre (France Travail en agrège beaucoup). */
  partners: string[]
  title: string
  company: string
  companyDescription: string
  location: string
  postalCode: string
  contractLabel: string
  workingTime: string
  salary: string
  experience: string
  publishedAt: string
  description: string
  skills: string[]
  romeCode: string
  romeLabel: string
  sector: string
  /** Lien public vers l'offre d'origine. */
  url: string
  /** Contact publié par le recruteur — souvent absent, jamais deviné. */
  contactEmail: string | null
  applyUrl: string | null
}

export interface SearchCriteria {
  /** Mots-clés — typiquement le poste recherché. */
  keywords?: string
  /** Départements ciblés (« 75 », « 69 »…). */
  departments?: string[]
  /** Code INSEE de commune, pour une recherche par rayon. */
  commune?: string
  /** Rayon en km autour de la commune. */
  distanceKm?: number
  /** Ancienneté maximale de publication : 1, 3, 7, 14 ou 31 jours. */
  publishedWithinDays?: 1 | 3 | 7 | 14 | 31
  /** Fenêtre de pagination (l'API plafonne à 150 résultats par appel). */
  from?: number
  size?: number
}

export function isConfigured(): boolean {
  return Boolean(process.env.FRANCE_TRAVAIL_CLIENT_ID && process.env.FRANCE_TRAVAIL_CLIENT_SECRET)
}

// ── Jeton OAuth (mis en cache le temps de sa validité) ────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string | null> {
  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  // 30 s de marge : un jeton qui expire pendant la requête la ferait échouer.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: SCOPE,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error("[france-travail] jeton refusé:", res.status, (await res.text()).slice(0, 200))
      return null
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null

    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 1200) * 1000,
    }
    return cachedToken.value
  } catch (err) {
    console.error("[france-travail] jeton:", err)
    return null
  }
}

// ── Référentiel des natures de contrat ────────────────────────────────────────

interface ReferentialEntry {
  code?: string
  libelle?: string
}

let cachedContractCodes: { codes: string[]; labels: string[]; fetchedAt: number } | null = null
const REFERENTIAL_TTL_MS = 12 * 60 * 60 * 1000

/**
 * Codes `natureContrat` correspondant à l'alternance, lus dans le référentiel
 * de l'API. On ne suppose rien sur la valeur des codes (E1, E2, FS…) : seuls
 * les libellés font foi.
 *
 * Renvoie une liste vide si le référentiel est inaccessible — l'appelant fait
 * alors une recherche non filtrée et s'appuie sur le drapeau `alternance` de
 * chaque offre, plutôt que de ne rien renvoyer.
 */
export async function getAlternanceContractCodes(): Promise<{ codes: string[]; labels: string[] }> {
  if (cachedContractCodes && Date.now() - cachedContractCodes.fetchedAt < REFERENTIAL_TTL_MS) {
    return { codes: cachedContractCodes.codes, labels: cachedContractCodes.labels }
  }

  const token = await getToken()
  if (!token) return { codes: [], labels: [] }

  try {
    const res = await fetch(`${API_BASE}/referentiel/naturesContrats`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error("[france-travail] référentiel naturesContrats:", res.status)
      return { codes: [], labels: [] }
    }
    const entries = (await res.json()) as ReferentialEntry[]
    const matched = (Array.isArray(entries) ? entries : []).filter((e) =>
      /apprentissage|professionnalisation|alternance/i.test(e.libelle ?? ""),
    )

    const result = {
      codes: matched.map((e) => e.code ?? "").filter(Boolean),
      labels: matched.map((e) => e.libelle ?? "").filter(Boolean),
    }
    cachedContractCodes = { ...result, fetchedAt: Date.now() }
    console.log("[france-travail] codes alternance résolus:", result)
    return result
  } catch (err) {
    console.error("[france-travail] référentiel:", err)
    return { codes: [], labels: [] }
  }
}

// ── Normalisation ─────────────────────────────────────────────────────────────

interface RawOffer {
  id?: string
  intitule?: string
  description?: string
  dateCreation?: string
  lieuTravail?: { libelle?: string; codePostal?: string; commune?: string }
  romeCode?: string
  romeLibelle?: string
  entreprise?: { nom?: string; description?: string; url?: string }
  typeContratLibelle?: string
  natureContrat?: string
  experienceLibelle?: string
  competences?: { libelle?: string }[]
  salaire?: { libelle?: string; commentaire?: string }
  dureeTravailLibelle?: string
  alternance?: boolean
  secteurActiviteLibelle?: string
  contact?: { courriel?: string; urlPostulation?: string; nom?: string }
  origineOffre?: { urlOrigine?: string; partenaires?: { nom?: string; url?: string }[] }
}

function normalize(raw: RawOffer): JobOffer | null {
  const id = (raw.id ?? "").trim()
  const title = (raw.intitule ?? "").trim()
  if (!id || !title) return null

  return {
    id,
    source: SOURCE_LABEL,
    partners: (raw.origineOffre?.partenaires ?? []).map((p) => p.nom ?? "").filter(Boolean),
    title,
    // Une offre anonymisée n'a pas de nom d'entreprise : on le dit, on n'invente pas.
    company: (raw.entreprise?.nom ?? "").trim(),
    companyDescription: (raw.entreprise?.description ?? "").trim(),
    location: (raw.lieuTravail?.libelle ?? "").trim(),
    postalCode: (raw.lieuTravail?.codePostal ?? "").trim(),
    contractLabel: [raw.typeContratLibelle, raw.natureContrat].filter(Boolean).join(" · "),
    workingTime: (raw.dureeTravailLibelle ?? "").trim(),
    salary: [raw.salaire?.libelle, raw.salaire?.commentaire].filter(Boolean).join(", "),
    experience: (raw.experienceLibelle ?? "").trim(),
    publishedAt: raw.dateCreation ?? "",
    description: (raw.description ?? "").trim(),
    skills: (raw.competences ?? []).map((c) => c.libelle ?? "").filter(Boolean),
    romeCode: raw.romeCode ?? "",
    romeLabel: raw.romeLibelle ?? "",
    sector: raw.secteurActiviteLibelle ?? "",
    url: raw.origineOffre?.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${id}`,
    contactEmail: raw.contact?.courriel?.trim() || null,
    applyUrl: raw.contact?.urlPostulation?.trim() || null,
  }
}

/** Vrai si l'offre est bien une alternance (drapeau explicite ou libellé). */
function looksLikeAlternance(raw: RawOffer, codes: string[]): boolean {
  if (raw.alternance === true) return true
  if (raw.natureContrat && codes.includes(raw.natureContrat)) return true
  const hay = `${raw.typeContratLibelle ?? ""} ${raw.natureContrat ?? ""} ${raw.intitule ?? ""}`
  return /apprentissage|professionnalisation|alternan/i.test(hay)
}

// ── Recherche ─────────────────────────────────────────────────────────────────

export interface SearchResult {
  offers: JobOffer[]
  /** Nombre total annoncé par l'API (en-tête Content-Range), si disponible. */
  total: number | null
  error?: string
}

/**
 * Recherche d'offres d'alternance.
 *
 * L'API répond 200 (jeu complet) ou 206 (contenu partiel) : les deux sont des
 * succès. Un 204 signifie « aucun résultat », pas une erreur.
 */
export async function searchOffers(criteria: SearchCriteria): Promise<SearchResult> {
  if (!isConfigured()) {
    return {
      offers: [],
      total: null,
      error:
        "France Travail n'est pas configuré. Ajoute FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET.",
    }
  }

  const token = await getToken()
  if (!token) {
    return { offers: [], total: null, error: "Identifiants France Travail refusés." }
  }

  const { codes } = await getAlternanceContractCodes()

  const from = criteria.from ?? 0
  const size = Math.min(criteria.size ?? 50, 150)
  const params = new URLSearchParams({ range: `${from}-${from + size - 1}` })

  if (criteria.keywords?.trim()) params.set("motsCles", criteria.keywords.trim().slice(0, 200))
  if (criteria.departments?.length) params.set("departement", criteria.departments.join(","))
  if (criteria.commune) {
    params.set("commune", criteria.commune)
    if (criteria.distanceKm) params.set("distance", String(criteria.distanceKm))
  }
  if (criteria.publishedWithinDays) params.set("publieeDepuis", String(criteria.publishedWithinDays))
  // Filtre serveur quand le référentiel a pu être lu ; sinon on filtre nous-mêmes
  // à la réception, pour ne jamais renvoyer une liste vide par excès de zèle.
  if (codes.length > 0) params.set("natureContrat", codes.join(","))
  params.set("sort", "1") // les plus récentes d'abord

  try {
    const res = await fetch(`${API_BASE}/offres/search?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })

    if (res.status === 204) return { offers: [], total: 0 }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      console.error("[france-travail] recherche:", res.status, detail)
      return {
        offers: [],
        total: null,
        error:
          res.status === 400
            ? `Critères refusés par l'API France Travail (${detail}).`
            : `France Travail a répondu ${res.status}.`,
      }
    }

    const data = (await res.json()) as { resultats?: RawOffer[] }
    const raws = data.resultats ?? []

    const offers = raws
      .filter((r) => looksLikeAlternance(r, codes))
      .map(normalize)
      .filter((o): o is JobOffer => o !== null)

    // Content-Range: « offres 0-49/1234 »
    const range = res.headers.get("Content-Range") ?? ""
    const total = Number(range.split("/")[1]) || null

    return { offers, total }
  } catch (err) {
    console.error("[france-travail] recherche:", err)
    return { offers: [], total: null, error: "France Travail est injoignable pour le moment." }
  }
}

// ── Diagnostic ────────────────────────────────────────────────────────────────

export interface Diagnosis {
  configured: boolean
  tokenOk: boolean
  referentialOk: boolean
  alternanceCodes: string[]
  alternanceLabels: string[]
  searchOk: boolean
  sampleCount: number
  sampleTitles: string[]
  error?: string
}

/**
 * Vérifie la chaîne complète contre le vrai compte France Travail : jeton,
 * référentiel, puis une recherche réelle. Sert au bouton « Tester la
 * connexion » — on constate ce que l'API fait, on ne le suppose pas.
 */
export async function diagnose(keywords = "alternance"): Promise<Diagnosis> {
  const base: Diagnosis = {
    configured: isConfigured(),
    tokenOk: false,
    referentialOk: false,
    alternanceCodes: [],
    alternanceLabels: [],
    searchOk: false,
    sampleCount: 0,
    sampleTitles: [],
  }

  if (!base.configured) {
    return { ...base, error: "FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET absents." }
  }

  const token = await getToken()
  if (!token) {
    return { ...base, error: "Le jeton OAuth a été refusé. Vérifie l'ID, le secret et que l'API « Offres d'emploi v2 » est bien activée sur ton app." }
  }
  base.tokenOk = true

  const { codes, labels } = await getAlternanceContractCodes()
  base.referentialOk = codes.length > 0
  base.alternanceCodes = codes
  base.alternanceLabels = labels

  const search = await searchOffers({ keywords, size: 10, publishedWithinDays: 31 })
  if (search.error) return { ...base, error: search.error }

  base.searchOk = true
  base.sampleCount = search.total ?? search.offers.length
  base.sampleTitles = search.offers.slice(0, 5).map((o) => `${o.title} chez ${o.company || "une entreprise non communiquée"}`)

  return base
}
