import { NextRequest } from "next/server"
import { anthropic, MODEL, textOf } from "@/lib/anthropic"

interface CVFrancaisResult {
  cv_adapte: string
  differences: { titre: string; explication: string }[]
}

function parse(raw: string): CVFrancaisResult {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as Partial<CVFrancaisResult>
      return {
        cv_adapte: parsed.cv_adapte ?? "",
        differences: Array.isArray(parsed.differences) ? parsed.differences : [],
      }
    }
  } catch { /* fall through */ }
  return { cv_adapte: raw, differences: [] }
}

export async function POST(request: NextRequest) {
  try {
    const { cv, pays } = await request.json()

    if (typeof cv !== "string" || cv.trim().length < 40) {
      return Response.json({ error: "CV trop court : colle le contenu complet de ton CV." }, { status: 400 })
    }

    const paysLabel = typeof pays === "string" && pays.trim() ? pays.trim() : "Autre"

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `Adapte ce CV au format standard français. Règles : une page maximum, photo optionnelle, pas d'âge ni de situation familiale, formation avant expérience si étudiant, dates au format français, compétences en fin de CV. Explique les 5 différences principales entre le format ${paysLabel} et le format français.

CV à adapter :
"""
${cv.slice(0, 12000)}
"""

Réponds en JSON strict, sans texte autour :
{
  "cv_adapte": "le CV complet réécrit au format français, en texte brut structuré par sections (titre, coordonnées, profil, formation, expérience, compétences, langues)",
  "differences": [
    { "titre": "Titre court de la différence", "explication": "Explication concrète en 1 à 2 phrases, orientée conseil pratique." }
  ]
}

Le tableau "differences" doit contenir exactement 5 entrées comparant le format ${paysLabel} au format français.`,
      }],
    })

    const raw = textOf(response)
    return Response.json(parse(raw))
  } catch (err) {
    console.error("[api/international/cv-francais]", err)
    return Response.json({ error: "Adaptation impossible pour le moment. Réessaie dans un instant." }, { status: 500 })
  }
}
