import { NextRequest } from "next/server"
import { anthropic, MODEL, textOf } from "@/lib/anthropic"
import { createServerClient } from "@/lib/supabase"

const SYSTEM_PROMPT = `
Tu es un expert en recrutement et en optimisation de CV pour les systèmes ATS (Applicant Tracking System).

Ta mission : adapter le CV d'un étudiant à une fiche de poste spécifique.

Tu dois :
1. Identifier les mots-clés importants de la fiche de poste (compétences, technologies, diplômes, verbes d'action).
2. Intégrer naturellement ces mots-clés dans le CV sans le falsifier.
3. Reformuler les expériences pour les aligner avec le vocabulaire de la fiche.
4. Calculer un score ATS AVANT optimisation (0-100) et un score APRÈS (0-100).
5. Identifier les mots-clés de la fiche qui ne peuvent PAS être ajoutés car absents du parcours.
6. Fournir 3 suggestions concrètes et actionnables pour améliorer encore le CV.
7. Rédiger une phrase courte résumant les modifications effectuées.

Format de réponse JSON strict (aucun texte autour) :
{
  "cv_adapte": "le CV complet optimisé (texte brut formaté)",
  "score_ats_avant": 42,
  "score_ats": 78,
  "mots_cles_ajoutes": ["mot1", "mot2", "mot3"],
  "mots_cles_manquants": ["mot4", "mot5"],
  "suggestions": [
    "Suggestion concrète 1 pour améliorer encore le CV",
    "Suggestion concrète 2",
    "Suggestion concrète 3"
  ],
  "resume_modifications": "Une phrase courte décrivant les modifications effectuées."
}
`.trim()

type CVResult = {
  cv_adapte: string
  score_ats: number
  score_ats_avant?: number
  mots_cles_ajoutes: string[]
  mots_cles_manquants: string[]
  suggestions?: string[]
  resume_modifications?: string
}

function parseClaudeResponse(raw: string): CVResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
  } catch { /* fall through */ }
  return { cv_adapte: raw, score_ats: 50, mots_cles_ajoutes: [], mots_cles_manquants: [] }
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "").trim()
  if (!token) return null
  const { data: { user } } = await createServerClient().auth.getUser(token)
  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? ""
    const isFormData = contentType.includes("multipart/form-data")

    let cv_original = ""
    let fiche_poste = ""
    let pdfBase64: string | null = null

    if (isFormData) {
      const formData = await request.formData()
      const pdfFile = formData.get("pdf") as File | null
      fiche_poste = (formData.get("fiche_poste") as string) ?? ""
      if (!pdfFile || !fiche_poste) {
        return Response.json({ error: "pdf et fiche_poste requis" }, { status: 400 })
      }
      const bytes = await pdfFile.arrayBuffer()
      pdfBase64 = Buffer.from(bytes).toString("base64")
      cv_original = "[PDF uploadé]"
    } else {
      const body = await request.json()
      cv_original = body.cv_original ?? ""
      fiche_poste = body.fiche_poste ?? ""
      if (!cv_original || !fiche_poste) {
        return Response.json({ error: "cv_original et fiche_poste requis" }, { status: 400 })
      }
    }

    const userId = await resolveUserId(request)

    // Build user message: PDF document block or plain text
    type MessageContent = Parameters<typeof anthropic.messages.create>[0]["messages"][0]["content"]
    const userContent: MessageContent = pdfBase64
      ? [
          {
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: pdfBase64,
            },
          },
          {
            type: "text" as const,
            text: `Ce document est un CV. Adapte-le à la fiche de poste suivante.\n\nFICHE DE POSTE:\n${fiche_poste}`,
          },
        ]
      : `CV ORIGINAL:\n${cv_original}\n\n---\n\nFICHE DE POSTE:\n${fiche_poste}`

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    })

    const raw = textOf(response)
    const parsed = parseClaudeResponse(raw)
    if (!parsed.mots_cles_manquants) parsed.mots_cles_manquants = []

    let savedId = crypto.randomUUID()
    if (userId) {
      const sb = createServerClient()
      console.log("[api/cv] Saving cv_analyse for user", userId)
      const { data, error } = await sb
        .from("cv_analyses")
        .insert({
          user_id: userId,
          poste_vise: fiche_poste,
          score_ats: parsed.score_ats,
          mots_cles_ajoutes: parsed.mots_cles_ajoutes.length,
          mots_cles_manquants: parsed.mots_cles_manquants.length,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single()
      if (error) console.error("[api/cv] Supabase insert error:", error)
      else console.log("[api/cv] Row saved, id:", data?.id)
      if (data?.id) savedId = data.id
    } else {
      console.warn("[api/cv] No userId resolved — skipping Supabase save")
    }

    return Response.json({
      ...parsed,
      cv_original,
      fiche_poste,
      id: savedId,
      user_id: userId ?? "",
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[api/cv]", err)
    return Response.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
