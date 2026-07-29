export interface User {
  id: string
  email: string
  nom: string
  prenom: string
  ecole: string
  niveau: string // "BTS" | "Bachelor" | "Master" | "Autre"
  secteur: string
  region: string
  created_at: string
}

export interface EntretienFeedback {
  point_fort: string
  a_ameliorer: string
  conseil: string
}

export interface EntretienResumeFinal {
  score_global: number
  scores_axes: {
    communication: number
    pertinence: number
    structure: number
    vocabulaire: number
    confiance: number
  }
  points_forts: string[]
  axes_amelioration: string[]
  conseil_final: string
  verdict: string
}

export interface EntretienSession {
  id: string
  user_id: string
  entreprise: string
  poste: string
  messages: Message[]
  score: number | null
  created_at: string
}

export interface Message {
  role: "assistant" | "user"
  content: string
  feedback?: EntretienFeedback
  score?: number | null
  timestamp: string
}

export interface CVAdaptation {
  id: string
  user_id: string
  cv_original: string
  fiche_poste: string
  cv_adapte: string
  score_ats: number
  score_ats_avant?: number
  mots_cles_ajoutes: string[]
  mots_cles_manquants: string[]
  suggestions?: string[]
  resume_modifications?: string
  created_at: string
}

export interface ProspectionCampagne {
  id: string
  user_id: string
  entreprises: EntrepriseProspect[]
  secteur: string
  region: string
  created_at: string
}

export interface EntrepriseProspect {
  siret: string
  nom: string
  secteur: string
  ville: string
  taille: string
  email_genere: string
  statut: "en_attente" | "envoye" | "repondu" | "sans_suite"
  // Données SIRENE complémentaires (optionnelles — absentes des anciennes campagnes).
  siren?: string
  naf_code?: string
  code_postal?: string
  // Statut de suivi (7 valeurs, cf. lib/suivi.ts) — optionnel pour rétrocompatibilité.
  statut_suivi?: string
  poste?: string
}

/** Une candidature à plat, telle que renvoyée par /api/prospection/list. */
export interface CandidatureSuivi {
  id: string            // `${campagne_id}::${siret}`
  campagne_id: string
  siret: string
  siren: string | null
  naf_code: string | null
  entreprise: string
  poste: string
  secteur: string
  ville: string
  taille: string
  email_genere: string
  statut: string        // SuiviStatut
  created_at: string
}

// ── Alternia Autopilot (Agent Candidature — Sarah) ──────────────────────────────

// Objectif de recherche renseigné par l'étudiant (étape 1 du wizard).
export interface AutopilotObjective {
  poste: string
  secteur: string
  region: string
  ville: string
  niveau: string
  rythme: string          // ex. "3 semaines entreprise / 1 semaine école"
  date_debut: string      // ISO ou libre
  duree: string           // ex. "12 mois", "24 mois"
  type_contrat: "apprentissage" | "professionnalisation" | "les_deux"
  nombre_candidatures: 5 | 10 | 20
}

// Sous-objets du profil candidat maître (données VÉRIFIÉES uniquement).
export interface VerifiedExperience {
  poste: string
  entreprise: string
  periode: string
  description: string
}

export interface EducationEntry {
  diplome: string
  etablissement: string
  annee: string
}

// candidate_master_profiles
export interface CandidateMasterProfile {
  id: string
  user_id: string
  cv_original_text: string
  verified_experiences: VerifiedExperience[]
  verified_skills: string[]
  education: EducationEntry[]
  tools: string[]
  target_roles: string[]
  constraints: Partial<AutopilotObjective>
  created_at: string
  updated_at: string
}

export type CompanyPriority = "high" | "medium" | "low"

// company_targets
export interface CompanyTarget {
  id: string
  user_id: string
  company_name: string
  siren: string | null
  siret: string | null
  city: string | null
  region: string | null
  sector: string | null
  naf_code: string | null
  employee_range: string | null
  website: string | null
  source: string
  match_score: number | null
  match_reason: string
  priority: CompanyPriority | null
  recommended_angle: string
  possible_role: string
  created_at: string
}

export type ApplicationStatus =
  | "ready"
  | "sent"
  | "follow_up"
  | "interview"
  | "rejected"
  | "accepted"
  | "archived"

// application_packages
export interface ApplicationPackage {
  id: string
  user_id: string
  company_target_id: string | null
  status: ApplicationStatus
  email_subject: string
  email_body: string
  motivation_letter: string
  linkedin_message: string
  cv_adaptation_notes: string
  highlighted_keywords: string[]
  generated_cv_text: string
  follow_up_date: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

// application_events
export interface ApplicationEvent {
  id: string
  user_id: string
  application_package_id: string | null
  event_type: string
  note: string
  metadata: Record<string, unknown>
  created_at: string
}

export type AutopilotFrequency = "daily" | "weekly" | "manual"

// autopilot_rules (Niveau 2 — préparé, non automatisé)
export interface AutopilotRule {
  id: string
  user_id: string
  is_active: boolean
  target_role: string
  allowed_sectors: string[]
  allowed_regions: string[]
  max_applications_per_day: number
  minimum_match_score: number
  require_validation: boolean
  frequency: AutopilotFrequency
  created_at: string
  updated_at: string
}
