import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import {
  getActiveSession,
  startSession,
  stopSession,
  type SessionMode,
} from "@/lib/agent-session"
import { isConfigured as offersConfigured, SOURCE_LABEL } from "@/lib/sources/france-travail"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Session d'agent — « active l'agent pendant 30 minutes / 1 heure ».
 *
 * GET    → session en cours (ou null) + état des sources disponibles.
 * POST   → démarre une session { mode, durationMinutes, objective }.
 * DELETE → arrête la session en cours.
 *
 * Le travail réel se fait dans /api/autopilot/agent/session/tick.
 */

const MIGRATION_HINT =
  "Table agent_sessions absente. Exécute supabase/autopilot_sessions_offres.sql dans Supabase."

const VALID_MODES: SessionMode[] = ["offres", "spontane", "mixte"]

/** Durées proposées — au-delà, l'étudiant relance une session. */
const ALLOWED_DURATIONS = [15, 30, 60, 120]

function sourcesState() {
  return {
    offers: {
      available: offersConfigured(),
      label: SOURCE_LABEL,
      hint: offersConfigured()
        ? null
        : "Ajoute FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET pour explorer les offres publiées.",
    },
    hiddenMarket: {
      available: true,
      label: "Registre des entreprises",
      hint: null as string | null,
    },
  }
}

export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

  const sb = createServerClient()
  const session = await getActiveSession(sb, userId)

  // Dernières sessions terminées — l'étudiant veut revoir ce qui a été fait.
  const { data: history } = await sb
    .from("agent_sessions")
    .select("id, mode, duration_minutes, status, offers_found, companies_found, applications_prepared, contacts_found, message, started_at, finished_at")
    .eq("user_id", userId)
    .not("status", "in", "(running,paused)")
    .order("started_at", { ascending: false })
    .limit(5)

  return NextResponse.json({
    session,
    history: history ?? [],
    sources: sourcesState(),
    durations: ALLOWED_DURATIONS,
  })
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request)
    if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

    const body = (await request.json().catch(() => ({}))) as {
      mode?: string
      durationMinutes?: number
      objective?: Record<string, unknown>
    }

    const mode = VALID_MODES.includes(body.mode as SessionMode)
      ? (body.mode as SessionMode)
      : "mixte"

    // Une session « offres » sans source configurée ne produirait rien.
    if (mode === "offres" && !offersConfigured()) {
      return NextResponse.json(
        {
          error:
            "Aucune source d'offres configurée. Ajoute tes identifiants France Travail, ou lance une session sur le marché caché.",
        },
        { status: 400 },
      )
    }

    const objective: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.objective ?? {})) {
      if (typeof v === "string" && v.trim()) objective[k] = v.trim().slice(0, 200)
    }

    const duration = ALLOWED_DURATIONS.includes(Number(body.durationMinutes))
      ? Number(body.durationMinutes)
      : 30

    const sb = createServerClient()
    const { session, error } = await startSession(sb, userId, {
      mode,
      durationMinutes: duration,
      objective,
    })

    if (error || !session) {
      return NextResponse.json({ error: error ?? MIGRATION_HINT }, { status: 400 })
    }

    return NextResponse.json({ session, sources: sourcesState() })
  } catch (err) {
    console.error("[agent/session]", err)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await resolveUserId(request)
  if (!userId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 })

  const { searchParams } = new URL(request.url)
  // `pause` conserve la session : l'étudiant peut la reprendre plus tard.
  const status = searchParams.get("pause") === "1" ? "paused" : "stopped"

  await stopSession(createServerClient(), userId, status)
  return NextResponse.json({ success: true, status })
}
