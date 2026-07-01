import { NextResponse } from "next/server"

const SECTEURS_STATIC = [
  { secteur: "Dev & Tech", icone: "💻", offres: 4200, tendance: "hausse" },
  { secteur: "Commerce & Vente", icone: "🛍️", offres: 3100, tendance: "stable" },
  { secteur: "Finance & Banque", icone: "🏦", offres: 2800, tendance: "hausse" },
  { secteur: "Data & IA", icone: "📊", offres: 2200, tendance: "hausse" },
  { secteur: "Marketing & Com", icone: "📣", offres: 1900, tendance: "stable" },
]

async function fetchFranceTravail() {
  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

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
      signal: AbortSignal.timeout(5000),
    }
  )
  if (!tokenRes.ok) return null
  const { access_token: token } = await tokenRes.json()

  const CODES = [
    { secteur: "Dev & Tech", icone: "💻", rome: "M1805" },
    { secteur: "Commerce & Vente", icone: "🛍️", rome: "D1402" },
    { secteur: "Finance & Banque", icone: "🏦", rome: "C1201" },
    { secteur: "Data & IA", icone: "📊", rome: "M1403" },
    { secteur: "Marketing & Com", icone: "📣", rome: "E1101" },
  ]

  const results = await Promise.all(
    CODES.map(async ({ secteur, icone, rome }) => {
      try {
        const res = await fetch(
          `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?typeContrat=E1,E2&codeROME=${rome}&range=0-0`,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(4000),
          }
        )
        if (!res.ok) return null
        const d = await res.json()
        const static_ = SECTEURS_STATIC.find(s => s.secteur === secteur)
        return { secteur, icone, offres: d.nombreResultats ?? 0, tendance: static_?.tendance ?? "stable" }
      } catch {
        return null
      }
    })
  )

  const filtered = results.filter(Boolean) as typeof SECTEURS_STATIC
  return filtered.length >= 3 ? filtered.sort((a, b) => b.offres - a.offres) : null
}

export async function GET() {
  try {
    const live = await fetchFranceTravail()
    return NextResponse.json(
      { secteurs: live ?? SECTEURS_STATIC, source: live ? "france-travail" : "static" },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
    )
  } catch {
    return NextResponse.json({ secteurs: SECTEURS_STATIC, source: "static" })
  }
}
