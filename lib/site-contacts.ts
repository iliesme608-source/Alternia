/**
 * Lecture du site officiel d'une entreprise pour y relever les adresses email
 * qu'ELLE publie (page contact, mentions légales, recrutement, équipe…).
 *
 * Contrairement aux adresses types (recrutement@…), une adresse relevée ici
 * existe réellement : l'entreprise l'a mise en ligne elle-même. C'est ce qui
 * donne des contacts différents d'une entreprise à l'autre au lieu du même
 * gabarit partout.
 *
 * Garde-fous :
 *   - robots.txt respecté (règles `User-agent: *`) ;
 *   - quelques pages seulement, en parallèle limité, avec un budget de temps
 *     global — c'est une lecture ponctuelle, pas un crawl ;
 *   - seules les adresses du domaine de l'entreprise (ou une messagerie
 *     grand public, fréquente chez les TPE) sont retenues : un email d'agence
 *     web en pied de page n'est pas un contact de l'entreprise ;
 *   - adresses de service sans rapport (dpo@, compta@, noreply@…) écartées.
 */

/** Minuscules sans accents (copie locale : lib/contacts importe ce module). */
function deburr(v: string): string {
  return (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

const USER_AGENT = "Alternia/1.0 (lecture des pages contact publiques)"
const PAGE_TIMEOUT_MS = 4000
const TOTAL_BUDGET_MS = 9000
const MAX_PAGES = 8
const MAX_HTML = 400_000

// Pages où une entreprise publie ses contacts, par ordre d'intérêt.
const PAGE_KEYWORDS = [
  "recrutement", "recrute", "carriere", "careers", "career", "emploi", "jobs",
  "rejoindre", "rejoignez", "join", "candidature", "equipe", "team",
  "contact", "mentions-legales", "mentions", "legal", "a-propos", "about",
  "qui-sommes-nous",
]

// Chemins testés même si la page d'accueil n'y renvoie pas.
const DEFAULT_PATHS = ["/contact", "/mentions-legales", "/recrutement", "/nous-rejoindre", "/equipe"]

// Messageries grand public : légitimes quand l'entreprise les affiche sur son site.
const FREEMAIL = new Set([
  "gmail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.fr",
  "yahoo.fr", "yahoo.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr",
  "laposte.net", "icloud.com", "neuf.fr", "bbox.fr",
])

// Boîtes sans rapport avec une candidature.
const EXCLUDED_LOCAL = [
  "noreply", "no-reply", "donotreply", "ne-pas-repondre", "dpo", "rgpd", "gdpr",
  "privacy", "cnil", "donnees", "compta", "factur", "billing", "invoice",
  "presse", "press", "media", "sav", "support", "commande", "order",
  "webmaster", "abuse", "postmaster", "newsletter", "unsubscribe", "exemple",
  "example", "votre", "your", "email", "prenom", "nom", "name",
]

const RECRUIT_LOCAL = ["recrut", "rh", "hr", "job", "carriere", "career", "emploi", "candidat", "talent", "stage", "alternance"]
const GENERAL_LOCAL = ["contact", "info", "hello", "bonjour", "accueil", "direction", "agence", "secretariat", "administratif", "office"]

/** « autre » : service sans lien avec l'embauche (marketing@, communication@…) — affiché, jamais utilisé seul. */
export type SiteEmailKind = "recrutement" | "nominatif" | "general" | "autre"

export interface SiteEmail {
  email: string
  kind: SiteEmailKind
  /** Page où l'adresse a été relevée — la preuve montrée à l'étudiant. */
  pageUrl: string
}

export interface SiteScan {
  emails: SiteEmail[]
  /** Pages effectivement lues. */
  pagesRead: number
  /** Le SIREN de l'entreprise apparaît sur le site (mentions légales) : identité prouvée. */
  sirenFound: boolean
}

// ── robots.txt ────────────────────────────────────────────────────────────────

/** Préfixes interdits aux robots génériques (`User-agent: *`). */
async function disallowedPrefixes(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(2500),
      headers: { "User-Agent": USER_AGENT },
    })
    if (!res.ok) return []
    const lines = (await res.text()).split(/\r?\n/)
    const out: string[] = []
    let applies = false
    for (const raw of lines) {
      const line = raw.split("#")[0].trim()
      const [key, ...rest] = line.split(":")
      const value = rest.join(":").trim()
      const k = key.toLowerCase()
      if (k === "user-agent") applies = value === "*"
      else if (applies && k === "disallow" && value) out.push(value)
    }
    return out
  } catch {
    return []
  }
}

function isAllowed(path: string, disallowed: string[]): boolean {
  return !disallowed.some((p) => (p === "/" ? true : path.startsWith(p.replace(/\*.*$/, ""))))
}

// ── Lecture des pages ─────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    })
    if (!res.ok) return null
    const type = res.headers.get("content-type") ?? ""
    if (type && !type.includes("html")) return null
    return { html: (await res.text()).slice(0, MAX_HTML), finalUrl: res.url || url }
  } catch {
    return null
  }
}

