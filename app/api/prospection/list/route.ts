import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import { isSuiviStatut, type SuiviStatut } from "@/lib/suivi"
import type { CandidatureSuivi, EntrepriseProspect } from "@/types"

export const runtime = "nodejs"

/** Statut de suivi déduit de l'ancien champ `statut` (campagnes existantes). */
const SUIVI_FROM_LEGACY: Record<string, SuiviStatut> = {
  en_attente: "Prête",
  envoye: "Envoyée",
  repondu: "Accepté",
  sans_suite: "Refus",
}

interface CampagneRow {
  id: string
  secteur?: string | null
  region?: string | null
  statut?: string | null
  entreprises?: EntrepriseProspect[] | null
  created_at: string
}

/**
 * Liste toutes les candidatures de l'utilisateur connecté, à plat.
 * Une campagne prospection_campagnes contient N entreprises → N candidatures.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const { data, error } = await createServerClient()
      .from("prospection_campagnes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[api/prospection/list] select error:", error)
      return NextResponse.json({ error: "Impossible de charger les candidatures." }, { status: 500 })
    }

    const candidatures: CandidatureSuivi[] = []

    for (const campagne of (data ?? []) as CampagneRow[]) {
      const entreprises = Array.isArray(campagne.entreprises) ? campagne.entreprises : []

      entreprises.forEach((e, index) => {
        const siret = e?.siret ?? ""
        // Statut par candidature → sinon statut de campagne → sinon ancien statut → « Prête ».
        const statut =
          (isSuiviStatut(e?.statut_suivi) && e.statut_suivi) ||
          (isSuiviStatut(campagne.statut) && campagne.statut) ||
          SUIVI_FROM_LEGACY[e?.statut ?? ""] ||
          "Prête"

        candidatures.push({
          id: `${campagne.id}::${siret || index}`,
          campagne_id: campagne.id,
          siret,
          siren: e?.siren ?? (/^\d{14}$/.test(siret) ? siret.slice(0, 9) : null),
          naf_code: e?.naf_code ?? null,
          entreprise: e?.nom ?? "Entreprise",
          poste: e?.poste || `Alternance${campagne.secteur ? ` ${campagne.secteur}` : ""}`.trim(),
          secteur: e?.secteur ?? campagne.secteur ?? "",
          ville: e?.ville ?? "",
          taille: e?.taille ?? "",
          email_genere: e?.email_genere ?? "",
          statut,
          created_at: campagne.created_at,
        })
      })
    }

    return NextResponse.json({ candidatures, count: candidatures.length })
  } catch (err) {
    console.error("[api/prospection/list]", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
