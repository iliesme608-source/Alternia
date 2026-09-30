import { NextRequest } from "next/server"
import { anthropic, WRITING_MODEL, textOf } from "@/lib/anthropic"
import { sectorWritingGuide } from "@/lib/sector-voice"
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
  nom?: string | null
  ecole?: string | null
  niveau?: string | null
  secteur?: string | null
  region?: string | null
  poste_recherche?: string | null
  rythme?: string | null
  date_debut?: string | null
  duree?: string | null
  competences?: string | null
}

type ApiResult = {
  siren?: string
  nom_raison_sociale?: string
  activite_principale?: string
  siege?: {
    siret?: string
    libelle_commune?: string
    code_postal?: string
    activite_principale?: string
    tranche_effectif_salarie?: string
  }
}

/** Une entreprise telle que renvoyée par le registre SIRENE (API recherche-entreprises). */
interface SireneCompany {
  siret: string
  siren: string
  nom: string
  ville: string
  code_postal: string
  naf_code: string
  taille: string
}

async function searchEntreprises(
  secteur: string,
  region: string,
  taille: string
): Promise<SireneCompany[]> {
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
      .map((e: ApiResult) => {
        const siret = e.siege!.siret!
        // Le SIREN est les 9 premiers chiffres du SIRET — les deux viennent du registre.
        const siren = e.siren ?? (/^\d{14}$/.test(siret) ? siret.slice(0, 9) : "")
        return {
          siret,
          siren,
          nom: e.nom_raison_sociale!,
          ville: e.siege?.libelle_commune ?? region,
          code_postal: e.siege?.code_postal ?? "",
          naf_code: e.siege?.activite_principale ?? e.activite_principale ?? "",
          taille: tailleTranche(e.siege?.tranche_effectif_salarie ?? ""),
        }
      })
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

/** Nettoie une valeur de profil : "" / null / undefined → null. */
function clean(v?: string | null): string | null {
  const s = (v ?? "").trim()
  return s.length > 0 ? s : null
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

/** "2026-09" (input type=month) → "septembre 2026". Toute autre forme est laissée telle quelle. */
function formatDateDebut(v?: string | null): string | null {
  const s = clean(v)
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})$/)
  if (!m) return s
  const mois = MOIS[Number(m[2]) - 1]
  return mois ? `${mois} ${m[1]}` : s
}

/**
 * Construit la phrase de présentation du profil à partir des seules données
 * réellement renseignées — une donnée vide n'est jamais mentionnée.
 */
function describeProfile(profile: UserProfile, secteurRecherche: string): string {
  const prenom = clean(profile.prenom)
  const nom = clean(profile.nom)
  const niveau = clean(profile.niveau)
  const ecole = clean(profile.ecole)
  const poste = clean(profile.poste_recherche)
  const secteur = clean(profile.secteur) ?? clean(secteurRecherche)
  const rythme = clean(profile.rythme)
  const dateDebut = formatDateDebut(profile.date_debut)
  const duree = clean(profile.duree)

  const parts: string[] = []
  const identite = [prenom, nom].filter(Boolean).join(" ")
  if (identite) parts.push(identite)
  if (niveau && ecole) parts.push(`étudiant(e) en ${niveau} à ${ecole}`)
  else if (niveau) parts.push(`étudiant(e) en ${niveau}`)
  else if (ecole) parts.push(`étudiant(e) à ${ecole}`)

  const recherche: string[] = ["recherche une alternance"]
  if (poste) recherche.push(poste)
  if (secteur) recherche.push(`en ${secteur}`)
  parts.push(recherche.join(" "))

  if (rythme) parts.push(`rythme ${rythme}`)
  if (dateDebut && duree) parts.push(`disponible à partir de ${dateDebut} pour ${duree}`)
  else if (dateDebut) parts.push(`disponible à partir de ${dateDebut}`)
  else if (duree) parts.push(`pour une durée de ${duree}`)

  return parts.join(", ")
}

async function generateEmail(
  entreprise: string,
  secteur: string,
  ville: string,
  profile: UserProfile
): Promise<string> {
  const competences = clean(profile.competences)
  const villeEntreprise = clean(ville)
  const secteurEntreprise = clean(secteur)

  const lignes = [
    `Profil étudiant : ${describeProfile(profile, secteur)}.`,
    competences ? `Compétences : ${competences}.` : null,
    `Entreprise cible : ${entreprise}${secteurEntreprise ? `, secteur ${secteurEntreprise}` : ""}${villeEntreprise ? `, ville ${villeEntreprise}` : ""}.`,
  ].filter(Boolean).join("\n")

  const prompt = `Tu rédiges un email de candidature spontanée pour une alternance. Utilise uniquement les informations disponibles et pertinentes. Ne mentionne jamais une année spécifique, n'invente aucune expérience, aucune compétence, aucun recrutement passé de cette entreprise. Évite absolument les phrases : "Votre position en Île-de-France m'intéresse", "Je vous contacte pour explorer des opportunités". L'email doit sonner naturel, spécifique à cette entreprise et à ce profil, jamais générique.
${lignes}

${sectorWritingGuide(profile.secteur, profile.poste_recherche, secteur)}

Rédige un email de 120 mots maximum, objet accrocheur, corps en 3 paragraphes courts : accroche spécifique à cette entreprise, valeur ajoutée du profil, appel à l'action simple.

Format de réponse : première ligne "Objet : …" puis une ligne vide puis le corps de l'email. Aucun placeholder entre crochets, aucun commentaire, aucune explication.`

  const response = await anthropic.messages.create({
    model: WRITING_MODEL,
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  })

  return textOf(response)
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
        siren: e.siren,
        naf_code: e.naf_code,
        code_postal: e.code_postal,
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
      companies: Array<{
        siret: string
        nom: string
        ville: string
        taille: string
        siren?: string
        naf_code?: string
        code_postal?: string
      }>
    }

    if (!companies || !Array.isArray(companies)) {
      return Response.json({ error: "companies requis pour la génération d'emails" }, { status: 400 })
    }

    const selected = companies.filter((c) => sirets.includes(c.siret))
    const profile = userProfile ?? {}

    const posteRecherche = (profile.poste_recherche ?? "").trim()

    const entreprises: EntrepriseProspect[] = await Promise.all(
      selected.map(async (e) => {
        const email = await generateEmail(e.nom, secteur, e.ville, profile)
        return {
          siret: e.siret,
          siren: e.siren ?? (/^\d{14}$/.test(e.siret) ? e.siret.slice(0, 9) : undefined),
          naf_code: e.naf_code,
          code_postal: e.code_postal,
          nom: e.nom,
          secteur,
          ville: e.ville,
          taille: e.taille,
          poste: posteRecherche || `Alternance ${secteur}`,
          email_genere: email,
          statut: "en_attente" as const,
          statut_suivi: "Prête",
        }
      })
    )

    // Save campagne to Supabase
    const userId = await resolveUserId(request)
    let savedId = crypto.randomUUID()
    if (userId) {
      const sb = createServerClient()
      console.log("[api/prospection] Saving campagne for user", userId, "—", entreprises.length, "entreprises")
      // On conserve `nom` + `statut` (lus par le Kanban /candidatures) et on
      // ajoute les données nécessaires au suivi : email généré, SIREN/SIRET, NAF…
      const { data, error } = await sb
        .from("prospection_campagnes")
        .insert({
          user_id: userId,
          secteur,
          region,
          entreprises,
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
