import { NextResponse } from "next/server"

const SECTEURS_MOCK = [
  { secteur: "Informatique & Dev", icone: "💻", offres: 14280, variation: +22 },
  { secteur: "Commerce & Vente", icone: "🛍️", offres: 11640, variation: +8 },
  { secteur: "Marketing & Communication", icone: "📣", offres: 7890, variation: +15 },
  { secteur: "Finance & Banque", icone: "🏦", offres: 6540, variation: +5 },
  { secteur: "RH & Formation", icone: "👥", offres: 5320, variation: +11 },
]

const ACTUALITES_FALLBACK = [
  {
    titre: "Apprentissage : le nombre de contrats dépasse 1 million pour la première fois",
    date: "Wed, 18 Jun 2026 08:00:00 +0200",
    lien: "https://www.service-public.fr/particuliers/vosdroits/F2918",
    description: "Le cap symbolique du million de contrats d'apprentissage actifs a été franchi en 2026, confirmant l'attractivité de cette voie pour les jeunes et les entreprises.",
  },
  {
    titre: "Aide à l'embauche des alternants : les nouvelles modalités 2026",
    date: "Mon, 09 Jun 2026 10:00:00 +0200",
    lien: "https://www.service-public.fr/particuliers/vosdroits/F23905",
    description: "Le gouvernement maintient les aides à l'embauche en alternance et précise les conditions d'éligibilité pour les contrats signés à partir de septembre 2026.",
  },
  {
    titre: "Contrat de professionnalisation : élargissement des bénéficiaires",
    date: "Fri, 30 May 2026 09:30:00 +0200",
    lien: "https://www.service-public.fr/particuliers/vosdroits/F15478",
    description: "Les conditions d'accès au contrat de professionnalisation sont assouplies pour inclure davantage de profils, notamment les jeunes de 26 à 30 ans dans certains secteurs.",
  },
  {
    titre: "CFA : les nouvelles certifications Qualiopi et leurs impacts sur l'alternance",
    date: "Tue, 20 May 2026 11:00:00 +0200",
    lien: "https://www.service-public.fr/particuliers/vosdroits/F32502",
    description: "La mise à jour des critères Qualiopi impacte les CFA et leurs formations. Ce que cela change pour les apprentis et les employeurs dès la rentrée 2026.",
  },
  {
    titre: "Rémunération en alternance : revalorisation du SMIC et grilles de salaires",
    date: "Mon, 05 May 2026 08:00:00 +0200",
    lien: "https://www.service-public.fr/particuliers/vosdroits/F2346",
    description: "Suite à la revalorisation du SMIC au 1er mai 2026, les salaires minimaux des apprentis et des alternants en contrat de professionnalisation ont été mis à jour.",
  },
]

async function getSecteurs() {
  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET

  if (!clientId || !clientSecret) return SECTEURS_MOCK

  try {
    const tokenRes = await fetch(
      "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "api_offresdemploiv2 o2dsoffre",
        }),
      }
    )
    if (!tokenRes.ok) return SECTEURS_MOCK
    const { access_token: token } = await tokenRes.json()

    const ROME = [
      { secteur: "Informatique & Dev", code: "M1805", icone: "💻" },
      { secteur: "Commerce & Vente", code: "D1402", icone: "🛍️" },
      { secteur: "Marketing & Communication", code: "E1101", icone: "📣" },
      { secteur: "Finance & Banque", code: "C1201", icone: "🏦" },
      { secteur: "RH & Formation", code: "M1501", icone: "👥" },
    ]

    const results = await Promise.all(
      ROME.map(async ({ secteur, code, icone }) => {
        const res = await fetch(
          `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?typeContrat=E1&codeROME=${code}&range=0-0`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
        )
        if (!res.ok) return null
        const d = await res.json()
        const mock = SECTEURS_MOCK.find((s) => s.secteur === secteur)
        return { secteur, icone, offres: d.nombreResultats ?? 0, variation: mock?.variation ?? 0 }
      })
    )

    const sorted = results
      .filter(Boolean)
      .sort((a, b) => (b?.offres ?? 0) - (a?.offres ?? 0))
      .slice(0, 5) as typeof SECTEURS_MOCK

    return sorted.length > 0 ? sorted : SECTEURS_MOCK
  } catch {
    return SECTEURS_MOCK
  }
}

function extractCdata(tag: string, block: string): string {
  const cdataMatch = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
  if (cdataMatch) return cdataMatch[1]
  const plainMatch = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  return plainMatch ? plainMatch[1] : ""
}

async function getActualites() {
  try {
    const res = await fetch("https://www.service-public.fr/rss/particuliers.rss", {
      headers: { "User-Agent": "AlternaAI/1.0" },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return ACTUALITES_FALLBACK

    const xml = await res.text()
    const items: typeof ACTUALITES_FALLBACK = []
    const itemRe = /<item>([\s\S]*?)<\/item>/g
    let m

    while ((m = itemRe.exec(xml)) !== null && items.length < 5) {
      const block = m[1]
      const titre = extractCdata("title", block).replace(/<[^>]*>/g, "").trim()
      const description = extractCdata("description", block).replace(/<[^>]*>/g, "").trim()
      const lien = extractCdata("link", block).trim() || extractCdata("guid", block).trim()
      const date = extractCdata("pubDate", block).trim()

      const text = (titre + " " + description).toLowerCase()
      if (
        text.includes("apprentissage") ||
        text.includes("alternance") ||
        text.includes("contrat de professionnalisation") ||
        text.includes("cfa")
      ) {
        items.push({ titre, date, lien, description: description.slice(0, 220) })
      }
    }

    return items.length > 0 ? items : ACTUALITES_FALLBACK
  } catch {
    return ACTUALITES_FALLBACK
  }
}

export async function GET() {
  const [secteurs, actualites] = await Promise.all([getSecteurs(), getActualites()])
  return NextResponse.json(
    { secteurs, actualites },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
  )
}
