import { NextRequest, NextResponse } from "next/server"
import { resolveUserId } from "@/lib/autopilot"
import { diagnose } from "@/lib/sources/france-travail"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * « Tester la connexion » aux sources d'offres.
 *
 * Exécute la chaîne complète contre le vrai compte France Travail — jeton,
 * référentiel des natures de contrat, puis une recherche réelle — et renvoie ce
 * que l'API a effectivement répondu. On constate, on ne suppose pas : c'est ce
 * qui permet de confirmer les codes de contrat alternance sans les deviner.
 */
export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { keywords?: string }
  const keywords = typeof body.keywords === "string" && body.keywords.trim()
    ? body.keywords.trim().slice(0, 100)
    : "alternance"

  const result = await diagnose(keywords)
  return NextResponse.json(result)
}
