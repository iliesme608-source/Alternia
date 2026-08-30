import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import type { OAuth2Client } from "google-auth-library"
import { createServerClient } from "@/lib/supabase"
import { gmailEnv, oauthClient, verifyState } from "@/lib/gmail"

export const runtime = "nodejs"
export const maxDuration = 30

/** Redirige vers /profil avec un code d'erreur lisible par la page. */
function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/profil", request.nextUrl.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

/**
 * Adresse du compte Google autorisé.
 *
 * On tente d'abord gmail.users.getProfile. Il échoue si le jeton ne porte que
 * gmail.send (Google réserve getProfile aux scopes de lecture) : on retombe alors
 * sur la claim `email` de l'id_token OpenID, vérifiée avant usage.
 */
async function resolveEmailAddress(
  client: OAuth2Client,
  idToken: string | null,
  clientId: string,
): Promise<string | null> {
  try {
    const { data } = await google.gmail({ version: "v1", auth: client }).users.getProfile({ userId: "me" })
    if (data.emailAddress) return data.emailAddress
  } catch {
    // Scope insuffisant : comportement attendu avec gmail.send seul.
  }

  if (!idToken) return null
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId })
    return ticket.getPayload()?.email ?? null
  } catch (err) {
    console.error("[gmail/callback] verifyIdToken:", err)
    return null
  }
}

/**
 * Retour de Google : échange le code contre les tokens, lit l'adresse Gmail
 * autorisée, enregistre le refresh_token, puis renvoie l'étudiant sur son profil.
 */
export async function GET(request: NextRequest) {
  const env = gmailEnv()
  if (!env) return back(request, { gmail: "error", reason: "config" })

  const params = request.nextUrl.searchParams

  // L'étudiant a refusé l'autorisation sur l'écran Google.
  if (params.get("error")) return back(request, { gmail: "error", reason: "denied" })

  const code = params.get("code")
  if (!code) return back(request, { gmail: "error", reason: "missing_code" })

  const userId = verifyState(params.get("state"), env)
  if (!userId) return back(request, { gmail: "error", reason: "state" })

  try {
    const client = oauthClient(env)
    const { tokens } = await client.getToken(code)

    // Sans refresh_token, impossible d'envoyer plus tard : on refuse la connexion
    // plutôt que d'enregistrer une liaison qui cassera au premier envoi.
    if (!tokens.refresh_token) return back(request, { gmail: "error", reason: "no_refresh_token" })

    client.setCredentials(tokens)

    const emailAddress = await resolveEmailAddress(client, tokens.id_token ?? null, env.clientId)
    if (!emailAddress) return back(request, { gmail: "error", reason: "no_profile" })

    const { error } = await createServerClient().from("gmail_tokens").upsert(
      {
        user_id: userId,
        refresh_token: tokens.refresh_token,
        email_address: emailAddress,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )

    if (error) {
      console.error("[gmail/callback] upsert gmail_tokens:", error)
      return back(request, { gmail: "error", reason: "storage" })
    }

    return back(request, { gmail: "connected" })
  } catch (err) {
    console.error("[gmail/callback]", err)
    return back(request, { gmail: "error", reason: "exchange" })
  }
}
