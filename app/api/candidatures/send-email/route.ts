import { NextResponse } from "next/server"
import { Resend } from "resend"

export const runtime = "nodejs"
export const maxDuration = 30

// Adresse expéditrice : le domaine doit être vérifié dans Resend. Tant que
// alternia.fr ne l'est pas, poser RESEND_FROM=onboarding@resend.dev permet
// d'envoyer (uniquement vers l'adresse du compte Resend).
const FROM_ADDRESS = process.env.RESEND_FROM || "candidatures@alternia.fr"

/** Nettoie le nom affiché : pas de guillemets ni de retours ligne dans un en-tête From. */
function sanitizeName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/["\r\n<>]/g, "").trim() : ""
  return s || "Candidature Alternia"
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Envoi indisponible : RESEND_API_KEY manquante." }, { status: 500 })
    }

    const { to, subject, body, fromName } = await req.json().catch(() => ({}))

    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 })
    }
    if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) {
      return NextResponse.json({ error: "Adresse e-mail du destinataire invalide." }, { status: 400 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data, error } = await resend.emails.send({
      from: `${sanitizeName(fromName)} <${FROM_ADDRESS}>`,
      to: [to.trim()],
      subject: String(subject),
      text: String(body),
    })

    if (error) {
      console.error("[candidatures/send-email] resend:", error)
      return NextResponse.json({ error: error.message ?? "Envoi refusé par Resend." }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (err) {
    console.error("[candidatures/send-email]", err)
    return NextResponse.json({ error: "Erreur serveur pendant l'envoi." }, { status: 500 })
  }
}
