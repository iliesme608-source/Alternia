import { promises as dns } from "dns"
import type { SupabaseClient } from "@supabase/supabase-js"
import { scanCompanySite, type SiteEmail } from "@/lib/site-contacts"

/**
 * Recherche de contacts décideurs pour une candidature spontanée.
 *
 * Règle non négociable, identique au reste d'Autopilot : on n'invente RIEN.
 * Chaque contact renvoyé porte une `source` qui dit d'où il vient :
 *
 *   registre_officiel — nom + fonction lus dans le registre public des
 *                       entreprises (recherche-entreprises.api.gouv.fr, données
 *                       RNE). C'est une donnée officielle, pas une supposition.
 *   email_generique   — adresse de service (recrutement@, rh@…) sur un domaine
 *                       dont on a VÉRIFIÉ l'enregistrement MX. Le domaine est
 *                       prouvé, la boîte ne l'est pas → statut « hypothèse ».
 *   email_nominatif   — prenom.nom@domaine : convention d'entreprise la plus
 *                       répandue en France, jamais une certitude → « hypothèse ».
 *   site_web          — adresse PUBLIÉE par l'entreprise sur son propre site
 *                       (contact, mentions légales, recrutement…). Elle existe
 *                       réellement ; la page où elle a été lue est citée.
 *   saisie_etudiant   — adresse trouvée et confirmée par l'étudiant lui-même.
 *
 * Aucun email n'est jamais présenté comme confirmé tant que l'étudiant ne l'a
 * pas validé. Les liens LinkedIn/Google sont des URL de RECHERCHE — jamais un
 * profil inventé.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContactSource =
  | "registre_officiel"
  | "email_generique"
  | "email_nominatif"
  | "site_web"
  | "saisie_etudiant"

export type EmailStatus = "hypothese" | "confirme" | "invalide"

export interface ContactLead {
  full_name: string
  job_title: string
  email: string
  domain: string
  linkedin_search: string
  source: ContactSource
  email_status: EmailStatus
  outreach_rank: number
  note: string
}

/** Dirigeant tel que renvoyé par le registre public. */
export interface Dirigeant {
  nom?: string | null
  prenoms?: string | null
  qualite?: string | null
  denomination?: string | null
  type_dirigeant?: string | null
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/** Minuscules, accents retirés, espaces normalisés. */
export function deburr(v: string): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

/** « FABIEN GASTON RENE » → « Fabien ». On ne garde que le premier prénom. */
export function firstName(prenoms?: string | null): string {
  const first = (prenoms ?? "").trim().split(/[\s-]+/)[0] ?? ""
  return titleCase(first)
}

/**
 * « LANGE (CASTILLON) » → « Lange ». Le registre accole parfois le nom d'usage
 * entre parenthèses ; le garder produirait une adresse email absurde.
 */
export function cleanSurname(nom?: string | null): string {
  return titleCase((nom ?? "").split("(")[0].trim())
}

/** « BROSSE » → « Brosse ». Gère les noms composés (Jean-Marc, Le Guen). */
export function titleCase(v: string): string {
  return (v ?? "")
    .toLowerCase()
    .replace(/(^|[\s'-])([a-zà-ÿ])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
    .trim()
}

// Formes juridiques et mots vides à retirer avant de deviner un nom de domaine.
const LEGAL_FORMS = new Set([
  "sarl", "sas", "sasu", "eurl", "sa", "sci", "snc", "scop", "scm", "selarl",
  "sel", "gie", "earl", "scea", "sem", "spl", "association", "asso", "ets",
  "etablissements", "ste", "societe", "groupe", "group", "holding", "france",
  "cie", "compagnie", "et", "de", "du", "des", "la", "le", "les", "l", "d",
])

/**
 * Mots courants d'une raison sociale qui ne peuvent JAMAIS désigner une
 * entreprise à eux seuls. « RESEAU CLUBS BOUYGUES TELECOM » ne doit pas se
 * résoudre en reseau.fr — un domaine qui existe, mais qui appartient à
 * quelqu'un d'autre. Écrire à ce domaine enverrait la candidature au mauvais
 * destinataire.
 */
const GENERIC_TOKENS = new Set([
  "reseau", "reseaux", "distribution", "services", "service", "solutions",
  "solution", "conseil", "conseils", "digital", "agence", "atelier", "maison",
  "boutique", "centre", "club", "clubs", "store", "shop", "telecom", "immo",
  "immobilier", "transport", "transports", "batiment", "travaux", "gestion",
  "finance", "assurance", "assurances", "sante", "medical", "formation",
  "developpement", "production", "international", "national", "europe",
  "consulting", "partners", "partenaires", "innovation", "technologies",
  "technologie", "industries", "industrie", "logistique", "energie",
])

/**
 * Noyau du nom commercial : forme juridique et mots vides retirés.
 * « SARL LES JARDINS DE PAUL » → ["jardins", "paul"]
 */
function nameTokens(companyName: string): string[] {
  return deburr(companyName)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 0 && !LEGAL_FORMS.has(w))
}

/**
 * Domaines plausibles pour une entreprise, du plus au moins probable.
 * Aucun n'est retenu sans vérification DNS (cf. resolveCompanyDomain).
 */
export function domainCandidates(companyName: string): string[] {
  const tokens = nameTokens(companyName)
  if (tokens.length === 0) return []

  const joined = tokens.join("")
  const hyphened = tokens.join("-")

  // Le premier mot seul n'est testé que sur un nom de DEUX mots, et seulement
  // s'il est distinctif (« ORANGE STORE » → orange.fr, oui ; « RESEAU CLUBS
  // BOUYGUES TELECOM » → reseau.fr, jamais). Au-delà de deux mots, le premier
  // mot n'identifie plus l'entreprise et le risque de faux positif l'emporte.
  const firstTok = tokens[0]
  const firstUsable =
    tokens.length === 2 && firstTok.length >= 4 && !GENERIC_TOKENS.has(firstTok)

  const bases = Array.from(
    new Set([joined, hyphened, firstUsable ? firstTok : ""].filter((b) => b.length >= 3 && b.length <= 40)),
  )

  const out: string[] = []
  for (const base of bases) {
    out.push(`${base}.fr`, `${base}.com`)
  }
  return out.slice(0, 6)
}

// ── Vérification DNS ──────────────────────────────────────────────────────────

const DNS_TIMEOUT_MS = 2500

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/**
 * Vrai si le domaine publie au moins un enregistrement MX — c'est-à-dire s'il
 * est réellement capable de recevoir des emails. C'est une preuve sur le
 * DOMAINE, jamais sur une boîte aux lettres précise.
 */
export async function hasMxRecord(domain: string): Promise<boolean> {
  const mx = await withTimeout(dns.resolveMx(domain), DNS_TIMEOUT_MS)
  return Array.isArray(mx) && mx.length > 0
}

/**
 * Le site répond-il ET parle-t-il bien de CETTE entreprise ?
 *
 * Un enregistrement MX prouve seulement que le domaine reçoit du courrier — pas
 * qu'il appartient à l'entreprise visée. On lit donc la page d'accueil et on y
 * cherche un mot distinctif de la raison sociale. C'est ce qui sépare un
 * domaine « plausible » d'un domaine « confirmé » : seul un domaine confirmé
 * autorise l'agent à envoyer une candidature tout seul.
 */
export async function corroborateDomain(domain: string, companyName: string): Promise<boolean> {
  const tokens = nameTokens(companyName).filter(
    (t) => t.length >= 4 && !GENERIC_TOKENS.has(t),
  )
  if (tokens.length === 0) return false

  try {
    const res = await fetch(`https://${domain}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "Alternia/1.0 (verification de domaine)" },
    })
    // Un 403 est presque toujours une page anti-robot (Cloudflare & consorts) :
    // elle n'apprend RIEN sur l'identité du propriétaire. On refuse de conclure
    // plutôt que de considérer « protégé » comme « confirmé ». L'étudiant peut
    // toujours confirmer l'adresse à la main, ce qui débloque l'agent.
    if (!res.ok) return false
    // On ne lit que le début de la page : titre, en-tête et métadonnées suffisent.
    const html = deburr((await res.text()).slice(0, 60_000)).replace(/[^a-z0-9]+/g, " ")
    return tokens.some((t) => html.includes(t))
  } catch {
    return false
  }
}

export interface ResolvedDomain {
  domain: string | null
  /** Le site confirme appartenir à cette entreprise (et pas seulement exister). */
  corroborated: boolean
}

/**
 * Premier domaine candidat qui accepte réellement du courrier, avec l'indication
 * de savoir si son site confirme l'identité de l'entreprise.
 * `knownWebsite` (si un jour l'API en fournit un) est testé en priorité.
 */
export async function resolveCompanyDomain(
  companyName: string,
  knownWebsite?: string | null,
): Promise<ResolvedDomain> {
  const candidates: string[] = []

  const fromSite = hostnameOf(knownWebsite)
  if (fromSite) candidates.push(fromSite)
  candidates.push(...domainCandidates(companyName))

  // Testés par paires : on veut une réponse rapide, pas 6 résolutions en série.
  for (let i = 0; i < candidates.length; i += 2) {
    const pair = candidates.slice(i, i + 2)
    const results = await Promise.all(pair.map(async (d) => ({ d, ok: await hasMxRecord(d) })))
    const hit = results.find((r) => r.ok)
    if (hit) {
      return { domain: hit.d, corroborated: await corroborateDomain(hit.d, companyName) }
    }
  }
  return { domain: null, corroborated: false }
}

/** « https://www.exemple.fr/contact » → « exemple.fr ». null si inexploitable. */
function hostnameOf(website?: string | null): string | null {
  const raw = (website ?? "").trim()
  if (!raw) return null
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`)
    return url.hostname.replace(/^www\./, "") || null
  } catch {
    return null
  }
}

// ── Dirigeants : qui vaut la peine d'être contacté ────────────────────────────

// Fonctions purement statutaires : elles ne décident pas d'une alternance.
const NON_OPERATIONAL = [
  "administrateur", "commissaire aux comptes", "membre du conseil",
  "conseil de surveillance", "associe", "actionnaire", "liquidateur",
]

// Fonctions opérationnelles, par ordre décroissant d'intérêt pour une alternance.
const QUALITE_RANK: { match: string; rank: number }[] = [
  { match: "ressources humaines", rank: 96 },
  { match: "directeur des ressources", rank: 96 },
  { match: "drh", rank: 96 },
  { match: "gerant", rank: 88 },
  { match: "president", rank: 86 },
  { match: "directeur general", rank: 84 },
  { match: "directrice generale", rank: 84 },
  { match: "directeur", rank: 78 },
  { match: "directrice", rank: 78 },
  { match: "responsable", rank: 74 },
  { match: "cogerant", rank: 80 },
  { match: "associe gerant", rank: 80 },
]

/** Un dirigeant décide-t-il réellement d'un recrutement en alternance ? */
export function isOperationalQualite(qualite?: string | null): boolean {
  const q = deburr(qualite ?? "")
  if (!q) return false
  return !NON_OPERATIONAL.some((n) => q.includes(n))
}

/** Score 0-100 : à qui adresser la candidature en priorité. */
export function qualiteRank(qualite?: string | null): number {
  const q = deburr(qualite ?? "")
  for (const { match, rank } of QUALITE_RANK) {
    if (q.includes(match)) return rank
  }
  return 60
}

/**
 * Dans une grande structure, le dirigeant légal n'est pas le bon interlocuteur :
 * la candidature doit partir au service recrutement. Dans une TPE/PME, c'est
 * l'inverse — le gérant lit lui-même ses mails.
 *
 * `employeeRange` est la tranche INSEE telle qu'affichée (« 20-49 salariés »).
 */
export function isSmallStructure(employeeRange?: string | null): boolean {
  const r = deburr(employeeRange ?? "")
  if (!r) return true // taille inconnue : on ne pénalise pas le dirigeant
  const firstNumber = Number(r.replace(/\s/g, "").match(/\d+/)?.[0] ?? "0")
  return firstNumber < 250
}

// ── Adresses de service ───────────────────────────────────────────────────────

/**
 * Adresses de service les plus répandues en France, par ordre de pertinence
 * pour une candidature spontanée en alternance.
 */
const GENERIC_LOCAL_PARTS: { local: string; label: string; rank: number }[] = [
  { local: "recrutement", label: "Service recrutement", rank: 92 },
  { local: "rh", label: "Ressources humaines", rank: 90 },
  { local: "candidature", label: "Candidatures", rank: 86 },
  { local: "emploi", label: "Service emploi", rank: 80 },
  { local: "contact", label: "Accueil / contact général", rank: 70 },
]

// ── Liens de recherche (jamais un profil inventé) ─────────────────────────────

/** Recherche LinkedIn pré-remplie « entreprise + fonction ». */
export function linkedinSearchUrl(companyName: string, jobTitle: string): string {
  const q = [companyName, jobTitle].filter(Boolean).join(" ")
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`
}

/** Recherche Google restreinte aux profils LinkedIn — pour retrouver la personne. */
export function googleProfileSearchUrl(companyName: string, jobTitle: string): string {
  const q = `"${companyName}" "${jobTitle}" site:linkedin.com/in`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

/** Fiche officielle de l'entreprise (annuaire data.gouv). null si SIREN invalide. */
export function officialCompanyUrl(siren?: string | null): string | null {
  const s = (siren ?? "").replace(/\s/g, "")
  return /^\d{9}$/.test(s) ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${s}` : null
}

// ── Construction de l'email ───────────────────────────────────────────────────

/** Convention française la plus courante : prenom.nom@domaine. */
export function nominativeEmail(prenom: string, nom: string, domain: string): string {
  const p = deburr(prenom).replace(/[^a-z]/g, "")
  const n = deburr(nom).replace(/[^a-z]/g, "")
  if (!p || !n || !domain) return ""
  return `${p}.${n}@${domain}`
}

// ── Registre public ───────────────────────────────────────────────────────────

const GOUV_SEARCH = "https://recherche-entreprises.api.gouv.fr/search"

export interface CompanyRecord {
  dirigeants: Dirigeant[]
  employeeRange: string | null
  categorie: string | null
}

/**
 * Relit la fiche officielle d'une entreprise par son SIREN pour en extraire les
 * dirigeants. `company_targets` ne conserve pas ces données à la recherche.
 * Renvoie une fiche vide (jamais null) si l'API est indisponible.
 */
export async function fetchCompanyRecord(siren: string): Promise<CompanyRecord> {
  const empty: CompanyRecord = { dirigeants: [], employeeRange: null, categorie: null }
  const s = (siren ?? "").replace(/\s/g, "")
  if (!/^\d{9}$/.test(s)) return empty

  try {
    const res = await fetch(`${GOUV_SEARCH}?q=${s}&per_page=1`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return empty
    const data = (await res.json()) as {
      results?: {
        siren?: string
        dirigeants?: Dirigeant[]
        categorie_entreprise?: string
        siege?: { tranche_effectif_salarie?: string }
      }[]
    }
    const hit = data.results?.find((r) => r.siren === s) ?? data.results?.[0]
    if (!hit) return empty
    return {
      dirigeants: Array.isArray(hit.dirigeants) ? hit.dirigeants : [],
      employeeRange: hit.siege?.tranche_effectif_salarie ?? null,
      categorie: hit.categorie_entreprise ?? null,
    }
  } catch {
    return empty
  }
}

// ── Assemblage des pistes ─────────────────────────────────────────────────────

const MAX_DIRIGEANTS = 4

/**
 * Construit la liste des pistes de contact pour une entreprise.
 *
 * - Les dirigeants viennent du registre : noms et fonctions RÉELS.
 * - Les emails sont des conventions sur un domaine vérifié : jamais confirmés.
 * - Sans domaine vérifié, on renvoie quand même les dirigeants avec leurs liens
 *   de recherche : l'étudiant a un nom à chercher, ce qui est déjà l'essentiel.
 */
export function buildContactLeads(input: {
  companyName: string
  dirigeants: Dirigeant[]
  domain: string | null
  /** Le site du domaine confirme l'identité de l'entreprise (cf. corroborateDomain). */
  corroborated?: boolean
  employeeRange: string | null
  /** Adresses relevées sur le site de l'entreprise (cf. lib/site-contacts). */
  siteEmails?: SiteEmail[]
}): ContactLead[] {
  const { companyName, dirigeants, domain, employeeRange } = input
  const corroborated = input.corroborated === true
  const petite = isSmallStructure(employeeRange)
  const leads: ContactLead[] = []
  // Adresses publiées par l'entreprise : on ne les accepte que d'un site dont
  // l'identité est établie — sinon ce seraient les contacts d'une homonyme.
  const siteEmails = corroborated ? (input.siteEmails ?? []) : []
  const usedSiteEmails = new Set<string>()

  // 1. Dirigeants officiels (personnes physiques, fonctions opérationnelles).
  const retenus = dirigeants
    .filter((d) => d.type_dirigeant !== "personne morale")
    .filter((d) => isOperationalQualite(d.qualite))
    .filter((d) => (d.nom ?? "").trim() && (d.prenoms ?? "").trim())

  // Dédoublonnage : le registre répète parfois la même personne.
  const vus = new Set<string>()
  for (const d of retenus) {
    const prenom = firstName(d.prenoms)
    const nom = cleanSurname(d.nom)
    const cle = deburr(`${prenom} ${nom}`)
    if (!prenom || !nom || vus.has(cle)) continue
    vus.add(cle)

    const fonction = titleCase((d.qualite ?? "").trim()) || "Dirigeant"
    // Dans une grande structure, le dirigeant passe derrière le service RH.
    const rank = Math.max(0, qualiteRank(d.qualite) - (petite ? 0 : 25))

    // Son adresse est publiée sur le site : c'est elle qu'on donne, pas une devinette.
    const published = siteEmails.find(
      (e) => !usedSiteEmails.has(e.email) && emailMatchesPerson(e.email, prenom, nom),
    )
    if (published) {
      usedSiteEmails.add(published.email)
      leads.push({
        full_name: `${prenom} ${nom}`,
        job_title: fonction,
        email: published.email,
        domain: domain ?? "",
        linkedin_search: linkedinSearchUrl(companyName, fonction),
        source: "site_web",
        email_status: "hypothese",
        outreach_rank: Math.min(100, Math.max(rank, petite ? 95 : 85)),
        note: `Nom et fonction issus du registre public ; adresse publiée par l'entreprise sur ${published.pageUrl}`,
      })
      if (leads.length >= MAX_DIRIGEANTS) break
      continue
    }

    leads.push({
      full_name: `${prenom} ${nom}`,
      job_title: fonction,
      email: domain ? nominativeEmail(prenom, nom, domain) : "",
      domain: domain ?? "",
      linkedin_search: linkedinSearchUrl(companyName, fonction),
      source: "registre_officiel",
      email_status: "hypothese",
      outreach_rank: rank,
      note: domain
        ? "Nom et fonction issus du registre public. L'adresse suit la convention prenom.nom, à vérifier avant envoi."
        : "Nom et fonction issus du registre public. Aucun domaine email vérifié : retrouve son adresse via LinkedIn.",
    })
    if (leads.length >= MAX_DIRIGEANTS) break
  }

  // 2. Adresses publiées sur le site (hors celles déjà rattachées à un dirigeant).
  for (const e of siteEmails) {
    if (usedSiteEmails.has(e.email)) continue
    usedSiteEmails.add(e.email)
    const personne = e.kind === "nominatif" ? nameFromLocalPart(e.email.split("@")[0]) : ""
    leads.push({
      full_name: personne,
      job_title:
        e.kind === "recrutement" ? "Recrutement (adresse publiée)"
        : e.kind === "nominatif" ? "Contact publié sur le site"
        : e.kind === "general" ? "Contact général (adresse publiée)"
        : "Autre service (adresse publiée)",
      email: e.email,
      domain: e.email.split("@")[1] ?? "",
      linkedin_search: linkedinSearchUrl(companyName, personne || "Responsable recrutement"),
      source: "site_web",
      email_status: "hypothese",
      outreach_rank:
        e.kind === "recrutement" ? 98
        : e.kind === "nominatif" ? (petite ? 88 : 80)
        : e.kind === "general" ? (petite ? 93 : 90)
        : AUTO_SEND_MIN_RANK - 10,
      note: `Adresse publiée par l'entreprise sur ${e.pageUrl}`,
    })
  }

  // 3. Adresses de service devinées — seulement si le site ne publie aucune
  //    adresse UTILE (un marketing@ ne remplace pas un recrutement@) et si le
  //    domaine accepte du courrier. Une vraie adresse vaut mieux que cinq
  //    adresses types identiques d'une entreprise à l'autre.
  const usefulPublished = siteEmails.some((e) => e.kind !== "autre")
  if (domain && !usefulPublished) {
    for (const g of GENERIC_LOCAL_PARTS) {
      // Dans une grande structure le service recrutement prime sur le dirigeant.
      const base = petite ? g.rank - 20 : g.rank
      // Domaine non corroboré : la piste reste affichée, mais son rang passe sous
      // le seuil à partir duquel l'agent s'autorise un envoi automatique. Écrire
      // à une entreprise homonyme serait pire que ne pas écrire du tout.
      leads.push({
        full_name: "",
        job_title: g.label,
        email: `${g.local}@${domain}`,
        domain,
        linkedin_search: linkedinSearchUrl(companyName, "Responsable recrutement"),
        source: "email_generique",
        email_status: "hypothese",
        outreach_rank: corroborated ? base : Math.min(base, AUTO_SEND_MIN_RANK - 20),
        note: corroborated
          ? `Le site ${domain} appartient bien à cette entreprise et le domaine reçoit des emails (MX vérifié). Cette boîte reste une adresse type, à confirmer.`
          : `Le domaine ${domain} reçoit des emails, mais rien ne confirme qu'il appartient à cette entreprise. Vérifie avant d'écrire : l'agent ne l'utilisera pas tout seul.`,
      })
    }
  }

  return leads.sort((a, b) => b.outreach_rank - a.outreach_rank)
}

/**
 * Rang minimum pour qu'une adresse de service soit utilisable par l'agent en
 * envoi automatique. En dessous, la piste reste visible dans l'app mais seul
 * l'étudiant peut décider de l'utiliser.
 */
export const AUTO_SEND_MIN_RANK = 70

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/


// ── Correspondance adresse ↔ personne ─────────────────────────────────────────

/** « jean.dupont », « j.dupont », « jdupont », « dupont.jean » → vrai pour Jean Dupont. */
function emailMatchesPerson(email: string, prenom: string, nom: string): boolean {
  const local = email.split("@")[0].replace(/[^a-z]/g, "")
  const p = deburr(prenom).replace(/[^a-z]/g, "")
  const n = deburr(nom).replace(/[^a-z]/g, "")
  if (!p || n.length < 3) return false
  return [`${p}${n}`, `${p[0]}${n}`, `${n}${p}`, `${n}${p[0]}`, n].includes(local)
}

/** « jean.dupont » → « Jean Dupont ». Vide si la forme n'est pas prénom.nom. */
function nameFromLocalPart(local: string): string {
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length !== 2 || parts.some((x) => x.length < 2 || /\d/.test(x))) return ""
  return titleCase(parts.join(" "))
}

// ── Recherche complète : registre + domaine + site ────────────────────────────

export interface ContactSearch {
  leads: ContactLead[]
  domain: string | null
  corroborated: boolean
  dirigeantsCount: number
  /** Adresses réellement publiées par l'entreprise et retenues. */
  siteEmailsCount: number
  pagesRead: number
}

/**
 * Point d'entrée unique (route « Trouver les décideurs » et agents) :
 * dirigeants officiels, domaine vérifié, puis lecture du site pour relever les
 * adresses que l'entreprise publie elle-même.
 */
export async function searchContactLeads(company: {
  company_name: string
  siren?: string | null
  website?: string | null
  employee_range?: string | null
}): Promise<ContactSearch> {
  const [record, resolved] = await Promise.all([
    fetchCompanyRecord(company.siren ?? ""),
    resolveCompanyDomain(company.company_name, company.website),
  ])

  const scan = resolved.domain
    ? await scanCompanySite(resolved.domain, company.siren)
    : { emails: [], pagesRead: 0, sirenFound: false }

  // Le SIREN lu dans les mentions légales prouve l'identité mieux que le nom.
  const corroborated = resolved.corroborated || scan.sirenFound

  const leads = buildContactLeads({
    companyName: company.company_name,
    dirigeants: record.dirigeants,
    domain: resolved.domain,
    corroborated,
    employeeRange: company.employee_range ?? record.employeeRange ?? null,
    siteEmails: scan.emails,
  })

  return {
    leads,
    domain: resolved.domain,
    corroborated,
    dirigeantsCount: record.dirigeants.length,
    siteEmailsCount: leads.filter((l) => l.source === "site_web").length,
    pagesRead: scan.pagesRead,
  }
}

// ── Persistance ───────────────────────────────────────────────────────────────

/**
 * Enregistre les pistes d'une entreprise.
 *
 * Les HYPOTHÈSES sont recalculées à chaque recherche : celles qui ne sortent
 * plus (typiquement un recrutement@ deviné, remplacé par l'adresse réellement
 * publiée) sont retirées. Une adresse confirmée par l'étudiant ou choisie comme
 * principale n'est jamais touchée.
 *
 * Renvoie l'erreur Supabase éventuelle (table absente…) sans lever.
 */
export async function persistContactLeads(
  sb: SupabaseClient,
  userId: string,
  companyTargetId: string,
  leads: ContactLead[],
): Promise<{ code?: string; message?: string } | null> {
  const withEmail = leads.filter((l) => l.email)
  if (withEmail.length === 0) return null

  const { error: delErr } = await sb
    .from("company_contacts")
    .delete()
    .eq("user_id", userId)
    .eq("company_target_id", companyTargetId)
    .eq("email_status", "hypothese")
    .eq("is_primary", false)
    .not("email", "in", `(${withEmail.map((l) => `"${l.email}"`).join(",")})`)
  if (delErr) return delErr

  const toRow = (l: ContactLead, legacy: boolean) => ({
    user_id: userId,
    company_target_id: companyTargetId,
    full_name: l.full_name,
    job_title: l.job_title,
    email: l.email,
    domain: l.domain,
    linkedin_search: l.linkedin_search,
    // Base pas encore migrée (autopilot_contacts_site.sql) : la provenance
    // reste lisible dans la note.
    source: legacy && l.source === "site_web" ? "email_generique" : l.source,
    email_status: l.email_status,
    outreach_rank: l.outreach_rank,
    note: l.note,
  })

  // ignoreDuplicates : une adresse confirmée n'est jamais réécrite en hypothèse.
  const upsert = (legacy: boolean) =>
    sb
      .from("company_contacts")
      .upsert(withEmail.map((l) => toRow(l, legacy)), {
        onConflict: "user_id,company_target_id,email",
        ignoreDuplicates: true,
      })

  const { error } = await upsert(false)
  // 23514 = contrainte CHECK : « site_web » pas encore autorisée en base.
  if (error?.code === "23514") return (await upsert(true)).error
  return error
}
