import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import {
  ALLOWED_CV_MIME,
  MAX_CV_BYTES,
  getCvAttachment,
  isMissingTable,
} from "@/lib/cv-attachment"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Le CV de l'étudiant, celui qui part en pièce jointe de chaque candidature.
 *
 * GET    → état du CV actuellement joint (fichier téléversé ou .docx généré).
 * POST   → téléverse un PDF / DOCX (multipart/form-data, champ « file »).
 * DELETE → retire le fichier téléversé (le repli .docx reste actif).
 */

const MIGRATION_HINT =
  "Table candidate_cv_files absente. Exécute supabase/autopilot_contacts_agent.sql dans Supabase."

export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

  const sb = createServerClient()
  const { data: profile } = await sb
    .from("profiles")
    .select("prenom, nom")
    .eq("id", userId)
    .maybeSingle()

  const displayName = [profile?.prenom, profile?.nom].filter(Boolean).join(" ")
  const cv = await getCvAttachment(userId, displayName)

  return NextResponse.json({
    hasCv: Boolean(cv),
    // Le contenu base64 n'est jamais renvoyé au navigateur : seul l'état compte.
    fileName: cv?.filename ?? null,
    mimeType: cv?.mimeType ?? null,
    sizeBytes: cv?.sizeBytes ?? 0,
    origin: cv?.origin ?? null,
  })
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request)
    if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 })
    }

    if (file.size > MAX_CV_BYTES) {
      return NextResponse.json(
        { error: `Fichier trop lourd (${Math.round(file.size / 1024)} Ko). Maximum 4 Mo.` },
        { status: 400 },
      )
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Fichier vide." }, { status: 400 })
    }

    // Certains navigateurs envoient un type vide : on retombe sur l'extension.
    const ext = (file.name.split(".").pop() ?? "").toLowerCase()
    const mimeFromExt = Object.entries(ALLOWED_CV_MIME).find(([, e]) => e === ext)?.[0]
    const mimeType = ALLOWED_CV_MIME[file.type] ? file.type : mimeFromExt

    if (!mimeType) {
      return NextResponse.json(
        { error: "Format non accepté. Envoie ton CV en PDF ou DOCX." },
        { status: 400 },
      )
    }

    const contentB64 = Buffer.from(await file.arrayBuffer()).toString("base64")

    const { error } = await createServerClient()
      .from("candidate_cv_files")
      .upsert(
        {
          user_id: userId,
          file_name: file.name,
          mime_type: mimeType,
          size_bytes: file.size,
          content_b64: contentB64,
        },
        { onConflict: "user_id" },
      )

    if (error) {
      console.error("[api/cv-file] upsert:", error)
      return NextResponse.json(
        { error: isMissingTable(error) ? MIGRATION_HINT : "Impossible d'enregistrer ton CV." },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      sizeBytes: file.size,
      origin: "fichier",
    })
  } catch (err) {
    console.error("[api/cv-file]", err)
    return NextResponse.json({ error: "Erreur serveur pendant l'envoi du CV." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

  const { error } = await createServerClient()
    .from("candidate_cv_files")
    .delete()
    .eq("user_id", userId)

  if (error && !isMissingTable(error)) {
    console.error("[api/cv-file] delete:", error)
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
