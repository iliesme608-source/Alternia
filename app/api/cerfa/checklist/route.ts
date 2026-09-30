import { NextRequest } from "next/server"
import { anthropic, MODEL, textOf } from "@/lib/anthropic"

export async function POST(request: NextRequest) {
  try {
    const { secteur, opcoNom } = await request.json()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `Tu es un expert en contrats d'alternance français. Génère une checklist précise de 12 documents à préparer pour signer un CERFA FA13 (contrat d'alternance) dans le secteur "${secteur}" géré par ${opcoNom}.

Retourne UNIQUEMENT un tableau JSON de strings, chaque string étant un document ou action à préparer :
["document ou action 1", "document ou action 2", ...]

Les items doivent être concrets, spécifiques au secteur et à l'OPCO. Inclure : CERFA FA13, pièces d'identité, convention de formation, documents RH, etc.`,
      }],
    })

    const raw = textOf(response, "[]")
    const match = raw.match(/\[[\s\S]*\]/)
    const checklist: string[] = match ? JSON.parse(match[0]) : []

    return Response.json({ checklist })
  } catch (err) {
    console.error("[api/cerfa/checklist]", err)
    return Response.json({
      checklist: [
        "CERFA FA13 (contrat d'apprentissage) complété et signé par les 3 parties",
        "Convention de formation signée entre l'entreprise et le CFA/école",
        "Pièce d'identité de l'apprenti (CNI ou passeport)",
        "Justificatif du niveau d'études (dernier diplôme obtenu)",
        "Justificatif de domicile de moins de 3 mois",
        "RIB de l'apprenti pour le virement de la rémunération",
        "Numéro de Sécurité Sociale de l'apprenti",
        "Attestation d'inscription dans le CFA/école",
        "Fiche de poste / description des missions",
        "Informations de l'entreprise (SIRET, convention collective)",
        "Désignation d'un maître d'apprentissage (CV + justificatif d'expérience)",
        "Attestation de médecine du travail (à effectuer dans les 2 premiers mois)",
      ]
    })
  }
}
