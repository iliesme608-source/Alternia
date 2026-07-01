import { NextRequest } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"
import { createServerClient } from "@/lib/supabase"
import type { EntrepriseProspect } from "@/types"

// Section codes NAF (INSEE) — much more reliable than keyword search
const SECTEUR_NAF_SECTION: Record<string, string> = {
  "Informatique / Tech": "J",
  "Commerce / Marketing": "G",
  "Finance / Comptabilité": "K",
  "RH / Management": "N",
  "Communication / Média": "J",
  "Ingénierie / Industrie": "C",
  "Santé / Social": "Q",
  "Droit / Juridique": "M",
}

const REGION_TO_DEPT: Record<string, string> = {
  paris: "75",
  "île-de-france": "75",
  "ile-de-france": "75",
  idf: "75",
  lyon: "69",
  villeurbanne: "69",
  marseille: "13",
  toulouse: "31",
  bordeaux: "33",
  nantes: "44",
  strasbourg: "67",
  lille: "59",
  rennes: "35",
  grenoble: "38",
  montpellier: "34",
  nice: "06",
  tours: "37",
  dijon: "21",
  angers: "49",
  metz: "57",
  reims: "51",
  nancy: "54",
  caen: "14",
  rouen: "76",
  limoges: "87",
  amiens: "80",
  brest: "29",
  "clermont-ferrand": "63",
  perpignan: "66",
  toulon: "83",
  mulhouse: "68",
  "la rochelle": "17",
  besançon: "25",
  besancon: "25",
  poitiers: "86",
  pau: "64",
  orléans: "45",
  orleans: "45",
}

interface UserProfile {
  prenom?: string | null
  ecole?: string | null
  niveau?: string | null
  secteur?: string | null
}

type ApiResult = {
  nom_raison_sociale?: string
  siege?: {
    siret?: string
    libelle_commune?: string
    tranche_effectif_salarie?: string
  }
}

async function searchEntreprises(
  secteur: string,
  region: string,
  taille: string
): Promise<Array<{ siret: string; nom: string; ville: string; taille: string }>> {
  const naf = SECTEUR_NAF_SECTION[secteur]
  const normalized = region.toLowerCase().trim()
  const dept = REGION_TO_DEPT[normalized]

  const params = new URLSearchParams({ per_page: "20" })

  if (naf) params.set("section_activite_principale", naf)
  if (dept) params.set("departement", dept)
  else params.set("q", region)

  if (taille === "petite") {
    params.set("tranche_effectif_min", "01")
    params.set("tranche_effectif_max", "12")
  } else if (taille === "moyenne") {
    params.set("tranche_effectif_min", "21")
    params.set("tranche_effectif_max", "32")
  } else if (taille === "grande") {
    params.set("tranche_effectif_min", "41")
  } else {
    params.set("tranche_effectif_min", "11")
  }

  try {
    const res = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?${params}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? [])
      .filter((e: ApiResult) => e.siege?.siret && e.nom_raison_sociale)
      .map((e: ApiResult) => ({
        siret: e.siege!.siret!,
        nom: e.nom_raison_sociale!,
        ville: e.siege?.libelle_commune ?? region,
        taille: tailleTranche(e.siege?.tranche_effectif_salarie ?? ""),
      }))
  } catch {
    return []
  }
}

function tailleTranche(code: string): string {
  const map: Record<string, string> = {
    "00": "0 salarié",
    "01": "1-2 salariés",
    "02": "3-5 salariés",
    "03": "6-9 salariés",
    "11": "10-19 salariés",
    "12": "20-49 salariés",
    "21": "50-99 salariés",
    "22": "100-199 salariés",
    "31": "200-249 salariés",
    "32": "250-499 salariés",
    "41": "500-999 salariés",
    "42": "1 000-1 999 salariés",
    "51": "2 000-4 999 salariés",
    "52": "5 000-9 999 salariés",
    "53": "10 000+ salariés",
  }
  return map[code] ?? "Effectif non renseigné"
}

