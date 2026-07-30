import { NextResponse } from "next/server"

export const revalidate = 300

const SECTEURS_STATIC = [
  { secteur: "Dev & Tech", icone: "💻", offres: 4200, tendance: "hausse" },
  { secteur: "Commerce & Vente", icone: "🛍️", offres: 3100, tendance: "stable" },
  { secteur: "Finance & Banque", icone: "🏦", offres: 2800, tendance: "hausse" },
  { secteur: "Data & IA", icone: "📊", offres: 2200, tendance: "hausse" },
  { secteur: "Marketing & Com", icone: "📣", offres: 1900, tendance: "stable" },
]

// Grands domaines ROME de l'API Offres d'emploi v2
const DOMAINES = [
  { code: "M", secteur: "Data & Informatique", icone: "💻", tendance: "hausse" },
  { code: "D", secteur: "Commerce & Vente", icone: "🛍️", tendance: "stable" },
  { code: "C", secteur: "Finance & Banque", icone: "🏦", tendance: "hausse" },
  { code: "E", secteur: "Marketing & Com", icone: "📣", tendance: "stable" },
  { code: "H", secteur: "Industrie", icone: "🏭", tendance: "hausse" },
  { code: "J", secteur: "Santé", icone: "🩺", tendance: "hausse" },
]

async function getToken(): Promise<string | null> {
  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  try {
    const res = await fetch(
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
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return null
    const { access_token } = await res.json()
    return access_token ?? null
  } catch {
    return null
  }
}

async function countOffres(domaine: string, token: string | null): Promise<number | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(
      `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?typeContrat=E1,E2&range=0-149&domaine=${domaine}`,
      { headers, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok && res.status !== 206) return null
    // Content-Range: "offres 0-149/12345" → total après le "/"
    const range = res.headers.get("Content-Range")
    const total = range?.split("/")[1]
    if (total && !isNaN(Number(total))) return Number(total)
    const d = await res.json()
    return Array.isArray(d.resultats) ? d.resultats.length : null
  } catch {
    return null
  }
}

export async function GET() {
  const token = await getToken()

  const counts = await Promise.all(
    DOMAINES.map(async d => {
      const offres = await countOffres(d.code, token)
      return offres === null ? null : { secteur: d.secteur, icone: d.icone, offres, tendance: d.tendance }
    })
  )

  const live = counts.filter(Boolean) as typeof SECTEURS_STATIC
  const verifie = new Date().toISOString().slice(0, 10)

  if (live.length >= 3) {
    return NextResponse.json({
      secteurs: live.sort((a, b) => b.offres - a.offres).slice(0, 5),
      source: "france-travail",
      verifie,
    })
  }

  return NextResponse.json({ secteurs: SECTEURS_STATIC, source: "static", verifie })
}
