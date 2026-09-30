import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import { searchAndPersistCompanies } from "@/lib/company-search"
import type { AutopilotObjective } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Recherche d'entreprises compatibles (étape 3 du wizard Autopilot).
 *
 * Toute la logique — registre public, filtre géographique, dédoublonnage,
 * persistance — vit dans lib/company-search, partagée avec l'agent de
 * démarchage nocturne pour que les deux parcours trouvent les mêmes entreprises.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { objective } = body as {
      objective?: Partial<AutopilotObjective> & {
        targetRole?: string
        sector?: string
        region?: string
        city?: string
      }
      profileId?: string
    }

    // Accepte les deux conventions de nommage (targetRole/poste, etc.).
    const poste = objective?.targetRole ?? objective?.poste ?? ""
    const sector = objective?.sector ?? objective?.secteur ?? ""
    const region = objective?.region ?? ""
    const city = objective?.city ?? objective?.ville ?? ""

    if (!poste || !sector || (!region && !city)) {
      return NextResponse.json(
        { error: "Champs requis : poste, secteur, et région ou ville." },
        { status: 400 },
      )
    }

    // Auth OBLIGATOIRE pour Autopilot — aucune exception en dev. Sans persistance,
    // les entreprises n'auraient pas d'`id` Supabase et seraient inutilisables.
    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const result = await searchAndPersistCompanies(
      createServerClient(),
      userId,
      { sector, region, city },
    )

    if (result.missingTables?.length) {
      return NextResponse.json(
        { error: "Tables Autopilot manquantes. Exécute supabase/autopilot.sql dans Supabase." },
        { status: 500 },
      )
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      companies: result.companies,
      count: result.count,
      ...(result.message ? { message: result.message } : {}),
    })
  } catch (err) {
    console.error("[autopilot/search-companies]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
