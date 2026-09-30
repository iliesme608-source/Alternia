import { NextRequest } from "next/server"
import { searchOffers, isConfigured, type JobOffer } from "@/lib/sources/france-travail"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Offres d'alternance affichées sur /offres.
 *
 * La connexion à France Travail vit dans lib/sources/france-travail, partagée
 * avec l'agent : une seule implémentation de l'OAuth, du filtre alternance et
 * de la normalisation.
 *
 * Sans identifiants, on renvoie un jeu d'exemples clairement étiqueté
 * `source: "static"` — l'interface l'affiche comme « données de démonstration ».
 * On ne fait jamais passer des exemples pour de vraies offres.
 */

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

const OFFRES_DEMO: Offre[] = [
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

// Ville ou région saisie → départements, pour cibler la recherche.
const DEPTS_BY_GEO: Record<string, string[]> = {
  paris: ["75"], "île-de-france": ["75", "77", "78", "91", "92", "93", "94", "95"],
  "ile-de-france": ["75", "77", "78", "91", "92", "93", "94", "95"],
  lyon: ["69"], "auvergne-rhône-alpes": ["01", "26", "38", "42", "63", "69", "73", "74"],
  marseille: ["13"], "provence-alpes-côte d'azur": ["04", "05", "06", "13", "83", "84"],
  toulouse: ["31"], occitanie: ["09", "11", "30", "31", "34", "66", "81", "82"],
  bordeaux: ["33"], "nouvelle-aquitaine": ["16", "17", "24", "33", "40", "64", "79", "86", "87"],
  nantes: ["44"], "pays de la loire": ["44", "49", "53", "72", "85"],
  lille: ["59"], "hauts-de-france": ["02", "59", "60", "62", "80"],
  strasbourg: ["67"], "grand est": ["08", "10", "51", "54", "57", "67", "68", "88"],
  rennes: ["35"], bretagne: ["22", "29", "35", "56"],
  normandie: ["14", "27", "50", "61", "76"],
}

/**
 * Apprentissage (E1) ou professionnalisation (E2), selon le libellé du contrat.
 * L'API expose ses propres codes ; l'interface d'Alternia ne connaît que ces
 * deux familles, donc on retombe sur l'apprentissage par défaut (le cas le
 * plus fréquent en alternance).
 */
function contractFamily(offer: JobOffer): "E1" | "E2" {
  return /professionnalisation/i.test(offer.contractLabel) ? "E2" : "E1"
}

/** Convertit une offre de la source vers la forme attendue par /offres. */
function toOffre(o: JobOffer): Offre {
  return {
    id: o.id,
    titre: o.title,
    // Beaucoup d'annonces sont anonymisées : on le dit plutôt que d'inventer.
    entreprise: o.company || "Entreprise non communiquée",
    lieu: o.location || "",
    salaire: o.salary || "Non précisé",
    datePublication: o.publishedAt ? o.publishedAt.slice(0, 10) : "",
    type: contractFamily(o),
    secteur: o.sector || o.romeLabel || "",
    niveau: o.experience || "",
    lienPostuler: o.url,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secteur = (searchParams.get("secteur") ?? "").toLowerCase().trim()
  const region = (searchParams.get("region") ?? "").toLowerCase().trim()
  const niveau = (searchParams.get("niveau") ?? "").toLowerCase().trim()
  const type = searchParams.get("type") ?? ""

  if (isConfigured()) {
    const result = await searchOffers({
      keywords: secteur || undefined,
      departments: DEPTS_BY_GEO[region] ?? [],
      size: 50,
      publishedWithinDays: 31,
    })

    if (!result.error) {
      let offres = result.offers.map(toOffre)
      if (type && type !== "tous") offres = offres.filter((o) => o.type === type)
      return Response.json({ offres, total: result.total, source: "api" })
    }

    // La source est configurée mais injoignable : on le dit, on ne masque pas
    // l'incident derrière des exemples présentés comme de vraies offres.
    console.warn("[api/offres] France Travail indisponible:", result.error)
    return Response.json({ offres: [], source: "error", error: result.error })
  }

  // Sans identifiants : jeu d'exemples, explicitement étiqueté.
  let offres = OFFRES_DEMO
  if (secteur) {
    offres = offres.filter(
      (o) => o.secteur.toLowerCase().includes(secteur) || o.titre.toLowerCase().includes(secteur),
    )
  }
  if (region) offres = offres.filter((o) => o.lieu.toLowerCase().includes(region))
  if (niveau) offres = offres.filter((o) => o.niveau.toLowerCase().includes(niveau))
  if (type && type !== "tous") offres = offres.filter((o) => o.type === type)

  return Response.json({ offres, source: "static" })
}
