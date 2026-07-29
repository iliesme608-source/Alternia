import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"

export const runtime = "nodejs"
export const maxDuration = 30

// Statuts de suivi d'une entreprise cible (Autopilot étape 3).
// Doit rester synchro avec la contrainte CHECK de
// supabase/autopilot_alter_tracking_status.sql.
const VALID_STATUSES = ["a_contacter", "contactee", "reponse_recue", "entretien"] as const
type TrackingStatus = (typeof VALID_STATUSES)[number]

// Sérialise TOUT ce que porte une erreur (Error ou PostgrestError) : les objets
// d'erreur Supabase ne s'affichent pas via String(err) et perdent code/details/hint.
function fullError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause ? String(err.cause) : undefined,
    }
  }
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    return {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
      raw: JSON.stringify(err),
    }
  }
  return { value: String(err) }
}

export async function POST(request: NextRequest) {
  // Log d'entrée : trace systématiquement la requête, même si elle échoue plus bas.
  console.error("[autopilot/update-company-status] >>> POST reçu", {
    url: request.url,
    hasAuthHeader: Boolean(request.headers.get("authorization")),
    hasCookie: Boolean(request.headers.get("cookie")),
  })
  try {
    const body = await request.json()
    console.error("[autopilot/update-company-status] body:", JSON.stringify(body))
    const { companyTargetId, status } = body as { companyTargetId?: string; status?: string }

    // Normalisation / validation des inputs.
    if (!companyTargetId || typeof companyTargetId !== "string") {
      return NextResponse.json({ error: "companyTargetId requis." }, { status: 400 })
    }
    if (!status || !VALID_STATUSES.includes(status as TrackingStatus)) {
      return NextResponse.json(
        { error: `Statut invalide. Autorisés : ${VALID_STATUSES.join(", ")}.` },
        { status: 400 }
      )
    }
    const newStatus = status as TrackingStatus

    // Auth requise (401 en production ; dev sans user = pas de filtre user).
    const userId = await resolveUserId(request)
    const isDev = process.env.NODE_ENV === "development"
    if (!userId && !isDev) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const sb = createServerClient()

    // Vérifie l'existence ET l'appartenance de la ligne avant tout update.
    let fetchQ = sb.from("company_targets").select("id, user_id, tracking_status").eq("id", companyTargetId)
    if (userId) fetchQ = fetchQ.eq("user_id", userId)
    const { data: existing, error: fetchErr } = await fetchQ.maybeSingle()

    if (fetchErr) {
      console.error("[autopilot/update-company-status] FETCH ERROR:", fullError(fetchErr), {
        companyTargetId,
        userId,
      })
      return NextResponse.json({ error: "Erreur lors de la vérification de l'entreprise." }, { status: 500 })
    }
    if (!existing) {
      // Inexistante OU appartient à un autre user → 404 (ne divulgue pas l'existence).
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 })
    }

    // Update filtré par id + user_id (défense en profondeur, en plus de la RLS).
    let updateQ = sb.from("company_targets").update({ tracking_status: newStatus }).eq("id", companyTargetId)
    if (userId) updateQ = updateQ.eq("user_id", userId)
    const { data: updated, error: updErr } = await updateQ.select("*").single()

    if (updErr || !updated) {
      console.error("[autopilot/update-company-status] UPDATE ERROR:", fullError(updErr), {
        companyTargetId,
        userId,
        newStatus,
        updatedIsNull: !updated,
      })
      return NextResponse.json({ error: "Mise à jour du statut impossible." }, { status: 500 })
    }

    return NextResponse.json({ company: updated })
  } catch (err) {
    console.error("[autopilot/update-company-status] EXCEPTION:", fullError(err))
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
