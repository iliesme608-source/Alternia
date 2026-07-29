import type { EntrepriseProspect } from "@/types"

// ── Statuts de suivi (7) ──────────────────────────────────────────────────────

export type SuiviStatut =
  | "Prête"
  | "Envoyée"
  | "Relance à faire"
  | "Entretien"
  | "Refus"
  | "Accepté"
  | "Archivée"

export const SUIVI_STATUTS: SuiviStatut[] = [
  "Prête",
  "Envoyée",
  "Relance à faire",
  "Entretien",
  "Refus",
  "Accepté",
  "Archivée",
]

/** Classes Tailwind du badge de chaque statut — une couleur distincte par statut. */
export const SUIVI_STATUT_CLASSES: Record<SuiviStatut, string> = {
  "Prête":           "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
  "Envoyée":         "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "Relance à faire": "bg-orange-500/10 text-orange-400 border border-orange-500/25",
  "Entretien":       "bg-violet-500/10 text-violet-400 border border-violet-500/25",
  "Refus":           "bg-red-500/10 text-red-400 border border-red-500/20",
  "Accepté":         "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  "Archivée":        "bg-zinc-800/60 text-zinc-500 border border-white/[0.06]",
}

/** Pastille de couleur (filtres, points) par statut. */
export const SUIVI_STATUT_DOT: Record<SuiviStatut, string> = {
  "Prête":           "#71717A",
  "Envoyée":         "#3B82F6",
  "Relance à faire": "#EA580C",
  "Entretien":       "#7C3AED",
  "Refus":           "#EF4444",
  "Accepté":         "#22C55E",
  "Archivée":        "#3F3F46",
}

export function isSuiviStatut(v: unknown): v is SuiviStatut {
  return typeof v === "string" && (SUIVI_STATUTS as string[]).includes(v)
}

/**
 * Correspondance vers le statut historique stocké dans entreprises[].statut
 * (utilisé par le Kanban /candidatures). On ne casse pas l'existant : chaque
 * statut de suivi retombe sur une des 4 valeurs déjà connues.
 */
export const LEGACY_FROM_SUIVI: Record<SuiviStatut, EntrepriseProspect["statut"]> = {
  "Prête":           "en_attente",
  "Envoyée":         "envoye",
  "Relance à faire": "envoye",
  "Entretien":       "repondu",
  "Refus":           "sans_suite",
  "Accepté":         "repondu",
  "Archivée":        "sans_suite",
}

// ── Email : découpage objet / corps + liens d'envoi ────────────────────────────

/**
 * Sépare l'objet du corps d'un email généré.
 * Reconnaît une première ligne « Objet : … » (avec ou sans accent/deux-points).
 */
export function parseEmail(raw: string, fallbackObjet = ""): { objet: string; corps: string } {
  const text = (raw ?? "").trim()
  if (!text) return { objet: fallbackObjet, corps: "" }

  const lines = text.split(/\r?\n/)
  const first = lines[0].trim()
  const match = first.match(/^objet\s*:?\s*(.+)$/i)

  if (match) {
    return {
      objet: match[1].trim(),
      corps: lines.slice(1).join("\n").trim(),
    }
  }
  return { objet: fallbackObjet, corps: text }
}

/** Lien de composition Gmail (nouvel onglet) — objet et corps encodés. */
export function gmailUrl(objet: string, corps: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=&su=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`
}

/** Lien mailto: pour la messagerie par défaut de l'utilisateur. */
export function mailtoUrl(objet: string, corps: string): string {
  return `mailto:?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`
}

/** Texte complet copié dans le presse-papier (objet + corps). */
export function fullEmailText(objet: string, corps: string): string {
  return objet ? `Objet : ${objet}\n\n${corps}` : corps
}

/** URL de la fiche officielle annuaire-entreprises — null si SIREN invalide. */
export function annuaireUrl(siren?: string | null): string | null {
  const s = (siren ?? "").replace(/\s/g, "")
  return /^\d{9}$/.test(s) ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${s}` : null
}
