import { NextRequest } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"

export async function POST(request: NextRequest) {
  try {
    const { secteur, region, niveau, annee, salaireMini, marcheMin, marcheMax } = await request.json()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Tu es Nora, experte en rémunération des alternants en France.
Donne un conseil court et percutant (2-3 phrases) sur le salaire pour ce profil :
- Secteur : ${secteur}
- Région : ${region}
- Niveau : ${niveau} — ${annee}ème année de cycle
- Salaire légal minimum : ${Math.round(salaireMini)}€ brut
- Fourchette marché : ${marcheMin}–${marcheMax}€

Commence directement par "Dans ton secteur...". Sois actionnable et précise.`,
      }],
    })

    const conseil = response.content[0].type === "text" ? response.content[0].text : ""
    return Response.json({ conseil })
  } catch (err) {
    console.error("[api/salaire/conseil]", err)
    return Response.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
