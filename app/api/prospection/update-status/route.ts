import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import { isSuiviStatut, LEGACY_FROM_SUIVI, SUIVI_STATUTS } from "@/lib/suivi"
import type { EntrepriseProspect } from "@/types"

export const runtime = "nodejs"

/**
 * Met à jour le statut d'une candidature.
 * Body : { id, statut } — `id` accepte la forme composite `${campagneId}::${siret}`
 * (une candidature) ou l'id de campagne seul (toutes ses candidatures).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { id, statut, siret } = (body ?? {}) as { id?: string; statut?: string; siret?: string }

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id requis." }, { status: 400 })
    }
    if (!isSuiviStatut(statut)) {
      return NextResponse.json(
        { error: `Statut invalide. Autorisés : ${SUIVI_STATUTS.join(", ")}.` },
        { status: 400 }
      )
    }

    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    // `id` composite → campagne + siret ciblé.
    const [campagneId, siretFromId] = id.split("::")
    const targetSiret = siret ?? (siretFromId || null)

    const sb = createServerClient()

    const { data: campagne, error: fetchError } = await sb
      .from("prospection_campagnes")
      .select("id, entreprises")
      .eq("id", campagneId)
      .eq("user_id", userId)
      .maybeSingle()

    if (fetchError || !campagne) {
      return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 })
    }

    const entreprises = (Array.isArray(campagne.entreprises) ? campagne.entreprises : []) as EntrepriseProspect[]

    // Une candidature ciblée par SIRET (ou par index si l'entrée n'a pas de SIRET).
    const updated = entreprises.map((e, index) => {
      const matches =
        targetSiret === null ||
        e?.siret === targetSiret ||
        String(index) === targetSiret
      if (!matches) return e
      return { ...e, statut_suivi: statut, statut: LEGACY_FROM_SUIVI[statut] }
    })

    const { error: updateError } = await sb
      .from("prospection_campagnes")
      .update({ entreprises: updated })
      .eq("id", campagneId)
      .eq("user_id", userId)

    if (updateError) {
      console.error("[api/prospection/update-status] update error:", updateError)
      return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 })
    }

    // Statut au niveau campagne — best effort : ignoré si la migration
    // supabase/prospection_suivi.sql n'a pas encore été exécutée.
    const { error: statutError } = await sb
      .from("prospection_campagnes")
      .update({ statut })
      .eq("id", campagneId)
      .eq("user_id", userId)
    if (statutError) {
      console.warn("[api/prospection/update-status] colonne statut absente:", statutError.message)
    }

    return NextResponse.json({ id, statut, siret: targetSiret })
  } catch (err) {
    console.error("[api/prospection/update-status]", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
