import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import type { ApplicationStatus } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 30

const VALID_STATUSES: ApplicationStatus[] = [
  "ready", "sent", "follow_up", "interview", "rejected", "accepted", "archived",
]

// event_type associé à chaque nouveau statut.
const EVENT_TYPE: Record<ApplicationStatus, string> = {
  ready: "status_changed",
  sent: "sent",
  follow_up: "follow_up",
  interview: "interview",
  rejected: "rejected",
  accepted: "accepted",
  archived: "archived",
}

// Note par défaut par statut.
const DEFAULT_NOTE: Record<ApplicationStatus, string> = {
  ready: "Statut mis à jour",
  sent: "Candidature marquée comme envoyée",
  follow_up: "Relance à effectuer ou effectuée",
  interview: "Entretien obtenu",
  rejected: "Candidature refusée",
  accepted: "Alternance acceptée",
  archived: "Candidature archivée",
}

const DAY = 86_400_000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { applicationPackageId, status, note, metadata } = body as {
      applicationPackageId?: string
      status?: string
      note?: string
      metadata?: Record<string, unknown>
    }

    // Normalisation / validation des inputs.
    if (!applicationPackageId || typeof applicationPackageId !== "string") {
      return NextResponse.json({ error: "applicationPackageId requis." }, { status: 400 })
    }
    if (!status || !VALID_STATUSES.includes(status as ApplicationStatus)) {
      return NextResponse.json(
        { error: `Statut invalide. Autorisés : ${VALID_STATUSES.join(", ")}.` },
        { status: 400 }
      )
    }
    const newStatus = status as ApplicationStatus

    // 1/2. Auth requise (401 en production ; dev sans user = pas de filtre user).
    const userId = await resolveUserId(request)
    const isDev = process.env.NODE_ENV === "development"
    if (!userId && !isDev) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const sb = createServerClient()

    // 3/4. Récupérer le package et vérifier l'appartenance.
    let fetchQ = sb.from("application_packages").select("*").eq("id", applicationPackageId)
    if (userId) fetchQ = fetchQ.eq("user_id", userId)
    const { data: pkg } = await fetchQ.maybeSingle()

    if (!pkg) {
      // Inexistant OU appartient à un autre user → 404 (ne divulgue pas l'existence).
      return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 })
    }

    // 5. Ancien statut.
    const previousStatus = pkg.status as ApplicationStatus
    const now = Date.now()

    // 6. Construire les changements selon le nouveau statut.
    const updates: Record<string, unknown> = { status: newStatus }

    switch (newStatus) {
      case "sent": {
        if (!pkg.sent_at) updates.sent_at = new Date(now).toISOString()
        updates.follow_up_date = new Date(now + 5 * DAY).toISOString()
        break
      }
      case "follow_up": {
        // sent_at + 12 jours s'il est dans le futur, sinon now + 7 jours.
        let followUp = now + 7 * DAY
        if (pkg.sent_at) {
          const sentPlus12 = new Date(pkg.sent_at).getTime() + 12 * DAY
          if (sentPlus12 > now) followUp = sentPlus12
        }
        updates.follow_up_date = new Date(followUp).toISOString()
        break
      }
      case "interview":
      case "rejected":
      case "accepted":
      case "archived": {
        updates.follow_up_date = null
        break
      }
      case "ready":
        // Ne pas toucher sent_at ni follow_up_date.
        break
    }

    // 6b. Appliquer l'update (updated_at géré par le trigger set_updated_at).
    let updateQ = sb.from("application_packages").update(updates).eq("id", applicationPackageId)
    if (userId) updateQ = updateQ.eq("user_id", userId)
    const { data: updated, error: updErr } = await updateQ.select("*").single()

    if (updErr || !updated) {
      console.error("[autopilot/update-status] update error:", updErr)
      return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 })
    }

    // 7. Créer l'événement de suivi.
    const eventUserId = (userId ?? pkg.user_id) as string
    const { error: evErr } = await sb.from("application_events").insert({
      user_id: eventUserId,
      application_package_id: applicationPackageId,
      event_type: EVENT_TYPE[newStatus],
      note: typeof note === "string" && note.trim() ? note.trim() : DEFAULT_NOTE[newStatus],
      metadata: {
        previous_status: previousStatus,
        new_status: newStatus,
        ...(metadata ?? {}),
      },
    })
    if (evErr) console.error("[autopilot/update-status] insert event error:", evErr)

    // 8. Retourner l'application mise à jour.
    return NextResponse.json({ application: updated, previous_status: previousStatus })
  } catch (err) {
    console.error("[autopilot/update-status]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
