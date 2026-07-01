import { NextRequest } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"

export async function POST(request: NextRequest) {
  try {
    const { entreprise, poste, prenom, dateContact } = await request.json()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 350,
      messages: [{
        role: "user",
        content: `Génère un email de relance professionnel pour une candidature alternance.

Candidat : ${prenom || "Le candidat"}
Entreprise : ${entreprise}
Poste : ${poste || "alternance"}
Premier contact : ${dateContact || "il y a quelques semaines"}

Contraintes :
- Commencer par "Objet: [objet pertinent]"
- 80-100 mots maximum
- Rappeler la candidature initiale avec enthousiasme
- Proposer un entretien téléphonique
- Ton professionnel et dynamique
- Finir par une formule de politesse avec le prénom

Réponds uniquement avec l'email, sans commentaire.`,
      }],
    })

    const email = response.content[0].type === "text" ? response.content[0].text : ""
    return Response.json({ email })
  } catch (err) {
    console.error("[api/candidatures/relance]", err)
    return Response.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
