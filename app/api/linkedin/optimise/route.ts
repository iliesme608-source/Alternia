import { NextRequest } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"

export interface LinkedInResult {
  titre: string
  resume: string
  competences: string[]
  conseils: string[]
}

export async function POST(request: NextRequest) {
  try {
    const { titreActuel, resumeActuel, secteur, poste } = await request.json()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `Tu es un expert LinkedIn pour alternants en France. Optimise ce profil.

Titre actuel : "${titreActuel || "(vide)"}"
Résumé actuel : "${resumeActuel || "(vide)"}"
Secteur visé : ${secteur}
Poste visé : ${poste}

Génère un JSON valide UNIQUEMENT (sans markdown, sans backticks) :
{
  "titre": "...",
  "resume": "...",
  "competences": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
  "conseils": ["...", "...", "...", "...", "..."]
}

Règles :
- titre : 120 chars max, mots-clés recruteurs pour ${secteur}, mention alternance et école
- resume : 1800-2000 chars, accrocheur, 3 paragraphes (profil, compétences clés, projet pro), orienté ${poste}
- competences : 10 compétences LinkedIn exactes pour ${secteur} (ex: "Python", "Analyse de données")
- conseils : 5 conseils actionnables pour booster la visibilité (publication, connexions, mots-clés)`,
      }],
    })

    const raw = response.content[0].type === "text" ? response.content[0].text : "{}"
    const clean = raw.replace(/```json\n?|```\n?/g, "").trim()
    const result: LinkedInResult = JSON.parse(clean)

    return Response.json(result)
  } catch (err) {
    console.error("[api/linkedin/optimise]", err)
    return Response.json({ error: "Erreur lors de la génération" }, { status: 500 })
  }
}
