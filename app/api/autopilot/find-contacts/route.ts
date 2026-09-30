import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId } from "@/lib/autopilot"
import {
  EMAIL_RE,
  googleProfileSearchUrl,
  linkedinSearchUrl,
  officialCompanyUrl,
  persistContactLeads,
  searchContactLeads,
} from "@/lib/contacts"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Contacts décideurs d'une entreprise ciblée.
 *
 * POST { action: "find", companyTargetId }
 *   → dirigeants officiels (registre public) + adresses PUBLIÉES sur le site
 *     de l'entreprise (pages contact, mentions légales, recrutement…) ; à
 *     défaut, adresses de service sur un domaine vérifié par DNS. Plus des
 *     liens de recherche LinkedIn/Google.
 *     Seul l'étudiant fait passer une adresse en « confirmé ».
 *
 * POST { action: "confirm", companyTargetId, email, fullName?, jobTitle? }
 *   → l'étudiant a vérifié une adresse : elle passe en « confirmé » et devient
 *     le contact principal de l'entreprise.
 */

/** La migration supabase/autopilot_contacts_agent.sql n'a pas encore été jouée. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  )
}

const MIGRATION_HINT =
  "Table company_contacts absente. Exécute supabase/autopilot_contacts_agent.sql dans Supabase."

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request)
    if (!userId) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      companyTargetId?: string
      email?: string
      fullName?: string
      jobTitle?: string
    }

    const companyTargetId = (body.companyTargetId ?? "").trim()
    if (!companyTargetId) {
      return NextResponse.json({ error: "companyTargetId requis." }, { status: 400 })
    }

    const sb = createServerClient()

    // L'entreprise doit appartenir à l'étudiant — jamais de fuite entre comptes.
    const { data: company, error: companyErr } = await sb
      .from("company_targets")
      .select("id, company_name, siren, website, employee_range, city, sector")
      .eq("id", companyTargetId)
      .eq("user_id", userId)
      .maybeSingle()

    if (companyErr) console.error("[autopilot/find-contacts] company fetch:", companyErr)
    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 })
    }

    const companyName = company.company_name as string

    // ── Confirmation manuelle d'une adresse trouvée par l'étudiant ────────────
    if (body.action === "confirm") {
      const email = (body.email ?? "").trim().toLowerCase()
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 })
      }

      // Une seule adresse principale par entreprise.
      const { error: resetErr } = await sb
        .from("company_contacts")
        .update({ is_primary: false })
        .eq("user_id", userId)
        .eq("company_target_id", companyTargetId)
      if (resetErr && isMissingTable(resetErr)) {
        return NextResponse.json({ error: MIGRATION_HINT }, { status: 500 })
      }

      const { data: saved, error: upErr } = await sb
        .from("company_contacts")
        .upsert(
          {
            user_id: userId,
            company_target_id: companyTargetId,
            full_name: (body.fullName ?? "").trim(),
            job_title: (body.jobTitle ?? "").trim(),
            email,
            domain: email.split("@")[1] ?? "",
            linkedin_search: linkedinSearchUrl(companyName, (body.jobTitle ?? "").trim()),
            source: "saisie_etudiant",
            email_status: "confirme",
            outreach_rank: 100,
            is_primary: true,
            note: "Adresse vérifiée par l'étudiant.",
          },
          { onConflict: "user_id,company_target_id,email" },
        )
        .select()
        .maybeSingle()

      if (upErr) {
        console.error("[autopilot/find-contacts] confirm upsert:", upErr)
        return NextResponse.json(
          { error: isMissingTable(upErr) ? MIGRATION_HINT : "Impossible d'enregistrer ce contact." },
          { status: 500 },
        )
      }

      return NextResponse.json({ contact: saved })
    }

    // ── Recherche ────────────────────────────────────────────────────────────

    // Registre public, domaine vérifié, puis lecture du site de l'entreprise.
    const search = await searchContactLeads({
      company_name: companyName,
      siren: company.siren as string | null,
      website: company.website as string | null,
      employee_range: company.employee_range as string | null,
    })
    const { leads, domain, corroborated } = search

    // Le domaine vérifié est une information utile en soi : on la garde sur
    // l'entreprise pour ne pas refaire la résolution DNS à chaque passage.
    if (domain && !company.website) {
      const { error } = await sb
        .from("company_targets")
        .update({ website: `https://${domain}` })
        .eq("id", companyTargetId)
        .eq("user_id", userId)
      if (error) console.error("[autopilot/find-contacts] website update:", error)
    }

    // Persistance — best-effort : une migration non jouée ne doit pas priver
    // l'étudiant des pistes qu'on vient de trouver.
    const persistErr = await persistContactLeads(sb, userId, companyTargetId, leads)
    if (persistErr) console.error("[autopilot/find-contacts] persist leads:", persistErr)
    let migrationMissing = isMissingTable(persistErr)
    const persisted = !persistErr && leads.some((l) => l.email)

    // Contacts déjà connus (dont ceux confirmés lors d'un passage précédent).
    let stored: Record<string, unknown>[] = []
    if (!migrationMissing) {
      const { data, error } = await sb
        .from("company_contacts")
        .select("*")
        .eq("user_id", userId)
        .eq("company_target_id", companyTargetId)
        .order("is_primary", { ascending: false })
        .order("outreach_rank", { ascending: false })
      if (error) {
        console.error("[autopilot/find-contacts] select stored:", error)
        migrationMissing = isMissingTable(error)
      } else {
        stored = data ?? []
      }
    }

    return NextResponse.json({
      companyName,
      domain,
      domainCorroborated: corroborated,
      // Pistes affichées : celles en base si disponibles, sinon celles calculées.
      contacts: stored.length > 0 ? stored : leads,
      dirigeantsCount: search.dirigeantsCount,
      siteEmailsCount: search.siteEmailsCount,
      pagesRead: search.pagesRead,
      searchLinks: {
        linkedinRecruteur: linkedinSearchUrl(companyName, "Responsable recrutement alternance"),
        linkedinDirection: linkedinSearchUrl(companyName, "Directeur"),
        google: googleProfileSearchUrl(companyName, "Responsable recrutement"),
        officialRecord: officialCompanyUrl(company.siren as string | null),
        website: domain ? `https://${domain}` : null,
      },
      persisted,
      migrationMissing,
      message: migrationMissing ? MIGRATION_HINT : undefined,
    })
  } catch (err) {
    console.error("[autopilot/find-contacts]", err)
    return NextResponse.json({ error: "Erreur serveur pendant la recherche de contacts." }, { status: 500 })
  }
}
