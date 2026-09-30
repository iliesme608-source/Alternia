import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import { tickSession } from "@/lib/agent-session"

export const runtime = "nodejs"
// Un tick travaille ~90 s puis rend la main ; la marge couvre un appel Claude lent.
export const maxDuration = 300

/**
 * Une tranche de travail de la session en cours.
 *
 * L'interface appelle cette route en boucle tant que `continueTicking` est vrai.
 * Chaque appel est autonome : il relit l'état en base, travaille pendant une
 * tranche bornée, puis réécrit sa progression. Fermer l'onglet interrompt donc
 * la boucle sans rien perdre.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request)
    if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

    const result = await tickSession(createServerClient(), userId)

    if (!result.session && result.error) {
      return NextResponse.json({ error: result.error, continueTicking: false }, { status: 404 })
    }

    return NextResponse.json({
      session: result.session,
      continueTicking: result.continueTicking,
      ...(result.error ? { warning: result.error } : {}),
    })
  } catch (err) {
    console.error("[agent/session/tick]", err)
    return NextResponse.json(
      { error: "Le tour de travail a échoué.", continueTicking: false },
      { status: 500 },
    )
  }
}
