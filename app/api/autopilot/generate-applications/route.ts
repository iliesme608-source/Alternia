import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import {
  FOLLOW_UP_DAYS,
  generatePackage,
  loadStudentContext,
  persistPackage,
  type RecipientContext,
} from "@/lib/application-generator"
import type { AutopilotObjective, CompanyTarget } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_GENERATE = 10

/**
 * Génération des candidatures (étape 4 du wizard Autopilot).
 *
 * La rédaction elle-même vit dans lib/application-generator, partagée avec
 * l'agent de démarchage nocturne : une candidature préparée par l'agent est
 * rigoureusement identique à celle générée ici.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { profileId, objective, companyTargetIds, studentFirstName } = body as {
      profileId?: string
      objective?: Partial<AutopilotObjective> & Record<string, string>
      companyTargetIds?: string[]
      studentFirstName?: string
    }

    if (!companyTargetIds || !Array.isArray(companyTargetIds) || companyTargetIds.length === 0) {
      return NextResponse.json(
        { error: "companyTargetIds requis (au moins une entreprise)." },
        { status: 400 },
      )
    }

    // Auth requise (401 en production ; dev = génération sans persistance).
    const userId = await resolveUserId(request)
    const isDev = process.env.NODE_ENV === "development"
    if (!userId && !isDev) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const sb = createServerClient()

    // Contexte étudiant fusionné (profil inscrit + CV maître + objectif).
    const { student, datesGuidance, personalization } = await loadStudentContext(sb, userId, {
      profileId,
      objective,
      studentFirstName,
    })

    // Entreprises demandées (appartenant au user).
    let companiesQ = sb.from("company_targets").select("*").in("id", companyTargetIds)
    if (userId) companiesQ = companiesQ.eq("user_id", userId)
    const { data: companiesData } = await companiesQ
    let companies = (companiesData as CompanyTarget[]) ?? []

    // Préférer les entreprises scorées si au moins une l'est.
    const scored = companies.filter((c) => c.match_score !== null)
    if (scored.length > 0) companies = scored

    companies = companies.slice(0, MAX_GENERATE)

    if (companies.length === 0) {
      return NextResponse.json({ applications: [], count: 0, message: "Aucune entreprise valide à traiter." })
    }

    // Anti-doublon : une candidature existante NON archivée bloque la
    // régénération. Seul 'archived' réautorise.
    const existingByCompany = new Map<string, Record<string, unknown>>()
    if (userId) {
      const { data: existing } = await sb
        .from("application_packages")
        .select("*")
        .eq("user_id", userId)
        .neq("status", "archived")
        .in("company_target_id", companies.map((c) => c.id))
      for (const p of existing ?? []) {
        if (p.company_target_id) existingByCompany.set(p.company_target_id as string, p)
      }
    }

    // Destinataire connu par entreprise — permet d'adresser la candidature à la
    // bonne personne. Best-effort : la table company_contacts peut ne pas exister.
    const recipientByCompany = new Map<string, RecipientContext>()
    if (userId) {
      const { data: contacts, error } = await sb
        .from("company_contacts")
        .select("company_target_id, full_name, job_title, is_primary, outreach_rank")
        .eq("user_id", userId)
        .in("company_target_id", companies.map((c) => c.id))
        .order("is_primary", { ascending: false })
        .order("outreach_rank", { ascending: false })
      if (error) {
        console.log("[autopilot/generate-applications] company_contacts indisponible:", error.code)
      }
      for (const c of contacts ?? []) {
        const key = c.company_target_id as string
        if (!key || recipientByCompany.has(key)) continue
        const fullName = ((c.full_name as string) ?? "").trim()
        const jobTitle = ((c.job_title as string) ?? "").trim()
        if (fullName || jobTitle) {
          recipientByCompany.set(key, {
            fullName: fullName || undefined,
            jobTitle: jobTitle || undefined,
          })
        }
      }
    }

    // Génération + persistance, une entreprise à la fois (en parallèle).
    const applications = await Promise.all(
      companies.map(async (company) => {
        // Doublon : on renvoie l'existante sans régénérer.
        const dup = existingByCompany.get(company.id)
        if (dup) {
          return {
            id: dup.id,
            company_target_id: company.id,
            company_name: company.company_name,
            status: dup.status,
            email_subject: dup.email_subject,
            email_body: dup.email_body,
            motivation_letter: dup.motivation_letter,
            linkedin_message: dup.linkedin_message,
            cv_adaptation_notes: dup.cv_adaptation_notes,
            highlighted_keywords: dup.highlighted_keywords ?? [],
            generated_cv_text: dup.generated_cv_text,
            follow_up_date: dup.follow_up_date,
            created_at: dup.created_at,
            already_existed: true,
            personalization,
          }
        }

        const pkg = await generatePackage(
          student,
          company,
          datesGuidance,
          recipientByCompany.get(company.id),
        )

        if (!pkg) {
          return {
            company_target_id: company.id,
            company_name: company.company_name,
            failed: true as const,
            error: "generation_failed",
          }
        }

        // Dev sans auth : on renvoie sans persister.
        if (!userId) {
          return {
            id: null,
            company_target_id: company.id,
            company_name: company.company_name,
            status: "ready" as const,
            ...pkg,
            follow_up_date: new Date(Date.now() + FOLLOW_UP_DAYS * 86_400_000).toISOString(),
            created_at: new Date().toISOString(),
            persisted: false,
            personalization,
          }
        }

        const saved = await persistPackage(sb, userId, company, pkg)

        return {
          id: saved.id,
          company_target_id: company.id,
          company_name: company.company_name,
          status: saved.status,
          ...pkg,
          follow_up_date: saved.follow_up_date,
          created_at: saved.created_at,
          personalization,
        }
      }),
    )

    return NextResponse.json({ applications, count: applications.length })
  } catch (err) {
    console.error("[autopilot/generate-applications]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
