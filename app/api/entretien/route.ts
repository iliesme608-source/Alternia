import { NextRequest } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"
import { createServerClient } from "@/lib/supabase"
import type { Message } from "@/types"

type Langue = "fr" | "en" | "mixte"

const CONSIGNES_LANGUE: Record<Langue, string> = {
  fr: "",
  en: `
Consigne de langue :
Conduct the entire interview in English. Ask questions in English, provide feedback in English. The candidate is applying for an apprenticeship in France but prefers English for this practice session.
Les clés du JSON restent identiques (question, feedback, point_fort, a_ameliorer, conseil, resume_final...) : seule la langue du contenu change.
Cette consigne prévaut sur la règle « en français » énoncée plus haut.`,
  mixte: `
Consigne de langue :
Pose tes questions en français mais donne systématiquement ton feedback en anglais pour que le candidat comprenne parfaitement les points d'amélioration.
Cela vaut pour tous les champs de feedback (point_fort, a_ameliorer, conseil) ainsi que pour le résumé final. Les clés du JSON restent identiques.
Le champ "question", lui, reste en français.`,
}

const SYSTEM_PROMPT = (entreprise: string, poste: string, langue: Langue) => `
Tu es un recruteur expérimenté de l'entreprise "${entreprise}" en train de mener un entretien pour le poste de "${poste}" en alternance.

Règles :
- Pose une question à la fois, courte et précise.
- Adapte tes questions au secteur et au poste.
- Après chaque réponse, donne un feedback structuré et note la réponse de 1 à 10.
- Après 6-8 échanges, termine l'entretien avec est_termine: true et un résumé final.
- Sois professionnel mais bienveillant, en français.
- Ne révèle pas que tu es une IA.
- Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après.

Format JSON strict à respecter à chaque réponse :
{
  "question": "ta prochaine question ou message de clôture",
  "feedback": {
    "point_fort": "ce qui était bien dans la réponse",
    "a_ameliorer": "ce qui peut être amélioré",
    "conseil": "un conseil concret et actionnable"
  },
  "score": 7,
  "score_global": null,
  "est_termine": false,
  "resume_final": null
}

Pour la toute première question : mettre feedback: null, score: null.
Quand est_termine vaut true, remplir resume_final :
{
  "score_global": 7.5,
  "scores_axes": {
    "communication": 7,
    "pertinence": 8,
    "structure": 6,
    "vocabulaire": 7,
    "confiance": 8
  },
  "points_forts": ["point 1", "point 2", "point 3"],
  "axes_amelioration": ["axe 1", "axe 2", "axe 3"],
  "conseil_final": "conseil global pour progresser",
  "verdict": "Bien"
}
verdict doit être exactement : "Excellent" (>=8), "Bien" (>=5), ou "À améliorer" (<5).
${CONSIGNES_LANGUE[langue]}
`.trim()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { entreprise, poste, messages, action, session_id, langue } = body as {
      entreprise: string
      poste: string
      messages: Message[]
      action: "start" | "reply"
      session_id?: string
      langue?: Langue
    }

    const langueEntretien: Langue = langue === "en" || langue === "mixte" ? langue : "fr"

    if (!entreprise || !poste) {
      return Response.json({ error: "entreprise et poste requis" }, { status: 400 })
    }

    // Resolve user from Authorization header
    const authHeader = request.headers.get("Authorization")
    const token = authHeader?.replace("Bearer ", "").trim()
    let userId: string | null = null
    if (token) {
      const sb = createServerClient()
      const { data: { user } } = await sb.auth.getUser(token)
      userId = user?.id ?? null
    }

    const anthropicMessages =
      action === "start"
        ? [{ role: "user" as const, content: "Commencez l'entretien." }]
        : messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT(entreprise, poste, langueEntretien),
      messages: anthropicMessages,
    })

    const raw = response.content[0].type === "text" ? response.content[0].text : ""

    let parsed: {
      question: string
      feedback: { point_fort: string; a_ameliorer: string; conseil: string } | null
      score: number | null
      score_global: number | null
      est_termine: boolean
      resume_final: {
        score_global: number
        scores_axes: {
          communication: number
          pertinence: number
          structure: number
          vocabulaire: number
          confiance: number
        }
        points_forts: string[]
        axes_amelioration: string[]
        conseil_final: string
        verdict: string
      } | null
    }

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      parsed = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { question: raw, feedback: null, score: null, score_global: null, est_termine: false, resume_final: null }
    } catch {
      parsed = { question: raw, feedback: null, score: null, score_global: null, est_termine: false, resume_final: null }
    }

    // Supabase session management
    if (userId) {
      const sb = createServerClient()

      if (action === "start") {
        const firstMsg: Message = {
          role: "assistant",
          content: parsed.question,
          timestamp: new Date().toISOString(),
        }
        console.log("[api/entretien] Creating session for user", userId, entreprise, poste)
        const { data, error } = await sb
          .from("entretien_sessions")
          .insert({
            user_id: userId,
            entreprise,
            poste,
            messages: [firstMsg],
            created_at: new Date().toISOString(),
          })
          .select("id")
          .single()
        if (error) console.error("[api/entretien] Insert error:", error)
        else console.log("[api/entretien] Session created, id:", data?.id)

        return Response.json({ ...parsed, session_id: data?.id ?? null })
      }

      if (action === "reply" && session_id) {
        const assistantMsg: Message = {
          role: "assistant",
          content: parsed.question,
          timestamp: new Date().toISOString(),
          score: parsed.score ?? undefined,
          feedback: parsed.feedback ?? undefined,
        }
        const updatedMessages = [...messages, assistantMsg]

        const updatePayload: Record<string, unknown> = { messages: updatedMessages }
        if (parsed.est_termine && parsed.resume_final?.score_global != null) {
          updatePayload.score = parsed.resume_final.score_global
          console.log("[api/entretien] est_termine=true, saving final score:", updatePayload.score)
        }

        const { error: updateError } = await sb
          .from("entretien_sessions")
          .update(updatePayload)
          .eq("id", session_id)
          .eq("user_id", userId)
        if (updateError) console.error("[api/entretien] Update error:", updateError)
        else console.log("[api/entretien] Session updated, session_id:", session_id, "est_termine:", parsed.est_termine)
      }
    } else {
      console.warn("[api/entretien] No userId — skipping Supabase save")
    }

    return Response.json(parsed)
  } catch (err) {
    console.error("[api/entretien]", err)
    return Response.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
