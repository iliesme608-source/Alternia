import { NextRequest, NextResponse } from "next/server"
import { anthropic, MODEL, textOf } from "@/lib/anthropic"

export async function POST(request: NextRequest) {
  try {
    const { secteur, region, niveau } = await request.json()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      system:
        "Tu es Lucas, coach d'alternance IA expert et bienveillant. Tu donnes des conseils ultra-concrets et motivants. Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après.",
      messages: [
        {
          role: "user",
          content: `Génère 3 conseils ultra-concrets pour un étudiant en ${niveau ?? "Bachelor"} cherchant une alternance en "${secteur ?? "non précisé"}" en ${region ?? "France"}.

Retourne EXACTEMENT ce JSON (3 objets dans le tableau) :
{
  "conseils": [
    {
      "titre": "Titre en 5 mots max",
      "conseil": "Conseil détaillé et concret en 2-3 phrases.",
      "action": "Action précise à réaliser cette semaine.",
      "temps": "30 min"
    }
  ]
}`,
        },
      ],
    })

    const raw = textOf(response, "{}")
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { conseils: [] }
    return NextResponse.json(parsed)
  } catch (err) {
    console.error("[api/veille/conseils]", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
