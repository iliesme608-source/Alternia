import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import { getCvAttachment } from "@/lib/cv-attachment"
import { sendMailAsUser } from "@/lib/gmail-send"
import { EMAIL_RE, type MailAttachment } from "@/lib/gmail"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Envoie un email depuis le Gmail de l'étudiant.
 * Entrée : { to, subject, body, fromName?, attachCv? }
 *
 * attachCv (défaut : true) joint le CV de l'étudiant — son fichier téléversé, ou
 * à défaut un .docx reconstruit depuis son CV maître. Sans CV disponible l'email
 * part quand même, et la réponse le signale via `cvAttached: false`.
 *
 * L'envoi lui-même (jetons, révocation, quota) vit dans lib/gmail-send, partagé
 * avec l'agent de démarchage nocturne.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { to, subject, body: message, fromName, attachCv } = (body ?? {}) as {
      to?: unknown
      subject?: unknown
      body?: unknown
      fromName?: unknown
      attachCv?: unknown
    }

    if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) {
      return NextResponse.json({ error: "Adresse e-mail du destinataire invalide." }, { status: 400 })
    }
    if (typeof subject !== "string" || !subject.trim()) {
      return NextResponse.json({ error: "Objet manquant." }, { status: 400 })
    }
    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message manquant." }, { status: 400 })
    }

    // Pièce jointe CV — activée par défaut, jamais bloquante.
    const attachments: MailAttachment[] = []
    if (attachCv !== false) {
      const { data: profile } = await createServerClient()
        .from("profiles")
        .select("prenom, nom")
        .eq("id", userId)
        .maybeSingle()
      const displayName = [profile?.prenom, profile?.nom].filter(Boolean).join(" ")
      const cv = await getCvAttachment(userId, displayName)
      if (cv) {
        attachments.push({
          filename: cv.filename,
          mimeType: cv.mimeType,
          contentB64: cv.contentB64,
        })
      }
    }

    const result = await sendMailAsUser(userId, {
      to,
      subject,
      body: message,
      fromName: typeof fromName === "string" ? fromName : undefined,
      attachments,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.needsConnection ? { needsConnection: true } : {}) },
        { status: result.status ?? 502 },
      )
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      from: result.from,
      cvAttached: attachments.length > 0,
      cvFileName: attachments[0]?.filename ?? null,
    })
  } catch (err) {
    console.error("[gmail/send]", err)
    return NextResponse.json({ error: "Erreur serveur pendant l'envoi." }, { status: 500 })
  }
}
