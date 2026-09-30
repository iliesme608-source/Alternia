import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import type { ApplicationStatus } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 30

const VALID_STATUSES: ApplicationStatus[] = [
  "ready", "sent", "follow_up", "interview", "rejected", "accepted", "archived",
]

// Forme d'une entreprise jointe (embed PostgREST via company_target_id).
interface JoinedCompany {
  company_name?: string | null
  city?: string | null
  sector?: string | null
  siren?: string | null
  siret?: string | null
  naf_code?: string | null
  employee_range?: string | null
  region?: string | null
}

/**
 * Liste les candidatures (application_packages) sauvegardées de l'utilisateur.
 * Jointe à company_targets pour afficher le nom, la ville, le secteur, le SIREN/SIRET.
 * Utilisée par le suivi Autopilot — persistant après refresh.
 *
 * Les candidatures spontanées et les réponses à une offre publiée vivent dans la
 * même table : `source` les distingue, et une réponse à offre n'a pas
 * d'entreprise jointe (ses informations viennent de l'annonce elle-même).
 *
 * Entrée optionnelle : { status?: ApplicationStatus }
 * Sortie : { applications: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    // Body optionnel (peut être vide) — on ne casse pas si le JSON est absent.
    const body = await request.json().catch(() => ({}))
    const { status } = (body ?? {}) as { status?: string }

    // 1. Auth requise.
    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const sb = createServerClient()

    // 2. Récupérer les packages du user + entreprise jointe, triés du plus récent au plus ancien.
    let query = sb
      .from("application_packages")
      .select(
        "*, company_targets(company_name, city, sector, siren, siret, naf_code, employee_range, region)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    // 3. Filtre de statut optionnel (ignoré si invalide).
    if (status && VALID_STATUSES.includes(status as ApplicationStatus)) {
      query = query.eq("status", status)
    }

    const { data, error } = await query
    if (error) {
      console.error("[autopilot/list-applications] select error:", error)
      return NextResponse.json({ error: "Impossible de charger les candidatures." }, { status: 500 })
    }

    // 4. Aplatir : on remonte les champs entreprise au niveau de la candidature (plus simple côté UI).
    const applications = (data ?? []).map((p: Record<string, unknown>) => {
      const company = (p.company_targets as JoinedCompany | null) ?? null
      const source = ((p.source as string) ?? "spontanee") as "spontanee" | "offre"
      const offerCompany = ((p.offer_company as string) ?? "").trim()
      return {
        id: p.id as string,
        source,
        company_target_id: (p.company_target_id as string) ?? "",
        status: p.status as ApplicationStatus,
        email_subject: (p.email_subject as string) ?? "",
        email_body: (p.email_body as string) ?? "",
        motivation_letter: (p.motivation_letter as string) ?? "",
        linkedin_message: (p.linkedin_message as string) ?? "",
        cv_adaptation_notes: (p.cv_adaptation_notes as string) ?? "",
        highlighted_keywords: (p.highlighted_keywords as string[]) ?? [],
        generated_cv_text: (p.generated_cv_text as string) ?? "",
        follow_up_date: (p.follow_up_date as string | null) ?? null,
        sent_at: (p.sent_at as string | null) ?? null,
        created_at: (p.created_at as string) ?? "",
        // Offre publiée (vide pour une candidature spontanée).
        offer_id: (p.offer_id as string | null) ?? null,
        offer_title: (p.offer_title as string) ?? "",
        offer_company: offerCompany,
        offer_location: (p.offer_location as string) ?? "",
        offer_url: (p.offer_url as string) ?? "",
        offer_source: (p.offer_source as string) ?? "",
        offer_snapshot: (p.offer_snapshot as Record<string, unknown>) ?? {},
        // Champs entreprise joints. Une réponse à offre n'a pas d'entreprise en
        // base : son nom vient de l'annonce, sinon l'UI afficherait « Entreprise ».
        company_name:
          company?.company_name ?? (offerCompany || (source === "offre" ? "Entreprise non communiquée" : "Entreprise")),
        city: company?.city ?? ((p.offer_location as string) || null),
        sector: company?.sector ?? null,
        siren: company?.siren ?? null,
        siret: company?.siret ?? null,
        naf_code: company?.naf_code ?? null,
        employee_range: company?.employee_range ?? null,
        region: company?.region ?? null,
      }
    })

    return NextResponse.json({ applications, count: applications.length })
  } catch (err) {
    console.error("[autopilot/list-applications]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
