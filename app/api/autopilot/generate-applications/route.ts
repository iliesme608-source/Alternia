import { NextRequest, NextResponse } from "next/server"
import { anthropic, MODEL } from "@/lib/anthropic"
import { createServerClient } from "@/lib/supabase"
import { resolveUserId, parseJsonResponse } from "@/lib/autopilot"
import type { AutopilotObjective, CandidateMasterProfile, CompanyTarget } from "@/types"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_GENERATE = 10
const FOLLOW_UP_DAYS = 5

const GENERATE_SYSTEM = `Tu dois générer une candidature spontanée personnalisée pour un étudiant en recherche d'alternance en France. Tu disposes d'un CONTEXTE ÉTUDIANT (profil inscrit, profil CV vérifié et objectif de recherche fusionnés) et d'un CONTEXTE ENTREPRISE. Tu dois utiliser les informations PERTINENTES, mais tu ne dois pas tout forcer : utilise le prénom, l'école, le niveau, le parcours, les compétences ou l'expérience UNIQUEMENT si cela rend le message plus naturel, plus crédible et plus pertinent. Le nom complet peut apparaître dans la signature ; il n'est pas obligatoire dans le corps du message.

INTERDICTIONS ABSOLUES (toute invention disqualifie la candidature) :
- N'invente JAMAIS une école, une expérience, une compétence, un outil, un diplôme, une date, un chiffre ou un résultat. Utilise UNIQUEMENT les données présentes dans le contexte fourni.
- N'invente JAMAIS que l'entreprise recrute, publie une offre ou a un besoin précis : c'est une démarche SPONTANÉE.
- N'invente JAMAIS un contact RH ni un nom de recruteur.
- N'invente JAMAIS d'année scolaire (ex : "2024-2025", "rentrée 2024"). Respecte EXACTEMENT la "CONSIGNE DATES" : si aucune date n'est fournie, écris "à partir de la prochaine rentrée" ou "selon le calendrier de mon école", jamais une année inventée.
- Si une information manque, reste général mais honnête — ne comble JAMAIS un trou par une invention.

PERSONNALISATION OBLIGATOIRE — l'email (email_body) doit contenir AU MINIMUM :
1. Une phrase liée au PROFIL ÉTUDIANT (formation, niveau, école, poste recherché, disponibilité) ancrée sur des données réelles du contexte.
2. Une phrase liée à l'ENTREPRISE : nomme-la et relie son secteur / son activité (code NAF) / sa taille / sa ville à ce que le candidat peut apporter.
3. Une phrase qui explique POURQUOI le profil peut être pertinent pour cette entreprise : pont concret entre les compétences / outils / expériences vérifiés et des missions plausibles (reporting, analyse, suivi de performance…), sans jamais affirmer un besoin.

STYLE — naturel, fluide, professionnel :
- N'empile JAMAIS les informations façon liste ("Je m'appelle X, je suis à Y, je fais Z, je cherche A, j'ai B, C, D…"). Le message doit se lire naturellement.
- Chaque phrase doit être concrète et spécifique ; bannis les formules vides ("votre entreprise dynamique", "je suis intéressé par votre entreprise", "votre position en Île-de-France m'intéresse").
- Exploite matchReason, recommendedAngle et possibleRole s'ils sont fournis. Chaque entreprise doit avoir un ANGLE DIFFÉRENT.
- Si le scoring est absent, personnalise quand même avec secteur + ville + activité + profil vérifié.

Exemple du niveau de personnalisation attendu (à ADAPTER aux données réelles, ne JAMAIS recopier) :
"Actuellement étudiant en Master Data Management à Paris School of Business, je recherche une alternance en Data Analyst à partir de septembre 2026. Orange Store évoluant dans l'univers télécom et retail, je souhaite vous proposer mon profil orienté data, reporting et analyse opérationnelle, dont l'expérience sur Excel et Power BI pourrait contribuer au suivi de performance ou à l'optimisation des reportings."

SIGNATURE :
- Termine l'email et la lettre par une signature propre construite avec les données disponibles, sur le modèle :
  {Prénom Nom}
  Étudiant {niveau / formation} — {école}
  {email si fourni}
- N'inclus le nom, l'école ou l'email QUE s'ils sont fournis dans le contexte. N'invente AUCUNE ligne de signature.

MESSAGE LINKEDIN (linkedin_message) :
- Plus court que l'email, MAXIMUM 500 caractères.
- Utilise seulement l'essentiel : prénom si naturel, école / niveau si utile, poste recherché, intérêt concret pour l'entreprise, demande d'échange courte et polie.

OBJET DE L'EMAIL (email_subject) — professionnel et adapté, sur le modèle :
- "Candidature spontanée — Alternance {poste} — {niveau/formation}"
- "Alternance {poste} — profil {2-3 compétences/outils clés vérifiés}"
- "Candidature alternance — {domaine} — disponible {selon CONSIGNE DATES}"
N'ajoute JAMAIS d'année inventée dans l'objet. N'inclus une date que si elle est fournie dans CONSIGNE DATES.

Tu renvoies UNIQUEMENT un objet JSON valide (aucun texte autour) au format :
{
  "email_subject": "objet professionnel adapté (voir modèles ci-dessus), sans année inventée",
  "email_body": "email court et naturel : accroche spécifique à l'entreprise (secteur/activité/NAF), présentation rapide de l'étudiant ancrée sur son profil vérifié, pont concret vers le poste visé, valeur ajoutée issue des compétences/outils réels, disponibilité (selon CONSIGNE DATES), demande d'échange, formule de politesse. Signe avec le prénom si fourni.",
  "motivation_letter": "mini lettre plus complète que l'email mais concise, ton étudiant crédible et direct, même exigence de personnalisation",
  "linkedin_message": "message très court (max 500 caractères) pour contacter un recruteur, personnalisé entreprise + profil",
  "cv_adaptation_notes": "recommandations concrètes de ce qu'il faut mettre en avant dans le CV pour cette entreprise (pas un faux CV)",
  "highlighted_keywords": ["mots-clés cohérents avec le profil vérifié à renforcer dans le CV"],
  "generated_cv_text": "version adaptée du résumé/profil candidat, SANS inventer d'expérience, de résultat chiffré ni de compétence"
}

Contraintes strictes :
- Candidature SPONTANÉE (ne pas prétendre répondre à une offre).
- N'utilise QUE les données vérifiées du profil fourni.
- generated_cv_text : reformulation/mise en avant uniquement, aucune invention.
- highlighted_keywords : uniquement des termes réellement présents ou compatibles avec le profil.`

