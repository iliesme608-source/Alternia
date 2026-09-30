import { NextRequest } from "next/server"
import { anthropic, MODEL, textOf } from "@/lib/anthropic"
import { sectorWritingGuide } from "@/lib/sector-voice"

export interface SousScore {
  label: string
  /** Note sur 20. */
  score: number
  /** Action précise à faire pour gagner des points sur cet axe. */
  action: string
}

export interface ScoreProfilResult {
  /** Somme des 5 sous-scores, sur 100. */
  score_global: number
  sous_scores: SousScore[]
}

/** Ordre et intitulés imposés : le front s'appuie dessus. */
const AXES = [
  "Titre accrocheur",
  "Résumé convaincant",
  "Mots-clés recruteurs",
  "Cohérence avec le poste visé",
  "Complétude",
] as const

function clampNote(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 0
  return Math.min(20, Math.max(0, n))
}

export async function POST(request: NextRequest) {
  try {
    const { titre, resume, competences, posteVise, secteur } = await request.json()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `Tu es un expert LinkedIn pour alternants en France. Audite ce profil et note-le.

Titre LinkedIn : "${titre || "(vide)"}"
Résumé / À propos : "${resume || "(vide)"}"
Compétences listées : "${competences || "(vide)"}"
Poste d'alternance visé : ${posteVise || "(non renseigné)"}
Secteur : ${secteur || "(non renseigné)"}

GRILLE DE LECTURE — ce qu'attend un recruteur de ce secteur (sers-t'en pour noter et pour formuler les actions) :
${sectorWritingGuide(secteur, posteVise)}

Génère un JSON valide UNIQUEMENT (sans markdown, sans backticks) :
{
  "sous_scores": [
${AXES.map(a => `    { "label": "${a}", "score": 0, "action": "..." }`).join(",\n")}
  ]
}

Règles :
- Les 5 objets doivent apparaître dans cet ordre exact, avec ces "label" exacts.
- "score" : entier de 0 à 20. Sois exigeant et honnête : un champ vide vaut 0 à 4, un contenu générique 8 à 12, un contenu vraiment optimisé 17 à 20. N'attribue pas 20 par politesse.
- "action" : UNE action précise et immédiatement applicable, 25 mots max, à l'impératif ("Ajoute…", "Remplace…", "Supprime…"). Cite un mot ou une formulation concrète tirée du profil ou du poste visé. Jamais de conseil vague type "sois plus percutant".
- Ce que chaque axe évalue :
  · Titre accrocheur → le titre donne-t-il envie de cliquer et dit-il clairement ce que l'étudiant cherche ?
  · Résumé convaincant → accroche, structure, preuves concrètes, appel à l'action.
  · Mots-clés recruteurs → présence des termes que les recruteurs de ${secteur || "ce secteur"} tapent dans la recherche LinkedIn.
  · Cohérence avec le poste visé → titre, résumé et compétences pointent-ils tous vers ${posteVise || "le poste visé"} ?
  · Complétude → densité et pertinence des compétences listées, absence de champs vides.`,
      }],
    })

    const raw = textOf(response, "{}")
    const clean = raw.replace(/```json\n?|```\n?/g, "").trim()
    const parsed = JSON.parse(clean) as { sous_scores?: SousScore[] }

    // On réaligne sur les 5 axes attendus et on recalcule le total : le score
    // affiché est toujours la somme exacte des sous-scores.
    const sous_scores: SousScore[] = AXES.map(label => {
      const match = parsed.sous_scores?.find(s => s.label === label)
      return {
        label,
        score: clampNote(match?.score),
        action: match?.action?.trim() || "Complète cette partie de ton profil.",
      }
    })

    const result: ScoreProfilResult = {
      score_global: sous_scores.reduce((total, s) => total + s.score, 0),
      sous_scores,
    }

    return Response.json(result)
  } catch (err) {
    console.error("[api/linkedin/score]", err)
    return Response.json({ error: "Erreur lors de l'analyse" }, { status: 500 })
  }
}
