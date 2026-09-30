import type { SupabaseClient } from "@supabase/supabase-js"
import { anthropic, WRITING_MODEL, textOf } from "@/lib/anthropic"
import { parseJsonResponse } from "@/lib/autopilot"
import { sectorWritingGuide } from "@/lib/sector-voice"
import type { AutopilotObjective, CandidateMasterProfile, CompanyTarget } from "@/types"

/**
 * Rédaction d'une candidature spontanée personnalisée.
 *
 * Extrait de app/api/autopilot/generate-applications pour être partagé avec
 * l'agent de démarchage nocturne : une candidature préparée pendant la nuit doit
 * être rigoureusement identique — même prompt, mêmes garde-fous anti-invention,
 * même persistance — à celle que l'étudiant génère lui-même.
 */

export const FOLLOW_UP_DAYS = 5

export const GENERATE_SYSTEM = `Tu dois générer une candidature spontanée personnalisée pour un étudiant en recherche d'alternance en France. Tu disposes d'un CONTEXTE ÉTUDIANT (profil inscrit, profil CV vérifié et objectif de recherche fusionnés) et d'un CONTEXTE ENTREPRISE. Tu dois utiliser les informations PERTINENTES, mais tu ne dois pas tout forcer : utilise le prénom, l'école, le niveau, le parcours, les compétences ou l'expérience UNIQUEMENT si cela rend le message plus naturel, plus crédible et plus pertinent. Le nom complet peut apparaître dans la signature ; il n'est pas obligatoire dans le corps du message.

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
"Dans un réseau de boutiques télécom comme Orange Store, chaque point de vente produit chaque jour des chiffres de ventes et d'affluence qu'il faut consolider pour piloter. C'est précisément ce que j'apprends en Master Data Management à Paris School of Business, avec Excel et Power BI. Je recherche une alternance de Data Analyst à partir de septembre 2026 et pourrais prendre en charge une partie de vos reportings de performance."

DESTINATAIRE :
- Si un DESTINATAIRE est fourni dans le contexte (nom et/ou fonction), adresse-toi à lui : "Madame, Monsieur," devient une formule nominative correcte ("Bonjour Madame Dupont," / "Bonjour Monsieur Martin,") UNIQUEMENT si le nom est fourni. N'invente JAMAIS un nom, un genre ou une fonction absents du contexte.
- Si aucun destinataire n'est fourni, garde une formule neutre ("Madame, Monsieur,").

PIÈCE JOINTE :
- Le CV de l'étudiant est joint à l'email. Tu peux y faire référence naturellement ("vous trouverez mon CV en pièce jointe"), une seule fois, sans insister.

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

export interface GenResult {
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

/**
 * Formate une date de début en français lisible. Accepte "YYYY-MM" (input
 * type=month), "YYYY-MM-DD" ou texte libre. Renvoie null si vide.
 */
export function formatStartDate(raw: string): string | null {
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

/** Consigne de dates STRICTE : jamais d'année inventée. */
export function buildDatesGuidance(dateDebut: string, duree: string): string {
  const start = formatStartDate(dateDebut)
  if (start) {
    const dur = (duree ?? "").trim()
    return `Disponibilité à mentionner : à partir de ${start}${dur ? `, pour une durée de ${dur}` : ""}. Utilise EXACTEMENT cette échéance, n'invente aucune autre année ni période.`
  }
  return `Aucune date de début n'est renseignée : n'invente JAMAIS d'année scolaire (surtout pas "2024-2025"). Écris uniquement "à partir de la prochaine rentrée" ou "selon le calendrier de mon école".`
}

/**
 * Contexte étudiant fusionné : profil inscrit (profiles) + CV maître vérifié +
 * objectif. Seuls les champs réellement renseignés sont transmis (les vides sont
 * retirés du JSON pour ne jamais suggérer à l'IA de combler un trou).
 */