interface GenResult {
  email_subject: string
  email_body: string
  motivation_letter: string
  linkedin_message: string
  cv_adaptation_notes: string
  highlighted_keywords: string[]
  generated_cv_text: string
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

// Formate une date de début en français lisible. Accepte "YYYY-MM" (input type=month),
// "YYYY-MM-DD" ou texte libre. Renvoie null si vide.
function formatStartDate(raw: string): string | null {
  const v = (raw ?? "").trim()
  if (!v) return null
  const m = v.match(/^(\d{4})-(\d{2})/)
  if (m) {
    const month = Number(m[2])
    if (month >= 1 && month <= 12) return `${MONTHS_FR[month - 1]} ${m[1]}`
    return m[1]
  }
  return v // texte libre saisi par l'utilisateur
}

// Consigne de dates STRICTE : jamais d'année inventée. Basée sur objective.date_debut/duree.
function buildDatesGuidance(dateDebut: string, duree: string): string {
  const start = formatStartDate(dateDebut)
  if (start) {
    const dur = (duree ?? "").trim()
    return `Disponibilité à mentionner : à partir de ${start}${dur ? `, pour une durée de ${dur}` : ""}. Utilise EXACTEMENT cette échéance, n'invente aucune autre année ni période.`
  }
  return `Aucune date de début n'est renseignée : n'invente JAMAIS d'année scolaire (surtout pas "2024-2025"). Écris uniquement "à partir de la prochaine rentrée" ou "selon le calendrier de mon école".`
}

// Contexte étudiant fusionné : profil inscrit (profiles) + CV maître vérifié + objectif.
// Seuls les champs réellement renseignés sont transmis (les vides sont retirés du JSON
// pour ne jamais suggérer à l'IA de combler un trou par une invention).
interface StudentContext {
  firstName?: string
  lastName?: string
  school?: string
  educationLevel?: string
  targetSector?: string
  targetRegion?: string
  startDate?: string
  duration?: string
  rhythm?: string
  presentation?: string
  verifiedExperiences: CandidateMasterProfile["verified_experiences"]
  verifiedSkills: string[]
  education: CandidateMasterProfile["education"]
  tools: string[]
  targetRole?: string
  contractType?: string
  email?: string
}

interface CompanyContext {
  companyName: string
  city: string | null
  region: string | null
  sector: string | null
  nafCode: string | null
  employeeRange: string | null
  matchReason: string
  recommendedAngle: string
  possibleRole: string
}

function buildCompanyContext(company: CompanyTarget): CompanyContext {
  return {
    companyName: company.company_name,
    city: company.city,
    region: company.region,
    sector: company.sector,
    nafCode: company.naf_code,
    employeeRange: company.employee_range,
    matchReason: company.match_reason,
    recommendedAngle: company.recommended_angle,
    possibleRole: company.possible_role,
  }
}

function buildUserPrompt(
  student: StudentContext,
  company: CompanyContext,
  datesGuidance: string
): string {
  const hasScore = Boolean(company.matchReason || company.recommendedAngle || company.possibleRole)
  const scoringNote = hasScore
    ? "DONNÉES DE SCORING présentes : appuie-toi sur matchReason, recommendedAngle et possibleRole."
    : "DONNÉES DE SCORING absentes : reste prudent et personnalise avec secteur + ville + activité + profil vérifié."

  return `CONTEXTE ÉTUDIANT (profil inscrit + CV vérifié + objectif de recherche — seule source autorisée, n'invente rien au-delà) :
${JSON.stringify(student, null, 2)}

CONSIGNE DATES (impérative) :
${datesGuidance}

CONTEXTE ENTREPRISE CIBLE :
${JSON.stringify(company, null, 2)}

${scoringNote}

Génère le package de candidature spontanée SPÉCIFIQUE à cette entreprise : relie son secteur/activité au profil vérifié par un angle concret et DIFFÉRENT des autres entreprises, intègre le poste visé, le rythme et le type de contrat, et respecte la CONSIGNE DATES. Réponds avec l'objet JSON demandé.`
}

// Normalisation défensive d'un package généré.
function normalize(g: GenResult | null): GenResult {
  return {
    email_subject: typeof g?.email_subject === "string" ? g.email_subject : "",
    email_body: typeof g?.email_body === "string" ? g.email_body : "",
    motivation_letter: typeof g?.motivation_letter === "string" ? g.motivation_letter : "",
    linkedin_message: typeof g?.linkedin_message === "string" ? g.linkedin_message.slice(0, 500) : "",
    cv_adaptation_notes: typeof g?.cv_adaptation_notes === "string" ? g.cv_adaptation_notes : "",
    highlighted_keywords: Array.isArray(g?.highlighted_keywords)
      ? g!.highlighted_keywords.filter((k) => typeof k === "string")
      : [],
    generated_cv_text: typeof g?.generated_cv_text === "string" ? g.generated_cv_text : "",
  }
}

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
      return NextResponse.json({ error: "companyTargetIds requis (au moins une entreprise)." }, { status: 400 })
    }

    // 1. Auth requise (401 en production ; dev = génération sans persistance).
    const userId = await resolveUserId(request)
    const isDev = process.env.NODE_ENV === "development"
    if (!userId && !isDev) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 })
    }

    const sb = createServerClient()

    // 2. Profil candidat maître.
    let profile: CandidateMasterProfile | null = null
    {
      let q = sb.from("candidate_master_profiles").select("*")
      if (userId) q = q.eq("user_id", userId)
      if (profileId) q = q.eq("id", profileId)
      else q = q.order("created_at", { ascending: false })
      const { data } = await q.limit(1).maybeSingle()
      profile = (data as CandidateMasterProfile) ?? null
    }

    // 2b. Profil utilisateur inscrit (table profiles) — best-effort, ne bloque JAMAIS.
    // select("*") : robuste si certaines colonnes n'existent pas encore en base.
    let userProfile: Record<string, unknown> | null = null
    if (userId) {
      const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle()
      if (error) console.error("[autopilot/generate-applications] profiles fetch error:", error)
      userProfile = (data as Record<string, unknown>) ?? null
    }

    // 3/4. Entreprises demandées (appartenant au user).
    let companiesQ = sb.from("company_targets").select("*").in("id", companyTargetIds)
    if (userId) companiesQ = companiesQ.eq("user_id", userId)
    const { data: companiesData } = await companiesQ
    let companies = (companiesData as CompanyTarget[]) ?? []

    // 5. Préférer les entreprises scorées si au moins une l'est.
    const scored = companies.filter((c) => c.match_score !== null)
    if (scored.length > 0) companies = scored

    // 6. Plafond à 10 candidatures par appel.
    companies = companies.slice(0, MAX_GENERATE)

    if (companies.length === 0) {
      return NextResponse.json({ applications: [], count: 0, message: "Aucune entreprise valide à traiter." })
    }

    // Anti-doublon : une candidature existante NON archivée (ready, sent, follow_up,
    // interview, accepted, rejected) bloque la régénération. Seul 'archived' réautorise.
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

    const obj = {
      poste: objective?.targetRole ?? objective?.poste ?? "",
      secteur: objective?.sector ?? objective?.secteur ?? "",
      region: objective?.region ?? "",
      ville: objective?.city ?? objective?.ville ?? "",
      niveau: objective?.educationLevel ?? objective?.niveau ?? "",
      rythme: objective?.rhythm ?? objective?.rythme ?? "",
      date_debut: objective?.startDate ?? objective?.date_debut ?? "",
      duree: objective?.duration ?? objective?.duree ?? "",
      type_contrat: objective?.contractType ?? objective?.type_contrat ?? "",
      prenom: (studentFirstName ?? objective?.prenom ?? "").trim(),
    }

    // Fusion des sources : objectif de recherche > profil inscrit > CV maître.
    // Lecture défensive de `profiles` (colonnes absentes/vides tolérées).
    const pstr = (k: string): string => {
      const v = userProfile?.[k]
      return typeof v === "string" ? v.trim() : ""
    }
    const firstName = obj.prenom || pstr("prenom")
    const lastName = pstr("nom")
    // École : profil inscrit d'abord, sinon première formation vérifiée du CV.
    const school = pstr("ecole") || profile?.education?.[0]?.etablissement || ""
    const educationLevel = obj.niveau || pstr("niveau")
    const targetSector = obj.secteur || pstr("secteur")
    const targetRegion = obj.region || pstr("region")
    // Dates : la vraie colonne profiles est `date_debut_alternance` / `duree_alternance`.
    const startDate = obj.date_debut || pstr("date_debut_alternance")
    const duration = obj.duree || pstr("duree_alternance")
    const presentation = pstr("presentation")
    const email = pstr("email")
    // Compétences déclarées sur /profil — seule source de compétences quand aucun CV
    // maître n'a été analysé (parcours « Continuer sans CV »). Saisies par l'étudiant,
    // jamais inventées.
    const profileSkills = pstr("competences")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)

    const studentContext: StudentContext = {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      school: school || undefined,
      educationLevel: educationLevel || undefined,
      targetSector: targetSector || undefined,
      targetRegion: targetRegion || undefined,
      startDate: startDate || undefined,
      duration: duration || undefined,
      rhythm: obj.rythme || undefined,
      presentation: presentation || undefined,
      verifiedExperiences: profile?.verified_experiences ?? [],
      verifiedSkills: profile?.verified_skills?.length ? profile.verified_skills : profileSkills,
      education: profile?.education ?? [],
      tools: profile?.tools ?? [],
      targetRole: obj.poste || undefined,
      contractType: obj.type_contrat || undefined,
      email: email || undefined,
    }

    // Consigne de dates fondée sur les dates FUSIONNÉES (jamais d'année inventée).
    const datesGuidance = buildDatesGuidance(startDate, duration)

    // Sources de personnalisation réellement disponibles (affichées côté UI).
    const personalization = {
      studentProfile: Boolean(
        firstName || lastName || school || educationLevel || presentation || targetSector || targetRegion || email ||
        profileSkills.length > 0
      ),
      masterCv: Boolean(
        profile && (
          (profile.verified_experiences?.length ?? 0) > 0 ||
          (profile.verified_skills?.length ?? 0) > 0 ||
          (profile.education?.length ?? 0) > 0 ||
          (profile.tools?.length ?? 0) > 0
        )
      ),
      companyTarget: true,
      searchObjective: Boolean(obj.poste || obj.secteur || obj.ville || obj.region),
    }

    // 7-14. Génération + persistance, une entreprise à la fois (en parallèle).
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

        // Génération Claude (gestion d'erreur isolée par entreprise).
        let parsed: GenResult | null = null
        try {
          const response = await anthropic.messages.create({
            model: MODEL,
            // 3000 : marge pour un package plus riche (email + lettre + LinkedIn + CV)
            // sans troncature du JSON.
            max_tokens: 3000,
            system: GENERATE_SYSTEM,
            messages: [{ role: "user", content: buildUserPrompt(studentContext, buildCompanyContext(company), datesGuidance) }],
          })
          const raw = response.content[0].type === "text" ? response.content[0].text : ""
          parsed = parseJsonResponse<GenResult>(raw)
        } catch (e) {
          console.error("[autopilot/generate-applications] Claude error:", company.id, e)
          parsed = null
        }

        const pkg = normalize(parsed)
        // Échec = parse impossible OU contenu vide → on NE persiste PAS de package vide.
        const generationFailed =
          parsed === null || (!pkg.email_subject && !pkg.email_body && !pkg.motivation_letter)
        if (generationFailed) {
          return {
            company_target_id: company.id,
            company_name: company.company_name,
            failed: true as const,
            error: "generation_failed",
          }
        }

        const followUp = new Date(Date.now() + FOLLOW_UP_DAYS * 86_400_000).toISOString()

        // Dev sans auth : on renvoie sans persister.
        if (!userId) {
          return {
            id: null,
            company_target_id: company.id,
            company_name: company.company_name,
            status: "ready" as const,
            ...pkg,
            follow_up_date: followUp,
            created_at: new Date().toISOString(),
            persisted: false,
            personalization,
          }
        }

        // 12/13. Insertion du package.
        const { data: inserted, error: insErr } = await sb
          .from("application_packages")
          .insert({
            user_id: userId,
            company_target_id: company.id,
            status: "ready",
            email_subject: pkg.email_subject,
            email_body: pkg.email_body,
            motivation_letter: pkg.motivation_letter,
            linkedin_message: pkg.linkedin_message,
            cv_adaptation_notes: pkg.cv_adaptation_notes,
            highlighted_keywords: pkg.highlighted_keywords,
            generated_cv_text: pkg.generated_cv_text,
            follow_up_date: followUp,
          })
          .select("id, status, follow_up_date, created_at")
          .single()

        if (insErr) console.error("[autopilot/generate-applications] insert package error:", company.id, insErr)

        // 14. Event "generated".
        if (inserted?.id) {
          const { error: evErr } = await sb.from("application_events").insert({
            user_id: userId,
            application_package_id: inserted.id,
            event_type: "generated",
            note: "Candidature générée par Alternia Autopilot",
            metadata: {
              company_name: company.company_name,
              match_score: company.match_score,
              priority: company.priority,
            },
          })
          if (evErr) console.error("[autopilot/generate-applications] insert event error:", inserted.id, evErr)
        }

        return {
          id: inserted?.id ?? null,
          company_target_id: company.id,
          company_name: company.company_name,
          status: inserted?.status ?? "ready",
          ...pkg,
          follow_up_date: inserted?.follow_up_date ?? followUp,
          created_at: inserted?.created_at ?? new Date().toISOString(),
          personalization,
        }
      })
    )

    return NextResponse.json({ applications, count: applications.length })
  } catch (err) {
    console.error("[autopilot/generate-applications]", err)
    return NextResponse.json({ error: "Erreur serveur: " + String(err) }, { status: 500 })
  }
}
