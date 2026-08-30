import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { resolveUserId } from "@/lib/autopilot"
import {
  EMAIL_RE,
  buildRawMessage,
  deleteGmailToken,
  getGmailToken,
  gmailEnv,
  isInvalidGrant,
  oauthClient,
} from "@/lib/gmail"

export const runtime = "nodejs"
export const maxDuration = 30

/** Message affiché quand aucun Gmail n'est relié — l'UI l'affiche tel quel. */
const NOT_CONNECTED =
  "Ton Gmail n'est pas connecté. Va dans ton profil et clique sur « Connecter mon Gmail » pour envoyer depuis ta propre adresse."

/**
 * Envoie un email depuis le Gmail de l'étudiant.
 * Entrée : { to, subject, body, fromName? }
 */
export async function POST(request: NextRequest) {
  try {
    const env = gmailEnv()
    if (!env) {
      return NextResponse.json(
        { error: "Envoi Gmail indisponible : configuration OAuth Google manquante." },
        { status: 500 },
      )
    }

    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { to, subject, body: message, fromName } = (body ?? {}) as {
      to?: unknown
      subject?: unknown
      body?: unknown
      fromName?: unknown
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

    const token = await getGmailToken(userId)
    if (!token) {
      return NextResponse.json({ error: NOT_CONNECTED, needsConnection: true }, { status: 403 })
    }

    const client = oauthClient(env)
    client.setCredentials({ refresh_token: token.refresh_token })

    // Rafraîchit explicitement : c'est ici qu'un token révoqué se manifeste.
    try {
      await client.getAccessToken()
    } catch (err) {
      if (isInvalidGrant(err)) {
        await deleteGmailToken(userId)
        return NextResponse.json(
          {
            error: "Ton autorisation Gmail a expiré ou a été révoquée. Reconnecte ton Gmail depuis ton profil.",
            needsConnection: true,
          },
          { status: 403 },
        )
      }
      throw err
    }

    const raw = buildRawMessage({
      to: to.trim(),
      from: token.email_address,
      fromName: typeof fromName === "string" ? fromName : undefined,
      subject: subject.trim(),
      body: message,
    })

    try {
      const { data } = await google.gmail({ version: "v1", auth: client }).users.messages.send({
        userId: "me",
        requestBody: { raw },
      })
      return NextResponse.json({ success: true, id: data.id, from: token.email_address })
    } catch (err) {
      if (isInvalidGrant(err)) {
        await deleteGmailToken(userId)
        return NextResponse.json(
          {
            error: "Ton autorisation Gmail a expiré ou a été révoquée. Reconnecte ton Gmail depuis ton profil.",
            needsConnection: true,
          },
          { status: 403 },
        )
      }
      console.error("[gmail/send] envoi:", err)
      const detail = err instanceof Error ? err.message : ""
      return NextResponse.json(
        { error: detail.includes("quota") ? "Quota Gmail atteint. Réessaie demain." : "Gmail a refusé l'envoi." },
        { status: 502 },
      )
    }
  } catch (err) {
    console.error("[gmail/send]", err)
    return NextResponse.json({ error: "Erreur serveur pendant l'envoi." }, { status: 500 })
  }
}
