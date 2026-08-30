import { NextRequest } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"

/** Limite stricte imposée par LinkedIn sur une note de connexion. */
const CONNEXION_MAX_CHARS = 280

export type LienCommun = "ecole" | "filiere" | "ville" | "aucun"

export interface ConnexionVariante {
  /** "conseil" = demande de conseil · "mise_en_relation" = demande d'intro. */
  type: "conseil" | "mise_en_relation"
  message: string
}

export interface ConnexionResult {
  variantes: ConnexionVariante[]
}

const LIENS: Record<LienCommun, string> = {
  ecole:   "vous venez de la même école",
  filiere: "vous venez de la même filière / du même type de formation",
  ville:   "vous êtes de la même ville / région",
  aucun:   "aucun lien commun — appuie-toi alors sur l'entreprise ou le métier de la personne",
}

function isLienCommun(value: unknown): value is LienCommun {
  return typeof value === "string" && value in LIENS
}

/** Ramène un message sous la limite LinkedIn sans le couper en plein mot. */
function capMessage(message: string): string {
  const clean = message.trim()
  if (clean.length <= CONNEXION_MAX_CHARS) return clean

  const window = clean.slice(0, CONNEXION_MAX_CHARS)
  const lastPunct = Math.max(window.lastIndexOf("."), window.lastIndexOf("!"), window.lastIndexOf("?"))
  if (lastPunct > 120) return window.slice(0, lastPunct + 1).trim()

  const lastSpace = window.lastIndexOf(" ")
  return (lastSpace > 120 ? window.slice(0, lastSpace) : window).trim()
}

export async function POST(request: NextRequest) {
  try {
    const { nomPersonne, postePersonne, entreprise, lienCommun, prenom, ecole, niveau, secteur, region, posteVise } =
      await request.json()

    const lien = LIENS[isLienCommun(lienCommun) ? lienCommun : "aucun"]

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Tu es un expert LinkedIn pour alternants en France. Rédige des notes de connexion.

L'étudiant :
- Prénom : ${prenom || "(inconnu)"}
- École : ${ecole || "(non renseignée)"}
- Niveau : ${niveau || "(non renseigné)"}
- Secteur / filière : ${secteur || "(non renseigné)"}
- Ville / région : ${region || "(non renseignée)"}
- Poste d'alternance recherché : ${posteVise || "(non renseigné)"}

La personne à contacter :
- Nom : ${nomPersonne}
- Poste : ${postePersonne}
- Entreprise : ${entreprise}
- Lien commun : ${lien}

Génère un JSON valide UNIQUEMENT (sans markdown, sans backticks) :
{
  "variantes": [
    { "type": "conseil", "message": "..." },
    { "type": "mise_en_relation", "message": "..." }
  ]
}

Règles ABSOLUES pour chaque message :
- ${CONNEXION_MAX_CHARS} caractères MAXIMUM, espaces et ponctuation compris (limite stricte LinkedIn). Compte les caractères avant de répondre.
- Le lien commun est mentionné dès la PREMIÈRE phrase.
- Concret : cite le poste de la personne ou l'entreprise, jamais de formule creuse type "votre parcours m'inspire".
- Ne JAMAIS demander un job, un stage, une alternance ou un CV. Demander uniquement un échange de 15 minutes.
- Tutoiement interdit : vouvoiement, ton professionnel mais naturel, pas de jargon corporate.
- Pas d'emoji, pas de hashtag, pas de saut de ligne.

Différence entre les deux variantes :
- "conseil" : l'étudiant demande un retour d'expérience / un conseil sur le métier ou l'entreprise.
- "mise_en_relation" : l'étudiant demande à être orienté vers la bonne personne à contacter en interne.`,
      }],
    })

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}"
    const clean = raw.replace(/```json\n?|```\n?/g, "").trim()
    const parsed = JSON.parse(clean) as ConnexionResult

    const result: ConnexionResult = {
      variantes: parsed.variantes.map(v => ({ ...v, message: capMessage(v.message) })),
    }

    return Response.json(result)
  } catch (err) {
    console.error("[api/linkedin/connexion]", err)
    return Response.json({ error: "Erreur lors de la génération" }, { status: 500 })
  }
}
