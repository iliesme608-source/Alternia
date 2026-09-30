import { NextRequest } from "next/server"
import { anthropic, MODEL, textOf } from "@/lib/anthropic"

const FALLBACK = `Objet : Contrat d'alternance, point sur mon autorisation de travail

Madame, Monsieur,

Je vous remercie sincèrement pour l'intérêt que vous portez à ma candidature.

En tant qu'étudiant étranger titulaire d'un titre de séjour mention « étudiant », je dois obtenir une autorisation de travail auprès de la préfecture avant la signature de mon contrat d'alternance. Cette démarche est entièrement à ma charge : je prépare le dossier, je le dépose sur le portail officiel du ministère de l'Intérieur et j'en assure le suivi.

Concrètement, la seule pièce attendue de votre part est la promesse d'embauche (ou le CERFA renseigné). Le dossier est ensuite instruit par l'administration, avec un délai constaté de 2 à 4 mois selon les préfectures. Je vous tiendrai informé de chaque étape et vous transmettrai l'autorisation dès sa délivrance.

Je reste bien entendu disponible pour ajuster la date de démarrage et pour répondre à toute question sur ces démarches.

En vous remerciant de votre confiance,
Bien cordialement,`

export async function POST(request: NextRequest) {
  try {
    const { prenom, nom, poste, entreprise, nationalite, etapeActuelle } = await request.json()

    const contexte = [
      prenom || nom ? `Candidat : ${[prenom, nom].filter(Boolean).join(" ")}` : null,
      poste ? `Poste visé : ${poste}` : null,
      entreprise ? `Entreprise : ${entreprise}` : null,
      nationalite ? `Situation : ${nationalite}` : null,
      etapeActuelle ? `Étape administrative en cours : ${etapeActuelle}` : null,
    ].filter(Boolean).join("\n")

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      messages: [{
        role: "user",
        content: `Tu es Lucas, coach carrière spécialiste des démarches administratives des étudiants internationaux en France.

Rédige un email professionnel en français, adressé par un étudiant étranger (hors Union Européenne) au recruteur d'une entreprise qui souhaite le recruter en alternance. L'email explique la procédure d'autorisation de travail et ses délais (2 à 4 mois en préfecture) de façon rassurante et factuelle.

${contexte || "Aucune information supplémentaire fournie : reste générique."}

Contraintes :
- Ton professionnel, positif, jamais alarmiste : la démarche est normale, encadrée et gérée par le candidat.
- Rappelle que la seule pièce attendue de l'entreprise est la promesse d'embauche (ou le CERFA renseigné).
- Précise que le candidat dépose et suit le dossier lui-même sur le portail du ministère de l'Intérieur.
- Propose de la souplesse sur la date de démarrage et une information régulière de l'avancement.
- 200 à 280 mots maximum, avec une ligne « Objet : ... » en première ligne.
- Aucun crochet ni champ à compléter du type [nom] : si une information manque, formule la phrase sans elle.

Retourne UNIQUEMENT le texte de l'email, sans commentaire ni mise en forme Markdown.`,
      }],
    })

    const email = textOf(response, FALLBACK).trim()
    return Response.json({ email })
  } catch (err) {
    console.error("[api/international/email-delais]", err)
    return Response.json({ email: FALLBACK })
  }
}
