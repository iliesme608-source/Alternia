import { NextResponse } from "next/server"
import Parser from "rss-parser"

export const revalidate = 300

// URLs vérifiées côté serveur le 30/07/2026. Les Echos répond 403 à toute requête
// serveur (protection anti-bot, quel que soit le User-Agent) : l'entrée est conservée
// au cas où le blocage tombe, et La Tribune couvre l'éco en attendant.
const FEEDS = [
  { source: "Les Echos", url: "https://www.lesechos.fr/rss/rss_tech.xml" },
  { source: "Le Monde", url: "https://www.lemonde.fr/economie/rss_full.xml" },
  { source: "BFM Business", url: "https://www.bfmtv.com/rss/economie/" },
  { source: "L'Usine Nouvelle", url: "https://www.usinenouvelle.com/arc/outboundfeeds/rss/" },
  { source: "Journal du Net", url: "https://www.journaldunet.com/rss/" },
  { source: "La Tribune", url: "https://www.latribune.fr/rss/homepage" },
]

const NEWS_FALLBACK = [
  {
    titre: "Aide à l'embauche des alternants prolongée jusqu'en décembre 2026",
    resume: "Le gouvernement maintient l'aide de 6 000 € pour les entreprises embauchant un apprenti de moins de 30 ans préparant un diplôme jusqu'au niveau bac+5.",
    date: "2026-06-25",
    source: "Ministère du Travail",
    lien: "https://travail-emploi.gouv.fr/formation-professionnelle/formation-en-alternance-10751/",
  },
  {
    titre: "Record historique : plus d'un million d'apprentis en France",
    resume: "La France franchit le cap symbolique du million d'apprentis en 2026. Les secteurs du numérique et de la santé tirent la croissance.",
    date: "2026-06-18",
    source: "DARES",
    lien: "https://dares.travail-emploi.gouv.fr/",
  },
  {
    titre: "Secteurs en tension : 5 métiers alternance qui recrutent en 2026",
    resume: "Cybersécurité, développement durable, logistique, santé et commerce international : ces cinq secteurs peinent à trouver des alternants qualifiés.",
    date: "2026-06-03",
    source: "France Travail",
    lien: "https://www.francetravail.fr/",
  },
]

const parser = new Parser({
  timeout: 8000,
  maxRedirects: 3,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
})

function cleanText(html: string | undefined): string {
  if (!html) return ""
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220)
}

interface Article { titre: string; resume: string; date: string; source: string; lien: string }

// Les flux ne remplissent pas les mêmes champs : L'Usine Nouvelle laisse
// contentSnippet vide et ne renseigne que content:encoded.
function firstNonEmpty(item: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = cleanText(typeof item[k] === "string" ? (item[k] as string) : undefined)
    if (v) return v
  }
  return ""
}

async function fetchFeed(source: string, url: string): Promise<Article[]> {
  const feed = await parser.parseURL(url)
  return (feed.items ?? [])
    .slice(0, 5)
    .map(item => {
      const date = item.isoDate ?? item.pubDate ?? ""
      return {
        titre: cleanText(item.title),
        resume: firstNonEmpty(item, ["contentSnippet", "content:encodedSnippet", "content", "content:encoded", "summary"]),
        date: date && !isNaN(new Date(date).getTime()) ? new Date(date).toISOString() : "",
        source,
        lien: item.link ?? "",
      }
    })
    .filter(a => a.titre && a.lien && a.date)
}

export async function GET() {
  const results = await Promise.allSettled(
    FEEDS.map(f => fetchFeed(f.source, f.url))
  )

  const articles = results
    .filter((r): r is PromiseFulfilledResult<Article[]> => r.status === "fulfilled")
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10)

  return NextResponse.json({
    news: articles.length > 0 ? articles : NEWS_FALLBACK,
    live: articles.length > 0,
  })
}
