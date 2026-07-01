import { NextRequest } from "next/server"

export interface Offre {
  id: string
  titre: string
  entreprise: string
  lieu: string
  salaire: string
  datePublication: string
  type: "E1" | "E2"
  secteur: string
  niveau: string
  lienPostuler: string
}

const OFFRES_STATIQUES: Offre[] = [
  { id: "1",  titre: "Alternant(e) Développeur React / TypeScript",     entreprise: "Alan",           lieu: "Paris 8e (75)",              salaire: "1 050–1 250€/mois", datePublication: "2026-07-01", type: "E1", secteur: "Dev & Tech",                  niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "2",  titre: "Alternance Data Scientist",                        entreprise: "Criteo",         lieu: "Paris 9e (75)",              salaire: "1 100–1 350€/mois", datePublication: "2026-06-30", type: "E1", secteur: "Data & IA",                  niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "3",  titre: "Alternant(e) Finance d'entreprise",                entreprise: "BNP Paribas",    lieu: "La Défense (92)",            salaire: "1 000–1 300€/mois", datePublication: "2026-06-29", type: "E1", secteur: "Finance & Banque",           niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "4",  titre: "Alternance Marketing Digital",                     entreprise: "Décathlon",      lieu: "Villeneuve-d'Ascq (59)",     salaire: "800–1 000€/mois",   datePublication: "2026-06-28", type: "E1", secteur: "Marketing & Com",            niveau: "Bachelor",     lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "5",  titre: "Alternant(e) Commercial(e) B2B",                   entreprise: "Salesforce",     lieu: "Paris 9e (75)",              salaire: "900–1 100€/mois",   datePublication: "2026-06-28", type: "E2", secteur: "Commerce & Vente",           niveau: "Bachelor",     lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "6",  titre: "Alternance RH / Recrutement",                      entreprise: "L'Oréal",        lieu: "Clichy (92)",                salaire: "850–1 050€/mois",   datePublication: "2026-06-27", type: "E1", secteur: "RH & Recrutement",           niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "7",  titre: "Alternant(e) Développeur Backend Python",          entreprise: "OVHcloud",       lieu: "Roubaix (59)",               salaire: "900–1 200€/mois",   datePublication: "2026-06-27", type: "E1", secteur: "Dev & Tech",                  niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "8",  titre: "Alternance Audit Financier",                       entreprise: "KPMG France",    lieu: "Paris 15e (75)",             salaire: "950–1 200€/mois",   datePublication: "2026-06-26", type: "E1", secteur: "Conseil & Audit",            niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "9",  titre: "Alternant(e) Logistique et Supply Chain",          entreprise: "Amazon",         lieu: "Brétigny-sur-Orge (91)",     salaire: "800–1 000€/mois",   datePublication: "2026-06-26", type: "E1", secteur: "Logistique & Supply Chain",  niveau: "Bachelor",     lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "10", titre: "Alternance Communication & Relations Presse",      entreprise: "TF1",            lieu: "Boulogne-Billancourt (92)",   salaire: "750–950€/mois",     datePublication: "2026-06-25", type: "E1", secteur: "Marketing & Com",            niveau: "Bachelor",     lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "11", titre: "Alternant(e) Ingénieur Mécanique",                 entreprise: "Safran",         lieu: "Moissy-Cramayel (77)",       salaire: "850–1 150€/mois",   datePublication: "2026-06-25", type: "E1", secteur: "Ingénierie / Industrie",     niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "12", titre: "Alternance Droit des Affaires",                    entreprise: "Michelin",       lieu: "Clermont-Ferrand (63)",      salaire: "800–1 050€/mois",   datePublication: "2026-06-24", type: "E2", secteur: "Juridique",                  niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "13", titre: "Alternant(e) Product Manager",                     entreprise: "Doctolib",       lieu: "Paris 9e (75)",              salaire: "1 000–1 300€/mois", datePublication: "2026-06-24", type: "E1", secteur: "Dev & Tech",                  niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "14", titre: "Alternance Gestion Locative / Immobilier",         entreprise: "Foncia",         lieu: "Lyon 3e (69)",               salaire: "800–1 050€/mois",   datePublication: "2026-06-23", type: "E1", secteur: "Immobilier",                 niveau: "Bachelor",     lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "15", titre: "Alternant(e) Data Engineer",                       entreprise: "Bouygues Telecom", lieu: "Issy-les-Moulineaux (92)", salaire: "900–1 200€/mois",   datePublication: "2026-06-23", type: "E1", secteur: "Data & IA",                  niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "16", titre: "Alternance Mode & Merchandising",                  entreprise: "Hermès",         lieu: "Paris 8e (75)",              salaire: "850–1 100€/mois",   datePublication: "2026-06-22", type: "E1", secteur: "Luxe & Mode",                niveau: "Bachelor",     lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "17", titre: "Alternant(e) DevOps / Cloud AWS",                  entreprise: "Capgemini",      lieu: "Paris 17e (75)",             salaire: "950–1 250€/mois",   datePublication: "2026-06-22", type: "E1", secteur: "Dev & Tech",                  niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "18", titre: "Alternance Marketing B2C / CRM",                   entreprise: "Cdiscount",      lieu: "Bordeaux (33)",              salaire: "750–1 000€/mois",   datePublication: "2026-06-21", type: "E2", secteur: "Marketing & Com",            niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "19", titre: "Alternant(e) Analyste Risques Financiers",         entreprise: "Natixis",        lieu: "Paris 15e (75)",             salaire: "1 000–1 300€/mois", datePublication: "2026-06-21", type: "E1", secteur: "Finance & Banque",           niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
  { id: "20", titre: "Alternance Santé Digitale / e-santé",              entreprise: "Sanofi",         lieu: "Gentilly (94)",              salaire: "900–1 200€/mois",   datePublication: "2026-06-20", type: "E1", secteur: "Santé",                      niveau: "Master",       lienPostuler: "https://www.alternance.emploi.gouv.fr" },
]

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secteur = (searchParams.get("secteur") ?? "").toLowerCase().trim()
  const region  = (searchParams.get("region")  ?? "").toLowerCase().trim()
  const niveau  = (searchParams.get("niveau")  ?? "").toLowerCase().trim()
  const type    = searchParams.get("type") ?? ""

  // Try France Travail API if credentials are configured
  const clientId     = process.env.FRANCE_TRAVAIL_CLIENT_ID
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET

  if (clientId && clientSecret) {
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
          signal: AbortSignal.timeout(5000),
        }
      )
      const tokenData = await tokenRes.json()
      const token = tokenData.access_token as string | undefined

      if (token) {
        const params = new URLSearchParams({
          typeContrat: type || "E1,E2",
          range: "0-19",
          ...(secteur ? { motsCles: secteur } : {}),
        })
        const offresRes = await fetch(
          `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          }
        )
        if (offresRes.ok) {
          const data = await offresRes.json()
          return Response.json({ offres: data.resultats ?? [], source: "api" })
        }
      }
    } catch {
      console.warn("[api/offres] France Travail API unavailable — using static data")
    }
  }

  // Fallback: filter static data
  let offres = OFFRES_STATIQUES
  if (secteur) offres = offres.filter(o => o.secteur.toLowerCase().includes(secteur) || o.titre.toLowerCase().includes(secteur))
  if (region)  offres = offres.filter(o => o.lieu.toLowerCase().includes(region))
  if (niveau)  offres = offres.filter(o => o.niveau.toLowerCase().includes(niveau))
  if (type && type !== "tous")   offres = offres.filter(o => o.type === type)

  return Response.json({ offres, source: "static" })
}
