import { NextRequest } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"

export type TypePost = "recherche" | "apprentissage" | "projet" | "actualite"

export interface PostResult {
  /** Première ligne : c'est tout ce qui s'affiche avant le « voir plus ». */
  accroche: string
  /** Corps du post, paragraphes séparés par des sauts de ligne. */
  corps: string
  hashtags: string[]
}

const BRIEFS: Record<TypePost, string> = {
  recherche:
    "Recherche d'alternance : l'étudiant annonce qu'il cherche une alternance. Il précise le poste, le rythme et la date de début, et termine par un appel à partager le post.",
  apprentissage:
    "Partage d'apprentissage : l'étudiant raconte une compétence ou une notion qu'il vient d'apprendre, ce qu'il a compris et en quoi c'est utile en entreprise.",
  projet:
    "Retour sur un projet : l'étudiant raconte un projet qu'il a mené — le problème, ce qu'il a fait, le résultat concret et ce qu'il en retire.",
  actualite:
    "Commentaire d'actualité du secteur : l'étudiant réagit à une tendance de son secteur et donne son point de vue d'étudiant, sans prétendre être un expert.",
}

function isTypePost(value: unknown): value is TypePost {
  return typeof value === "string" && value in BRIEFS
}

export async function POST(request: NextRequest) {
  try {
    const { typePost, sujet, prenom, ecole, niveau, secteur, posteVise } = await request.json()

    const type: TypePost = isTypePost(typePost) ? typePost : "recherche"

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: `Tu es un expert LinkedIn pour alternants en France. Rédige un post LinkedIn.

L'étudiant :
- Prénom : ${prenom || "(inconnu)"}
- École : ${ecole || "(non renseignée)"}
- Niveau : ${niveau || "(non renseigné)"}
- Secteur : ${secteur || "(non renseigné)"}
- Poste d'alternance recherché : ${posteVise || "(non renseigné)"}

Type de post : ${BRIEFS[type]}
Sujet précis donné par l'étudiant : ${sujet || "(rien de précis — reste sur son secteur et son poste visé)"}

Génère un JSON valide UNIQUEMENT (sans markdown, sans backticks) :
{
  "accroche": "...",
  "corps": "...",
  "hashtags": ["#...", "#...", "#..."]
}

Règles :
- accroche : UNE seule ligne, 12 mots max. C'est la seule chose visible avant le « voir plus » : elle doit donner envie de cliquer. Pas de question creuse, pas de "Je suis ravi de vous annoncer".
- corps : 150 à 200 mots au total avec l'accroche. Structure aérée : 3 à 5 paragraphes courts séparés par "\n\n", certains d'une seule phrase. Pas de titres, pas de puces markdown.
- Ton naturel, première personne, phrases courtes. Interdits : "riche en enseignements", "je suis ravi de", "n'hésitez pas à", "dans un monde où", "humblement", superlatifs corporate.
- Pas d'emoji sauf s'il apporte vraiment quelque chose (1 maximum).
- hashtags : exactement 3, pertinents pour ${secteur || "le secteur de l'étudiant"} et l'alternance, écrits en CamelCase avec le # inclus.
- Ne mets AUCUN hashtag dans "accroche" ni dans "corps".`,
      }],
    })

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}"
    const clean = raw.replace(/```json\n?|```\n?/g, "").trim()
    const result: PostResult = JSON.parse(clean)

    return Response.json(result)
  } catch (err) {
    console.error("[api/linkedin/post]", err)
    return Response.json({ error: "Erreur lors de la génération" }, { status: 500 })
  }
}
