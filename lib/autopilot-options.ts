/**
 * Options des formulaires Autopilot.
 *
 * Partagées par le wizard (étape 1) et le panneau de l'agent de démarchage :
 * les deux écrans doivent proposer exactement les mêmes secteurs, sinon un
 * objectif réglé d'un côté devient inexploitable de l'autre.
 *
 * Les libellés de secteur servent de clé au mapping NAF de lib/company-search —
 * ne les renomme pas sans mettre ce mapping à jour.
 */

export const SECTEURS = [
  "Informatique / Tech",
  "Data & IA",
  "Commerce / Marketing",
  "Finance / Comptabilité",
  "RH / Management",
  "Communication / Média",
  "Ingénierie / Industrie",
  "Santé / Social",
  "Droit / Juridique",
] as const

export const NIVEAUX = [
  "BTS", "BUT", "Bachelor", "Licence", "Master 1", "Master 2", "Master", "Autre",
] as const

export const CONTRATS = [
  { value: "apprentissage", label: "Apprentissage" },
  { value: "professionnalisation", label: "Professionnalisation" },
  { value: "les_deux", label: "Les deux" },
] as const

/** Nombre de candidatures proposé à l'étape 1 du wizard. */
export const NB_OPTIONS = [5, 10, 20] as const