async function generateEmail(
  entreprise: string,
  secteur: string,
  ville: string,
  profile: UserProfile
): Promise<string> {
  const prenom = profile.prenom ?? "[Prénom]"
  const ecole = profile.ecole ?? "[École]"
  const niveau = profile.niveau ?? "[Niveau]"
  const secteurProfil = profile.secteur ?? secteur

  const prompt = `Rédige un email de candidature spontanée pour une alternance.

Candidat :
- Prénom : ${prenom}
- Formation : ${niveau} en ${secteurProfil} à ${ecole}

Entreprise cible : ${entreprise} (${ville})
Secteur : ${secteur}

Contraintes :
- Email professionnel et percutant, maximum 150 mots
- Commencer par "Objet: [objet pertinent]"
- Mentionner le prénom et l'école du candidat dans le corps
- Terminer par une formule de politesse signée par le prénom du candidat
- Écrire entièrement en français
- N'utiliser AUCUN placeholder entre crochets — intégrer toutes les vraies informations

Réponds uniquement avec l'email complet, sans commentaire ni explication.`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  })

  return response.content[0].type === "text" ? response.content[0].text : ""
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "").trim()
  if (!token) return null
  const { data: { user } } = await createServerClient().auth.getUser(token)
  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { secteur, region, taille = "toutes", sirets, userProfile } = body as {
      secteur: string
      region: string
      taille?: string
      sirets?: string[]
      userProfile?: UserProfile
    }

    if (!secteur || !region) {
      return Response.json({ error: "secteur et region requis" }, { status: 400 })
    }

    // Step 2 — search only (no email generation)
    if (!sirets) {
      const rawEntreprises = await searchEntreprises(secteur, region, taille)

      const entreprises: EntrepriseProspect[] = rawEntreprises.slice(0, 12).map((e) => ({
        siret: e.siret,
        nom: e.nom,
        secteur,
        ville: e.ville,
        taille: e.taille,
        email_genere: "",
        statut: "en_attente" as const,
      }))

      return Response.json({
        entreprises,
        secteur,
        region,
        id: crypto.randomUUID(),
        user_id: "",
        created_at: new Date().toISOString(),
      })
    }

    // Step 3 — generate emails for selected sirets
    const { companies } = body as {
      companies: Array<{ siret: string; nom: string; ville: string; taille: string }>
    }

    if (!companies || !Array.isArray(companies)) {
      return Response.json({ error: "companies requis pour la génération d'emails" }, { status: 400 })
    }

    const selected = companies.filter((c) => sirets.includes(c.siret))
    const profile = userProfile ?? {}

    const entreprises: EntrepriseProspect[] = await Promise.all(
      selected.map(async (e) => {
        const email = await generateEmail(e.nom, secteur, e.ville, profile)
        return {
          siret: e.siret,
          nom: e.nom,
          secteur,
          ville: e.ville,
          taille: e.taille,
          email_genere: email,
          statut: "en_attente" as const,
        }
      })
    )

    // Save campagne to Supabase
    const userId = await resolveUserId(request)
    let savedId = crypto.randomUUID()
    if (userId) {
      const sb = createServerClient()
      console.log("[api/prospection] Saving campagne for user", userId, "—", entreprises.length, "entreprises")
      const { data, error } = await sb
        .from("prospection_campagnes")
        .insert({
          user_id: userId,
          entreprises: entreprises.map((e) => ({ nom: e.nom, statut: e.statut })),
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single()
      if (error) console.error("[api/prospection] Supabase insert error:", error)
      else console.log("[api/prospection] Campagne saved, id:", data?.id)
      if (data?.id) savedId = data.id
    } else {
      console.warn("[api/prospection] No userId — skipping Supabase save")
    }

    return Response.json({
      entreprises,
      secteur,
      region,
      id: savedId,
      user_id: userId ?? "",
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[api/prospection]", err)
    return Response.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
