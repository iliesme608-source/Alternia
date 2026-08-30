import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { GMAIL_SCOPES, gmailEnv, oauthClient, signState } from "@/lib/gmail"

export const runtime = "nodejs"

/**
 * Démarre le consentement Google et redirige l'étudiant vers l'écran d'autorisation.
 *
 * L'auth Supabase de l'app est côté navigateur (localStorage, pas de cookie) : le
 * client passe donc son access_token en query. C'est un JWT de courte durée,
 * transmis dans la navigation de l'étudiant lui-même. On le valide côté serveur,
 * puis l'user_id part vers Google dans un `state` signé.
 */
export async function GET(request: NextRequest) {
  const env = gmailEnv()
  if (!env) {
    return NextResponse.json(
      { error: "Connexion Gmail indisponible : GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI manquants." },
      { status: 500 },
    )
  }

  const token =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("Authorization")?.replace("Bearer ", "").trim() ??
    null

  if (!token) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
  }

  const {
    data: { user },
  } = await createServerClient().auth.getUser(token)

  if (!user) {
    return NextResponse.json({ error: "Session expirée. Reconnecte-toi puis réessaie." }, { status: 401 })
  }

  // access_type=offline + prompt=consent : garantit un refresh_token même si
  // l'étudiant a déjà autorisé Alternia par le passé (sans quoi Google ne le
  // renvoie qu'à la toute première autorisation).
  const url = oauthClient(env).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    include_granted_scopes: false,
    state: signState(user.id, env),
  })

  return NextResponse.redirect(url)
}
