import { NextRequest } from "next/server"
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx"

export const runtime = "nodejs"
export const maxDuration = 30

function buildDocx(text: string): Document {
  const lines = text.split(/\r?\n/)
  const children: Paragraph[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Blank line → spacer paragraph
    if (!trimmed) {
      children.push(new Paragraph({ text: "" }))
      continue
    }

    // Heuristic: ALL-CAPS lines or lines ending with ":" → section heading
    const isHeading =
      /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ\s\-\/]+$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 60

    if (isHeading) {
      children.push(
        new Paragraph({
          text: trimmed,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 80 },
        })
      )
    } else if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/^[•\-*]\s*/, ""), size: 22 })],
          bullet: { level: 0 },
          spacing: { after: 40 },
        })
      )
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, size: 22 })],
          alignment: AlignmentType.LEFT,
          spacing: { after: 60 },
        })
      )
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text } = body as { text: string }

    if (!text?.trim()) {
      return Response.json({ error: "text requis" }, { status: 400 })
    }

    const doc = buildDocx(text)
    const buffer = await Packer.toBuffer(doc)

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="cv-optimise.docx"',
        "Content-Length": String(buffer.byteLength),
      },
    })
  } catch (err) {
    console.error("[api/cv-download]", err)
    return Response.json({ error: "Erreur génération DOCX" }, { status: 500 })
  }
}
