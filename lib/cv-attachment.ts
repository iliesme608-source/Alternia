import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx"
import { createServerClient } from "@/lib/supabase"
import type { MailAttachment } from "@/lib/gmail"

/**
 * Le CV joint à chaque candidature.
 *
 * Deux sources, dans cet ordre :
 *   1. Le fichier téléversé par l'étudiant (candidate_cv_files) — c'est SON CV,
 *      mise en page comprise. Toujours préféré.
 *   2. À défaut, un .docx propre généré à partir du texte du CV maître
 *      (candidate_master_profiles.cv_original_text). Aucun contenu n'est
 *      inventé : c'est exactement le texte que l'étudiant a fourni, remis en
 *      forme.
 *
 * Si aucune des deux n'existe, on renvoie null — la candidature part sans pièce
 * jointe plutôt qu'avec un document vide.
 */

export const MAX_CV_BYTES = 4 * 1024 * 1024 // 4 Mo

/** Types de fichier acceptés pour un CV. */
export const ALLOWED_CV_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
}

export interface CvAttachmentInfo extends MailAttachment {
  /** 'fichier' = CV téléversé, 'genere' = .docx reconstruit depuis le texte. */
  origin: "fichier" | "genere"
  sizeBytes: number
}

/** La migration supabase/autopilot_contacts_agent.sql n'a pas encore été jouée. */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  )
}

// ── Génération .docx depuis le texte du CV maître ─────────────────────────────

/** Une ligne tout en capitales et courte est traitée comme un titre de section. */
function isHeading(line: string): boolean {
  return (
    /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ0-9\s\-/&']+$/.test(line) && line.length > 3 && line.length < 60
  )
}

function buildDocx(text: string, displayName: string): Document {
  const children: Paragraph[] = []

  if (displayName) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: displayName, bold: true, size: 30 })],
        spacing: { after: 160 },
      }),
    )
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()

    if (!line) {
      children.push(new Paragraph({ text: "" }))
    } else if (isHeading(line)) {
      children.push(
        new Paragraph({
          text: line,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 80 },
        }),
      )
    } else if (/^[•\-*]\s/.test(line)) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line.replace(/^[•\-*]\s*/, ""), size: 22 })],
          bullet: { level: 0 },
          spacing: { after: 40 },
        }),
      )
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })],
          alignment: AlignmentType.LEFT,
          spacing: { after: 60 },
        }),
      )
    }
  }

  return new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children,
      },
    ],
  })
}

/** Nom de fichier lisible : « CV-Ilies-Mehdi.docx ». */
function cvFileName(displayName: string, ext: string): string {
  const slug = (displayName ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
  return slug ? `CV-${slug}.${ext}` : `CV.${ext}`
}

// ── Résolution ────────────────────────────────────────────────────────────────

/**
 * CV à joindre pour cet étudiant, ou null s'il n'en a aucun.
 * `displayName` sert uniquement à nommer le fichier généré.
 */
export async function getCvAttachment(
  userId: string,
  displayName = "",
): Promise<CvAttachmentInfo | null> {
  const sb = createServerClient()

  // 1. Fichier téléversé — la source à privilégier.
  {
    const { data, error } = await sb
      .from("candidate_cv_files")
      .select("file_name, mime_type, size_bytes, content_b64")
      .eq("user_id", userId)
      .maybeSingle()

    if (error && !isMissingTable(error)) {
      console.error("[cv-attachment] lecture candidate_cv_files:", error)
    }
    if (data?.content_b64) {
      return {
        filename: (data.file_name as string) || cvFileName(displayName, "pdf"),
        mimeType: (data.mime_type as string) || "application/pdf",
        contentB64: data.content_b64 as string,
        sizeBytes: (data.size_bytes as number) ?? 0,
        origin: "fichier",
      }
    }
  }

  // 2. Repli : .docx reconstruit depuis le texte du CV maître.
  const { data: profile, error: profileErr } = await sb
    .from("candidate_master_profiles")
    .select("cv_original_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (profileErr) console.error("[cv-attachment] lecture candidate_master_profiles:", profileErr)

  const text = ((profile?.cv_original_text as string | null) ?? "").trim()
  if (text.length < 40) return null // trop court pour être un CV exploitable

  try {
    const buffer = await Packer.toBuffer(buildDocx(text, displayName))
    return {
      filename: cvFileName(displayName, "docx"),
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      contentB64: Buffer.from(buffer).toString("base64"),
      sizeBytes: buffer.byteLength,
      origin: "genere",
    }
  } catch (err) {
    console.error("[cv-attachment] génération docx:", err)
    return null
  }
}
