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
}
