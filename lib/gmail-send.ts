import { google } from "googleapis"
import {
  buildRawMessage,
  deleteGmailToken,
  getGmailToken,
  gmailEnv,
  isInvalidGrant,
  oauthClient,
  type MailAttachment,
} from "@/lib/gmail"

/**
 * Envoi d'un email depuis le Gmail de l'étudiant, côté serveur.
 *
 * Implémentation unique, partagée par /api/gmail/send (envoi déclenché par
 * l'étudiant) et par l'agent de démarchage nocturne — pour que la gestion des
 * jetons révoqués et des quotas soit strictement la même dans les deux cas.
 */

export const NOT_CONNECTED =
  "Ton Gmail n'est pas connecté. Va dans ton profil et clique sur « Connecter mon Gmail » pour envoyer depuis ta propre adresse."

const REVOKED =
  "Ton autorisation Gmail a expiré ou a été révoquée. Reconnecte ton Gmail depuis ton profil."

export interface SendMailInput {
  to: string
  subject: string
  body: string
  fromName?: string
  attachments?: MailAttachment[]
}

export interface SendMailResult {
  ok: boolean
  /** Identifiant du message Gmail en cas de succès. */
  id?: string
  /** Adresse réellement utilisée comme expéditeur. */
  from?: string
  error?: string
  /** true quand l'étudiant doit (re)connecter son Gmail. */
  needsConnection?: boolean
  /** Code HTTP à renvoyer si l'appelant est une route. */
  status?: number
}

/** Envoie un message depuis le compte Gmail relié à `userId`. */
export async function sendMailAsUser(
  userId: string,
  input: SendMailInput,
): Promise<SendMailResult> {
  const env = gmailEnv()
  if (!env) {
    return {
      ok: false,
      error: "Envoi Gmail indisponible : configuration OAuth Google manquante.",
      status: 500,
    }
  }

  const token = await getGmailToken(userId)
  if (!token) {
    return { ok: false, error: NOT_CONNECTED, needsConnection: true, status: 403 }
  }

  const client = oauthClient(env)
  client.setCredentials({ refresh_token: token.refresh_token })

  // Rafraîchit explicitement : c'est ici qu'un token révoqué se manifeste.
  try {
    await client.getAccessToken()
  } catch (err) {
    if (isInvalidGrant(err)) {
      await deleteGmailToken(userId)
      return { ok: false, error: REVOKED, needsConnection: true, status: 403 }
    }
    console.error("[gmail-send] rafraîchissement du jeton:", err)
    return { ok: false, error: "Gmail a refusé la connexion.", status: 502 }
  }

  const raw = buildRawMessage({
    to: input.to.trim(),
    from: token.email_address,
    fromName: input.fromName,
    subject: input.subject.trim(),
    body: input.body,
    attachments: input.attachments,
  })

  try {
    const { data } = await google.gmail({ version: "v1", auth: client }).users.messages.send({
      userId: "me",
      requestBody: { raw },
    })
    return { ok: true, id: data.id ?? undefined, from: token.email_address }
  } catch (err) {
    if (isInvalidGrant(err)) {
      await deleteGmailToken(userId)
      return { ok: false, error: REVOKED, needsConnection: true, status: 403 }
    }
    console.error("[gmail-send] envoi:", err)
    const detail = err instanceof Error ? err.message : ""
    return {
      ok: false,
      error: detail.includes("quota") ? "Quota Gmail atteint. Réessaie demain." : "Gmail a refusé l'envoi.",
      status: 502,
    }
  }
}
