import { createHmac, timingSafeEqual } from "crypto"
import { google } from "googleapis"
import type { OAuth2Client } from "google-auth-library"
import { createServerClient } from "@/lib/supabase"

// Seul scope Gmail demandé : envoyer un message. Aucune lecture de la boîte de
// réception n'est possible avec lui — c'est la promesse faite dans /profil.
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

/**
 * Scopes demandés à Google. `openid` + `email` ne donnent accès à AUCUN message :
 * ils servent uniquement à connaître l'adresse du compte autorisé, pour l'afficher
 * et la poser en en-tête From. Ils sont nécessaires car gmail.users.getProfile
 * n'est pas autorisé par le seul scope gmail.send (Google exige readonly, metadata,
 * modify ou compose) — sans eux, impossible de savoir quelle adresse a été reliée.
 */
export const GMAIL_SCOPES = [GMAIL_SEND_SCOPE, "openid", "email"]

/** Quota d'envoi Gmail pour un compte gratuit — affiché dans la modal d'envoi groupé. */
export const GMAIL_DAILY_QUOTA = 500

/** Délai imposé entre deux envois groupés (ms) — évite le throttling Gmail. */
export const GMAIL_SEND_DELAY_MS = 3000

export interface GmailEnv {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Configuration OAuth Google. Renvoie null si une variable manque — les routes
 * répondent alors une erreur explicite plutôt que de planter au démarrage.
 * GOOGLE_REDIRECT_URI est optionnelle : on la déduit de NEXT_PUBLIC_APP_URL.
 */
export function gmailEnv(): GmailEnv | null {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/gmail/callback`
      : "")

  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri }
}

export function oauthClient(env: GmailEnv): OAuth2Client {
  return new google.auth.OAuth2(env.clientId, env.clientSecret, env.redirectUri)
}

// ── State signé ───────────────────────────────────────────────────────────────
// Le paramètre `state` transporte l'user_id Supabase jusqu'au callback. Il est
// signé (HMAC) : sans signature, n'importe qui pourrait rappeler /callback avec
// l'user_id d'un autre étudiant et rattacher SON Gmail au compte de la victime.

const STATE_TTL_MS = 10 * 60 * 1000

function b64url(buf: Buffer): string {
  return buf.toString("base64url")
}

function stateSecret(env: GmailEnv): string {
  return env.clientSecret
}

export function signState(userId: string, env: GmailEnv): string {
  const payload = b64url(Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + STATE_TTL_MS })))
  const sig = b64url(createHmac("sha256", stateSecret(env)).update(payload).digest())
  return `${payload}.${sig}`
}

/** Renvoie l'user_id si la signature est valide et le state non expiré, sinon null. */
export function verifyState(state: string | null, env: GmailEnv): string | null {
  if (!state) return null
  const [payload, sig] = state.split(".")
  if (!payload || !sig) return null

  const expected = b64url(createHmac("sha256", stateSecret(env)).update(payload).digest())
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: unknown
      exp?: unknown
    }
    if (typeof uid !== "string" || !uid) return null
    if (typeof exp !== "number" || Date.now() > exp) return null
    return uid
  } catch {
    return null
  }
}

// ── Message RFC 2822 ──────────────────────────────────────────────────────────

const ASCII_PRINTABLE = /^[\x20-\x7E]*$/

/** Encode un en-tête non-ASCII en encoded-word RFC 2047 (accents des objets FR). */
function encodeHeaderValue(raw: string): string {
  const clean = raw.replace(/[\r\n]+/g, " ").trim()
  if (ASCII_PRINTABLE.test(clean)) return clean
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`
}

/** `"Prénom" <adresse>` — ou l'adresse seule si aucun nom d'affichage. */
function formatFrom(address: string, displayName?: string): string {
  const name = (displayName ?? "").replace(/["\r\n<>]/g, "").trim()
  if (!name) return address
  const encoded = ASCII_PRINTABLE.test(name) ? `"${name}"` : encodeHeaderValue(name)
  return `${encoded} <${address}>`
}

/** Pièce jointe d'un email — contenu déjà encodé en base64. */
export interface MailAttachment {
  filename: string
  mimeType: string
  contentB64: string
}

export interface RawMessageInput {
  to: string
  from: string
  fromName?: string
  subject: string
  body: string
  /** Pièces jointes (CV…). Déclenche un message multipart/mixed. */
  attachments?: MailAttachment[]
}

/** Découpe une chaîne base64 en lignes de 76 caractères (exigence MIME). */
function wrapB64(b64: string): string {
  return b64.replace(/\s/g, "").match(/.{1,76}/g)?.join("\r\n") ?? ""
}

/**
 * Nom de fichier sûr pour un en-tête MIME : ASCII, sans guillemet ni saut de
 * ligne. Un nom accentué mal encodé casse la pièce jointe chez certains clients,
 * on translittère donc plutôt que de risquer un fichier illisible.
 */
function safeFilename(raw: string, fallback = "piece-jointe"): string {
  const ascii = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  return ascii || fallback
}

/**
 * Construit le message RFC 2822 encodé en base64url attendu par
 * gmail.users.messages.send. Le corps passe en base64 (Content-Transfer-Encoding)
 * pour transporter l'UTF-8 sans se soucier des lignes longues.
 *
 * Avec des pièces jointes, le message devient multipart/mixed : le texte reste
 * la première partie, chaque fichier suit en attachment.
 */
export function buildRawMessage({
  to,
  from,
  fromName,
  subject,
  body,
  attachments,
}: RawMessageInput): string {
  const textB64 = wrapB64(Buffer.from(body, "utf8").toString("base64"))
  const files = (attachments ?? []).filter((a) => a?.contentB64)

  const headers = [
    `From: ${formatFrom(from, fromName)}`,
    `To: ${to.replace(/[\r\n]/g, "")}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
  ]

  if (files.length === 0) {
    headers.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64")
    return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${textB64}`, "utf8").toString("base64url")
  }

  // Frontière aléatoire : elle ne doit jamais apparaître dans le contenu.
  const boundary = `alternia_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

  const parts: string[] = [
    [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      textB64,
    ].join("\r\n"),
  ]

  for (const file of files) {
    const name = safeFilename(file.filename)
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${file.mimeType || "application/octet-stream"}; name="${name}"`,
        `Content-Disposition: attachment; filename="${name}"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrapB64(file.contentB64),
      ].join("\r\n"),
    )
  }

  parts.push(`--${boundary}--`)

  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n`, "utf8").toString(
    "base64url",
  )
}

// ── Table gmail_tokens ────────────────────────────────────────────────────────

export interface GmailToken {
  refresh_token: string
  email_address: string
}

/** Refresh token de l'étudiant, ou null s'il n'a jamais connecté son Gmail. */
export async function getGmailToken(userId: string): Promise<GmailToken | null> {
  const { data, error } = await createServerClient()
    .from("gmail_tokens")
    .select("refresh_token, email_address")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[gmail] lecture gmail_tokens:", error)
    return null
  }
  if (!data?.refresh_token) return null
  return { refresh_token: data.refresh_token as string, email_address: data.email_address as string }
}

/** Supprime le token — appelé quand Google le déclare périmé (invalid_grant). */
export async function deleteGmailToken(userId: string): Promise<void> {
  const { error } = await createServerClient().from("gmail_tokens").delete().eq("user_id", userId)
  if (error) console.error("[gmail] suppression gmail_tokens:", error)
}

/**
 * Détecte un refresh_token révoqué / expiré. googleapis remonte l'erreur sous
 * plusieurs formes selon l'appel — on inspecte le corps de la réponse et le message.
 */
export function isInvalidGrant(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { message?: unknown; response?: { data?: { error?: unknown } } }
  if (e.response?.data?.error === "invalid_grant") return true
  return typeof e.message === "string" && e.message.includes("invalid_grant")
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
