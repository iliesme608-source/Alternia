import { NextRequest } from "next/server"
import { anthropic, WRITING_MODEL, textOf } from "@/lib/anthropic"
import { sectorWritingGuide } from "@/lib/sector-voice"

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
      model: WRITING_MODEL,
      max_tokens: 5000,
      messages: [{
        role: "user",
        content: `Tu es un expert LinkedIn pour alternants en France. Optimise ce profil.

Titre actuel : "${titreActuel || "(vide)"}"
Résumé actuel : "${resumeActuel || "(vide)"}"
Secteur visé : ${secteur}
Poste visé : ${poste}

${sectorWritingGuide(secteur, poste)}
- Le titre et le résumé seront lus par des recruteurs de ce secteur : emploie LEURS mots-clés de recherche, pas des termes génériques.
- N'invente aucune expérience, école ou compétence absente du profil actuel : si une information manque, laisse un repère entre crochets à compléter par l'étudiant (ex. [ton école]).

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

    const raw = textOf(response, "{}")
    const clean = raw.replace(/```json\n?|```\n?/g, "").trim()
    const result: LinkedInResult = JSON.parse(clean)

    return Response.json(result)
  } catch (err) {
    console.error("[api/linkedin/optimise]", err)
    return Response.json({ error: "Erreur lors de la génération" }, { status: 500 })
  }
}