export interface StudentContext {
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

export interface CompanyContext {
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

/** Destinataire identifié — jamais inventé, toujours issu de company_contacts. */
export interface RecipientContext {
  fullName?: string
  jobTitle?: string
}

/** Sources de personnalisation réellement disponibles (affichées côté UI). */
export interface PersonalizationSources {
  studentProfile: boolean
  masterCv: boolean
  companyTarget: boolean
  searchObjective: boolean
}

export function buildCompanyContext(company: CompanyTarget): CompanyContext {
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
  datesGuidance: string,
  recipient?: RecipientContext,
): string {
  const hasScore = Boolean(company.matchReason || company.recommendedAngle || company.possibleRole)
  const scoringNote = hasScore
    ? "DONNÉES DE SCORING présentes : appuie-toi sur matchReason, recommendedAngle et possibleRole."
    : "DONNÉES DE SCORING absentes : reste prudent et personnalise avec secteur + ville + activité + profil vérifié."

  const recipientBlock =
    recipient?.fullName || recipient?.jobTitle
      ? `\nDESTINATAIRE IDENTIFIÉ (donnée réelle, issue du registre public ou vérifiée par l'étudiant — ne l'altère pas, n'en invente pas d'autre) :
${JSON.stringify(recipient, null, 2)}\n`
      : `\nDESTINATAIRE : inconnu. Utilise une formule neutre, n'invente AUCUN nom.\n`

  return `CONTEXTE ÉTUDIANT (profil inscrit + CV vérifié + objectif de recherche — seule source autorisée, n'invente rien au-delà) :
${JSON.stringify(student, null, 2)}

CONSIGNE DATES (impérative) :
${datesGuidance}

CONTEXTE ENTREPRISE CIBLE :
${JSON.stringify(company, null, 2)}
${recipientBlock}
${scoringNote}

${sectorWritingGuide(student.targetSector, student.targetRole, company.sector)}

Génère le package de candidature spontanée SPÉCIFIQUE à cette entreprise : relie son secteur/activité au profil vérifié par un angle concret et DIFFÉRENT des autres entreprises, intègre le poste visé, le rythme et le type de contrat, et respecte la CONSIGNE DATES. Réponds avec l'objet JSON demandé.`
}

/** Normalisation défensive d'un package généré. */
export function normalizePackage(g: GenResult | null): GenResult {
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

/**
 * Un appel Claude pour une entreprise. Renvoie null si la réponse est
 * inexploitable — on ne persiste JAMAIS un package vide.
 */
export async function generatePackage(
  student: StudentContext,
  company: CompanyTarget,
  datesGuidance: string,
  recipient?: RecipientContext,
): Promise<GenResult | null> {
  try {
    const response = await anthropic.messages.create({
      model: WRITING_MODEL,
      // Large marge : package complet (email + lettre + LinkedIn + CV) plus la
      // réflexion éventuelle d'un modèle récent, sans troncature du JSON.
      max_tokens: 8000,
      system: GENERATE_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(student, buildCompanyContext(company), datesGuidance, recipient),
        },
      ],
    })
    const raw = textOf(response)
    const parsed = parseJsonResponse<GenResult>(raw)
    if (!parsed) return null

    const pkg = normalizePackage(parsed)
    // Contenu vide = échec, même si le JSON était valide.
    if (!pkg.email_subject && !pkg.email_body && !pkg.motivation_letter) return null
    return pkg
  } catch (e) {
    console.error("[application-generator] Claude error:", company.id, e)
    return null
  }
}

// ── Contexte étudiant ─────────────────────────────────────────────────────────

export interface LoadedStudentContext {
  student: StudentContext
  datesGuidance: string
  personalization: PersonalizationSources
  profile: CandidateMasterProfile | null
  /** « Prénom Nom » — sert à nommer le CV joint et l'expéditeur Gmail. */
  displayName: string
}

/**
 * Fusionne objectif de recherche > profil inscrit (profiles) > CV maître.
 * Lecture défensive de `profiles` : colonnes absentes ou vides tolérées.
 */
export async function loadStudentContext(
  sb: SupabaseClient,
  userId: string | null,
  options: {
    profileId?: string
    objective?: Partial<AutopilotObjective> & Record<string, string>
    studentFirstName?: string
  },
): Promise<LoadedStudentContext> {
  const { profileId, objective, studentFirstName } = options

  // CV maître vérifié.
  let profile: CandidateMasterProfile | null = null
  {
    let q = sb.from("candidate_master_profiles").select("*")
    if (userId) q = q.eq("user_id", userId)
    if (profileId) q = q.eq("id", profileId)
    else q = q.order("created_at", { ascending: false })
    const { data } = await q.limit(1).maybeSingle()
    profile = (data as CandidateMasterProfile) ?? null
  }

  // Profil inscrit — best-effort, ne bloque JAMAIS.
  let userProfile: Record<string, unknown> | null = null
  if (userId) {
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle()
    if (error) console.error("[application-generator] profiles fetch error:", error)
    userProfile = (data as Record<string, unknown>) ?? null
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
  // Compétences déclarées sur /profil — seule source quand aucun CV maître n'a
  // été analysé (parcours « Continuer sans CV »). Saisies par l'étudiant.
  const profileSkills = pstr("competences")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const student: StudentContext = {
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

  const personalization: PersonalizationSources = {
    studentProfile: Boolean(
      firstName || lastName || school || educationLevel || presentation ||
        targetSector || targetRegion || email || profileSkills.length > 0,
    ),
    masterCv: Boolean(
      profile &&
        ((profile.verified_experiences?.length ?? 0) > 0 ||
          (profile.verified_skills?.length ?? 0) > 0 ||
          (profile.education?.length ?? 0) > 0 ||
          (profile.tools?.length ?? 0) > 0),
    ),
    companyTarget: true,
    searchObjective: Boolean(obj.poste || obj.secteur || obj.ville || obj.region),
  }

  return {
    student,
    datesGuidance: buildDatesGuidance(startDate, duration),
    personalization,
    profile,
    displayName: [firstName, lastName].filter(Boolean).join(" "),
  }
}

// ── Persistance ───────────────────────────────────────────────────────────────

export interface PersistedPackage {
  id: string | null
  status: string
  follow_up_date: string
  created_at: string
}

/**
 * Insère le package dans application_packages + trace l'événement.
 * `eventNote` distingue une génération manuelle d'une génération par l'agent.
 */
export async function persistPackage(
  sb: SupabaseClient,
  userId: string,
  company: CompanyTarget,
  pkg: GenResult,
  eventNote = "Candidature générée par Alternia Autopilot",
): Promise<PersistedPackage> {
  const followUp = new Date(Date.now() + FOLLOW_UP_DAYS * 86_400_000).toISOString()

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

  if (insErr) console.error("[application-generator] insert package error:", company.id, insErr)

  if (inserted?.id) {
    const { error: evErr } = await sb.from("application_events").insert({
      user_id: userId,
      application_package_id: inserted.id,
      event_type: "generated",
      note: eventNote,
      metadata: {
        company_name: company.company_name,
        match_score: company.match_score,
        priority: company.priority,
      },
    })
    if (evErr) console.error("[application-generator] insert event error:", inserted.id, evErr)
  }

  return {
    id: inserted?.id ?? null,
    status: (inserted?.status as string) ?? "ready",
    follow_up_date: (inserted?.follow_up_date as string) ?? followUp,
    created_at: (inserted?.created_at as string) ?? new Date().toISOString(),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Réponse à une offre publiée
//
// Répondre à une offre n'a rien à voir avec une candidature spontanée : ici
// l'entreprise a écrit ce qu'elle cherche. Le message doit s'y accrocher, le CV
// doit reprendre le vocabulaire de l'annonce (les ATS filtrent là-dessus), et
// l'étudiant doit savoir AVANT d'envoyer ce qui colle et ce qui manque.
// ═══════════════════════════════════════════════════════════════════════════

export const OFFER_SYSTEM = `Tu rédiges la candidature d'un étudiant français à une OFFRE D'ALTERNANCE RÉELLEMENT PUBLIÉE. Tu disposes du CONTEXTE ÉTUDIANT (profil inscrit + CV vérifié) et du TEXTE INTÉGRAL DE L'OFFRE.

INTERDICTIONS ABSOLUES (toute invention disqualifie la candidature) :
- N'invente JAMAIS une expérience, une compétence, un outil, un diplôme, une école, une date, un chiffre ou un résultat. Uniquement ce qui figure dans le contexte étudiant.
- Ne prétends JAMAIS maîtriser une compétence exigée par l'offre si elle est absente du profil. Si elle manque, soit tu n'en parles pas, soit tu l'assumes comme un axe d'apprentissage — jamais comme un acquis.
- N'invente JAMAIS le nom d'un recruteur. Si aucun contact n'est fourni, utilise « Madame, Monsieur, ».
- N'invente aucune date de disponibilité : respecte EXACTEMENT la CONSIGNE DATES.

ANALYSE D'ADÉQUATION (obligatoire, honnête) :
- matching_points : ce que l'étudiant possède VRAIMENT et que l'offre demande, en citant l'exigence de l'offre. Uniquement des correspondances réelles.
- gaps : ce que l'offre demande et que le profil n'a PAS. Sois franc — c'est ce qui permet à l'étudiant de décider et de préparer son entretien.
- fit_score : 0-100, sincère. Une offre exigeant 3 ans d'expérience pour un profil sans expérience doit descendre bas, même si le domaine correspond.

E-MAIL (email_body) — court, spécifique, jamais un modèle :
1. Nomme l'offre (intitulé) et l'entreprise dès la première phrase.
2. Relie DEUX ou TROIS exigences précises de l'annonce à des éléments réels du profil.
3. Reste sobre sur ce qui manque : ne t'excuse pas, ne le souligne pas.
4. Disponibilité selon la CONSIGNE DATES, puis demande d'échange et formule de politesse.
Bannis les formules creuses (« votre entreprise dynamique », « je suis très motivé »). Pas d'empilement de faits façon liste.

CV ADAPTÉ (generated_cv_text) :
- Reprends le VOCABULAIRE EXACT de l'offre pour décrire des expériences qui existent déjà dans le profil (les ATS cherchent ces termes).
- Réorganise et reformule. N'ajoute AUCUNE ligne qui ne corresponde pas à une donnée vérifiée.
- Texte brut structuré en sections, prêt à copier.

LETTRE DE MOTIVATION (motivation_letter) : plus développée que l'e-mail, trois temps — pourquoi cette entreprise, pourquoi ce poste, ce que l'étudiant apporte concrètement. Même exigence de véracité.

MESSAGE PERSONNALISÉ (linkedin_message) : 500 caractères MAXIMUM, pour aborder un recruteur. Mentionne l'offre, un point d'accroche réel, une demande d'échange courte.

La pièce jointe CV accompagne l'e-mail : tu peux y faire référence une fois, sans insister.

SIGNATURE : construite uniquement avec les données fournies (Prénom Nom / niveau — école / email). N'invente aucune ligne.

Tu renvoies UNIQUEMENT un objet JSON valide (aucun texte autour) :
{
  "fit_score": 0-100,
  "matching_points": ["exigence de l'offre → élément réel du profil"],
  "gaps": ["exigence de l'offre absente du profil"],
  "email_subject": "Candidature — {intitulé exact de l'offre} — {niveau/formation}",
  "email_body": "e-mail court et spécifique à cette offre",
  "motivation_letter": "lettre de motivation complète et honnête",
  "linkedin_message": "message de 500 caractères maximum",
  "cv_adaptation_notes": "ce qu'il faut modifier dans le CV pour cette offre, et pourquoi",
  "highlighted_keywords": ["termes de l'offre à faire figurer dans le CV, compatibles avec le profil réel"],
  "generated_cv_text": "CV adapté, texte brut, aucune invention"
}`

/** Offre telle que transmise au générateur — indépendante de la source. */
export interface OfferInput {
  id: string
  source: string
  title: string
  company: string
  location: string
  contractLabel: string
  salary: string
  workingTime: string
  experience: string
  description: string
  skills: string[]
  sector: string
  url: string
  /** Contact publié par le recruteur dans l'annonce — jamais deviné. */
  contactEmail: string | null
  /** Lien de candidature fourni par l'annonce, quand il n'y a pas d'email. */
  applyUrl: string | null
}

export interface OfferGenResult extends GenResult {
  fit_score: number
  matching_points: string[]
  gaps: string[]
}

function normalizeOfferPackage(g: Partial<OfferGenResult> | null): OfferGenResult {
  const base = normalizePackage(g as GenResult | null)
  const score = Number(g?.fit_score)
  return {
    ...base,
    fit_score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    matching_points: Array.isArray(g?.matching_points)
      ? g.matching_points.filter((k): k is string => typeof k === "string")
      : [],
    gaps: Array.isArray(g?.gaps) ? g.gaps.filter((k): k is string => typeof k === "string") : [],
  }
}

/**
 * Rédige la candidature complète pour une offre : e-mail, lettre, message
 * personnalisé, CV adapté et analyse d'adéquation.
 * Renvoie null si la réponse est inexploitable — on ne persiste jamais un vide.
 */
export async function generateForOffer(
  student: StudentContext,
  offer: OfferInput,
  datesGuidance: string,
  recipient?: RecipientContext,
): Promise<OfferGenResult | null> {
  // Une annonce très longue ferait exploser le contexte sans rien apporter :
  // l'essentiel (missions, profil recherché) tient dans les premiers milliers
  // de caractères.
  const offerForPrompt = { ...offer, description: offer.description.slice(0, 6000) }

  const recipientBlock =
    recipient?.fullName || recipient?.jobTitle
      ? `DESTINATAIRE IDENTIFIÉ (donnée réelle — ne l'altère pas, n'en invente pas d'autre) :\n${JSON.stringify(recipient, null, 2)}`
      : `DESTINATAIRE : inconnu. Utilise « Madame, Monsieur, », n'invente AUCUN nom.`

  const prompt = `CONTEXTE ÉTUDIANT (seule source autorisée sur son parcours — n'invente rien au-delà) :
${JSON.stringify(student, null, 2)}

CONSIGNE DATES (impérative) :
${datesGuidance}

OFFRE PUBLIÉE À LAQUELLE IL CANDIDATE :
${JSON.stringify(offerForPrompt, null, 2)}

${recipientBlock}

${sectorWritingGuide(student.targetSector, student.targetRole, offer.sector, offer.title)}

Analyse honnêtement l'adéquation, puis rédige la candidature complète pour CETTE offre. Réponds avec l'objet JSON demandé.`

  try {
    const response = await anthropic.messages.create({
      model: WRITING_MODEL,
      // Plus large que la candidature spontanée : le CV adapté et l'analyse
      // d'adéquation s'ajoutent à l'e-mail, à la lettre et au message.
      max_tokens: 10000,
      system: OFFER_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    })
    const raw = textOf(response)
    const parsed = parseJsonResponse<Partial<OfferGenResult>>(raw)
    if (!parsed) return null

    const pkg = normalizeOfferPackage(parsed)
    if (!pkg.email_subject && !pkg.email_body && !pkg.motivation_letter) return null
    return pkg
  } catch (e) {
    console.error("[application-generator] offre — erreur Claude:", offer.id, e)
    return null
  }
}

/**
 * Persiste une candidature à une offre dans application_packages.
 * `offer_snapshot` garde une copie de l'annonce : une offre disparaît vite du
 * site d'origine, l'étudiant doit pouvoir la relire avant son entretien.
 */
export async function persistOfferPackage(
  sb: SupabaseClient,
  userId: string,
  offer: OfferInput,
  pkg: OfferGenResult,
  options: { sessionId?: string | null; eventNote?: string } = {},
): Promise<PersistedPackage> {
  const followUp = new Date(Date.now() + FOLLOW_UP_DAYS * 86_400_000).toISOString()

  const { data: inserted, error: insErr } = await sb
    .from("application_packages")
    .insert({
      user_id: userId,
      company_target_id: null,
      status: "ready",
      source: "offre",
      offer_id: offer.id,
      offer_title: offer.title,
      offer_company: offer.company,
      offer_location: offer.location,
      offer_url: offer.url,
      offer_source: offer.source,
      offer_snapshot: offer,
      session_id: options.sessionId ?? null,
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

  if (insErr) console.error("[application-generator] insert offre:", offer.id, insErr)

  if (inserted?.id) {
    const { error: evErr } = await sb.from("application_events").insert({
      user_id: userId,
      application_package_id: inserted.id,
      event_type: "generated_offer",
      note: options.eventNote ?? "Candidature préparée pour une offre publiée",
      metadata: {
        offer_id: offer.id,
        offer_title: offer.title,
        offer_company: offer.company,
        offer_source: offer.source,
        fit_score: pkg.fit_score,
        gaps: pkg.gaps,
      },
    })
    if (evErr) console.error("[application-generator] event offre:", inserted.id, evErr)
  }

  return {
    id: inserted?.id ?? null,
    status: (inserted?.status as string) ?? "ready",
    follow_up_date: (inserted?.follow_up_date as string) ?? followUp,
    created_at: (inserted?.created_at as string) ?? new Date().toISOString(),
  }
}