/** Liens internes de la page qui mènent vers une page contact / recrutement / équipe. */
function candidateLinks(html: string, base: URL): string[] {
  const scored: { url: string; score: number }[] = []
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    let url: URL
    try {
      url = new URL(m[1], base)
    } catch {
      continue
    }
    if (!/^https?:$/.test(url.protocol)) continue
    if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue
    const hay = deburr(`${url.pathname} ${m[2].replace(/<[^>]+>/g, " ")}`).replace(/\s+/g, "-")
    const idx = PAGE_KEYWORDS.findIndex((k) => hay.includes(k))
    if (idx === -1) continue
    url.hash = ""
    scored.push({ url: url.toString(), score: idx })
  }
  return Array.from(new Set(scored.sort((a, b) => a.score - b.score).map((s) => s.url)))
}

// ── Extraction des adresses ───────────────────────────────────────────────────

/** Adresses masquées par Cloudflare (`data-cfemail`). */
function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16)
  let out = ""
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
  return out
}

function extractEmails(html: string): string[] {
  const found: string[] = []

  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) found.push(decodeCfEmail(m[1]))

  const text = html
    .replace(/&#64;|&#x40;|%40/gi, "@")
    .replace(/&#46;|&#x2e;/gi, ".")
    // Formes anti-robot courantes : « nom [at] domaine [dot] fr », « nom (arobase) domaine.fr ».
    .replace(/\s*[[(]\s*(?:at|arobase)\s*[\])]\s*/gi, "@")
    .replace(/\s*[[(]\s*(?:dot|point)\s*[\])]\s*/gi, ".")

  for (const m of text.matchAll(/[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi)) {
    found.push(m[0])
  }
  return found.map((e) => e.toLowerCase().replace(/^mailto:/, "").replace(/\.$/, ""))
}

function isRelevant(email: string, companyDomain: string): boolean {
  const [local, dom] = email.split("@")
  if (!local || !dom) return false
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(dom)) return false // noms de fichiers « image@2x.png »
  if (/^[0-9a-f]{16,}$/.test(local)) return false // identifiants techniques (Sentry…)
  if (EXCLUDED_LOCAL.some((x) => local.includes(x))) return false
  const own = dom === companyDomain || dom.endsWith(`.${companyDomain}`)
  return own || FREEMAIL.has(dom)
}

function classify(local: string): SiteEmailKind {
  if (RECRUIT_LOCAL.some((k) => local === k || local.startsWith(k) || local.includes(`${k}.`) || local.includes(`.${k}`))) {
    return "recrutement"
  }
  if (GENERAL_LOCAL.some((k) => local.startsWith(k))) return "general"
  // prenom.nom, p.nom, prenom-nom, prenom_nom
  if (/^[a-z]+[._-][a-z]+$/.test(local)) return "nominatif"
  return "autre"
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * Lit quelques pages publiques du site et renvoie les adresses publiées.
 * Ne lève jamais : un site injoignable donne simplement une liste vide.
 */
export async function scanCompanySite(domain: string, siren?: string | null): Promise<SiteScan> {
  const empty: SiteScan = { emails: [], pagesRead: 0, sirenFound: false }
  if (!domain) return empty

  const deadline = Date.now() + TOTAL_BUDGET_MS
  const home = await fetchHtml(`https://${domain}`) ?? await fetchHtml(`https://www.${domain}`)
  if (!home) return empty

  let base: URL
  try {
    base = new URL(home.finalUrl)
  } catch {
    return empty
  }
  const disallowed = await disallowedPrefixes(base.origin)

  const queue = Array.from(
    new Set([
      ...candidateLinks(home.html, base),
      ...DEFAULT_PATHS.map((p) => new URL(p, base).toString()),
    ]),
  )
    .filter((u) => u !== base.toString() && isAllowed(new URL(u).pathname, disallowed))
    .slice(0, MAX_PAGES - 1)

  const pages: { url: string; html: string }[] = [{ url: base.toString(), html: home.html }]
  // Par lots de 3 : assez rapide, sans marteler un petit serveur.
  for (let i = 0; i < queue.length && Date.now() < deadline; i += 3) {
    const batch = await Promise.all(queue.slice(i, i + 3).map(async (u) => ({ u, page: await fetchHtml(u) })))
    for (const { u, page } of batch) if (page) pages.push({ url: u, html: page.html })
  }

  const sirenDigits = (siren ?? "").replace(/\s/g, "")
  const sirenFound =
    /^\d{9}$/.test(sirenDigits) &&
    pages.some((p) => p.html.replace(/[\s. ]/g, "").includes(sirenDigits))

  const byEmail = new Map<string, SiteEmail>()
  for (const page of pages) {
    for (const email of extractEmails(page.html)) {
      if (byEmail.has(email) || !isRelevant(email, domain)) continue
      byEmail.set(email, { email, kind: classify(email.split("@")[0]), pageUrl: page.url })
    }
  }

  return { emails: Array.from(byEmail.values()).slice(0, 8), pagesRead: pages.length, sirenFound }
}
