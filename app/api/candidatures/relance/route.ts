import { NextRequest } from "next/server"
import { anthropic, WRITING_MODEL, textOf } from "@/lib/anthropic"
import { sectorWritingGuide } from "@/lib/sector-voice"

export async function POST(request: NextRequest) {
  try {
    const { entreprise, poste, prenom, dateContact, secteur } = await request.json()

    const response = await anthropic.messages.create({
      model: WRITING_MODEL,
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `Génère un email de relance professionnel pour une candidature alternance.

Candidat : ${prenom || "Le candidat"}
Entreprise : ${entreprise}
Poste : ${poste || "alternance"}
Premier contact : ${dateContact || "il y a quelques semaines"}

${sectorWritingGuide(secteur, poste)}

Contraintes :
- Commencer par "Objet: [objet pertinent]"
- 80 mots maximum pour le corps de l'email
- Ton naturel et humain, sans formules pompeuses
- Rappeler brièvement la candidature initiale
- Proposer un échange téléphonique
- Finir par une formule de politesse avec le prénom

Réponds uniquement avec l'email, sans commentaire.`,
      }],
    })

    const email = textOf(response)
    return Response.json({ email })
  } catch (err) {
    console.error("[api/candidatures/relance]", err)
    return Response.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
