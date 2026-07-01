import { NextRequest } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"

export type Categorie = "logique" | "numerique" | "personnalite"

export interface Question {
  enonce: string
  options: string[]
  reponse: number       // index 0-3 (pour logique/numerique), -1 pour personnalite
  explication: string
  traits?: string[]     // pour personnalite : trait correspondant à chaque option
}

const PROMPTS: Record<Categorie, string> = {
  logique: `Génère 10 questions de tests logiques de recrutement pour un alternant (suites numériques, matrices, analogies verbales, syllogismes). Niveau intermédiaire. Format JSON strict UNIQUEMENT (sans backticks, sans markdown) :
[{"enonce":"...","options":["A","B","C","D"],"reponse":0,"explication":"Explication courte de la réponse correcte."}]
La "reponse" est l'index (0-3) de la bonne réponse.`,

  numerique: `Génère 10 questions de tests numériques de recrutement pour un alternant (calculs de pourcentages, moyennes, ratios, lecture de tableaux, règles de trois). Niveau intermédiaire. Format JSON strict UNIQUEMENT (sans backticks, sans markdown) :
[{"enonce":"...","options":["A","B","C","D"],"reponse":0,"explication":"Explication courte avec le calcul."}]
La "reponse" est l'index (0-3) de la bonne réponse.`,

  personnalite: `Génère 10 questions de personnalité style MBTI pour un entretien d'alternance. Chaque question sonde un trait professionnel. Format JSON strict UNIQUEMENT (sans backticks, sans markdown) :
[{"enonce":"...","options":["A","B","C","D"],"reponse":-1,"explication":"Ce que révèle chaque option en contexte pro.","traits":["Analytique","Créatif","Collaboratif","Ambitieux"]}]
Les 4 traits sont TOUJOURS dans cet ordre exact : Analytique, Créatif, Collaboratif, Ambitieux.`,
}

export async function POST(request: NextRequest) {
  try {
    const { categorie } = (await request.json()) as { categorie: Categorie }
    const prompt = PROMPTS[categorie]
    if (!prompt) return Response.json({ error: "Catégorie invalide" }, { status: 400 })

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = response.content[0].type === "text" ? response.content[0].text : "[]"
    const clean = raw.replace(/```json\n?|```\n?/g, "").trim()
    const match = clean.match(/\[[\s\S]*\]/)
    const questions: Question[] = match ? JSON.parse(match[0]) : []

    return Response.json({ questions })
  } catch (err) {
    console.error("[api/tests/questions]", err)
    return Response.json({ error: "Erreur lors de la génération des questions" }, { status: 500 })
  }
}
