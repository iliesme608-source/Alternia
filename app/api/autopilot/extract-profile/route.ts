import { NextRequest, NextResponse } from "next/server"
import { anthropic, MODEL, textOf } from "@/lib/anthropic"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId, parseJsonResponse } from "@/lib/autopilot"
import type { AutopilotObjective, VerifiedExperience, EducationEntry } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 45

// Structure attendue du profil maître extrait par l'IA.
interface ExtractedProfile {
  verified_experiences: VerifiedExperience[]
  verified_skills: string[]
  education: EducationEntry[]
  tools: string[]
  target_roles: string[]
}

const EXTRACT_SYSTEM = `Tu es un assistant qui structure le profil d'un étudiant à partir du texte brut de son CV.

RÈGLE ABSOLUE : tu n'as PAS le droit d'inventer, deviner ou compléter des informations absentes du CV. Tu ne fais QU'extraire et reformuler ce qui est explicitement présent. Si une information n'existe pas, laisse le champ vide (tableau vide).

Tu renvoies UNIQUEMENT un objet JSON valide (aucun texte autour) au format :
{
  "verified_experiences": [
    { "poste": "", "entreprise": "", "periode": "", "description": "" }
  ],
  "verified_skills": ["compétence1", "compétence2"],
  "education": [
    { "diplome": "", "etablissement": "", "annee": "" }
  ],
  "tools": ["outil1", "outil2"],
  "target_roles": ["poste visé si mentionné"]
}

- verified_experiences : uniquement les expériences réellement décrites (stages, jobs, projets).
- verified_skills : compétences explicitement citées.
- education : formations/diplômes listés.
- tools : logiciels, langages, frameworks, outils réellement mentionnés.
- target_roles : uniquement si un objectif/poste visé apparaît dans le CV, sinon [].`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cvText, objective } = body as {
      cvText?: string
      objective?: Partial<AutopilotObjective>
    }

    if (!cvText || cvText.trim().length < 20) {
      return NextResponse.json(
        { error: "cvText manquant ou trop court (extraire le CV via /api/cv-extract d'abord)." },
        { status: 400 }
      )
    }

    // ── Auth requise (avant l'appel Claude, pour ne pas consommer l'API sans compte) ──
    const userId = await resolveUserId(request)
    const isDev = process.env.NODE_ENV === "development"
    if (!userId && !isDev) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    // ── Extraction structurée via Claude (anti-invention) ──────────────────────
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: EXTRACT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Voici le texte brut du CV à structurer :\n\n"""\n${cvText.slice(0, 12000)}\n"""`,
        },
      ],
    })

    const raw = textOf(response)
    const extracted = parseJsonResponse<ExtractedProfile>(raw)

    if (!extracted) {
      console.error("[autopilot/extract-profile] JSON non parsable:", raw.slice(0, 300))
      return NextResponse.json({ error: "Extraction du profil impossible. Réessaie." }, { status: 502 })
    }

    // Normalisation défensive (l'IA peut omettre des clés).
    const profile = {
      cv_original_text: cvText,
      verified_experiences: Array.isArray(extracted.verified_experiences) ? extracted.verified_experiences : [],
      verified_skills: Array.isArray(extracted.verified_skills) ? extracted.verified_skills : [],
      education: Array.isArray(extracted.education) ? extracted.education : [],
      tools: Array.isArray(extracted.tools) ? extracted.tools : [],
      target_roles: Array.isArray(extracted.target_roles) ? extracted.target_roles : [],
      constraints: objective ?? {},
    }

    // ── Persistance Supabase (si authentifié) — 1 profil maître par user ───────
    let profileId: string | null = null

    if (userId) {
      const sb = createServerClient()
      const { data: existing } = await sb
        .from("candidate_master_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle()

      if (existing?.id) {
        const { data, error } = await sb
          .from("candidate_master_profiles")
          .update(profile)
          .eq("id", existing.id)
          .select("id")
          .single()
        if (error) console.error("[autopilot/extract-profile] update error:", error)
        profileId = data?.id ?? existing.id
      } else {
        const { data, error } = await sb
          .from("candidate_master_profiles")
          .insert({ user_id: userId, ...profile })
          .select("id")
          .single()
        if (error) console.error("[autopilot/extract-profile] insert error:", error)
        profileId = data?.id ?? null
      }
    } else {
      console.warn("[autopilot/extract-profile] pas de userId — profil non persisté")
    }

    return NextResponse.json({ id: profileId, profile })
  } catch (err) {
    console.error("[autopilot/extract-profile]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
