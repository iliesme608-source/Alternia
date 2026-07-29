import { NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase"

/**
 * Résout l'utilisateur à partir du header Authorization: Bearer <token>.
 * Renvoie null si absent / invalide. Même pattern que app/api/prospection.
 */
export async function resolveUserId(request: NextRequest): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "").trim()
  if (!token) return null
  const {
    data: { user },
  } = await createServerClient().auth.getUser(token)
  return user?.id ?? null
}

/**
 * Prompt système partagé — garde-fou anti-invention.
 * L'IA ne peut QUE reformuler / prioriser / adapter des informations vérifiées.
 */
export const AUTOPILOT_SYSTEM_PROMPT = `Tu es un assistant expert en recherche d'alternance en France. Tu aides un étudiant à générer une candidature personnalisée. Tu n'as pas le droit d'inventer une expérience, une compétence, une école, un diplôme ou un outil. Tu peux uniquement reformuler, prioriser et adapter les informations vérifiées. La candidature doit être spécifique à l'entreprise, naturelle, concise, professionnelle et crédible. L'objectif est d'augmenter les chances d'obtenir une réponse sans jamais produire une candidature mensongère.`

/**
 * Répare un JSON tronqué (réponse Claude coupée par max_tokens) : coupe après le
 * dernier objet/tableau complet, puis referme les crochets/accolades restés ouverts
 * (en ignorant ceux à l'intérieur des chaînes). Renvoie null si irrécupérable.
 */
function closeTruncatedJson(text: string): string | null {
  const lastClose = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"))
  if (lastClose === -1) return null
  let s = text.slice(0, lastClose + 1) // exclut un éventuel objet incomplet + sa virgule
  const stack: string[] = []
  let inStr = false
  let esc = false
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === "{" || ch === "[") stack.push(ch)
    else if (ch === "}" || ch === "]") stack.pop()
  }
  while (stack.length) s += stack.pop() === "{" ? "}" : "]"
  return s
}

/**
 * Extrait le premier bloc JSON d'une réponse Claude (robuste aux ```json … ```,
 * au texte parasite autour ET aux réponses tronquées par max_tokens).
 * Renvoie null si le parse échoue définitivement.
 */
export function parseJsonResponse<T>(raw: string): T | null {
  if (!raw) return null
  let text = raw.trim()
  // Retire les fences markdown éventuelles
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  // Isole à partir du premier { ou [
  if (text[0] !== "{" && text[0] !== "[") {
    const start = text.search(/[{[]/)
    if (start !== -1) text = text.slice(start)
  }

  const tryParse = (s: string): T | null => {
    try { return JSON.parse(s) as T } catch { return null }
  }

  // 1. Tentative directe.
  const direct = tryParse(text)
  if (direct !== null) return direct

  // 2. Coupe au dernier } ou ] (retire un éventuel texte de fin).
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"))
  if (end !== -1) {
    const sliced = tryParse(text.slice(0, end + 1))
    if (sliced !== null) return sliced
  }

  // 3. Répare une réponse tronquée (JSON coupé par max_tokens).
  const repaired = closeTruncatedJson(text)
  if (repaired) {
    const r = tryParse(repaired)
    if (r !== null) return r
  }

  return null
}

// ── Filtrage des entreprises non viables ──────────────────────────────────────
// Partagé entre /score-companies (filtre les résultats fraîchement scorés) et
// /search-companies (écarte les entreprises déjà scorées « pas viable » lors
// d'une recherche précédente et toujours présentes dans company_targets).

/** Seuil de pertinence. L'échelle interne est 0-100 : « 3/10 » vaut donc 30. */
export const MIN_SCORE = 30

/** Minuscules + accents retirés, pour comparer les intitulés de poste. */
export function normalizeRole(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

// Formulations par lesquelles le modèle signale qu'aucun poste ne correspond.
const NO_ROLE_PATTERNS: RegExp[] = [
  /pas viable/,
  /non viable/,
  /non applicable/,
  /^n\.?\/?a\.?$/,
  /aucune?\s+(role|poste|fonction|opportunite|correspondance|piste)/,
  /pas\s+(de|d')\s*(role|poste|fonction)/,
  /non\s+(pertinent|concerne|adapte|identifie)/,
  /sans\s+(objet|correspondance)/,
  /inadapte/,
  /incertain/,
  /taille insuffisante/,
  /structure trop petite/,
  /secteur non/,
  /^(aucun|aucune|neant|rien|non|-{1,2}|—|\.{1,3})$/,
]

// Intitulés non négatifs mais trop vagues pour compter comme « poste concret ».
const VAGUE_ROLES = new Set([
  "alternance", "stage", "poste", "emploi", "a definir", "a preciser",
  "variable", "divers", "indetermine", "inconnu", "non precise",
])

/** Règle 1 — l'intitulé indique qu'aucun poste correspondant n'existe. */
export function isNoRole(role: string): boolean {
  const r = normalizeRole(role)
  if (!r) return true
  return NO_ROLE_PATTERNS.some((re) => re.test(r))
}

/** Règle 2 — intitulé concret et positif (« Data Analyst », « Chargé de reporting »…). */
export function isConcreteRole(role: string): boolean {
  const r = normalizeRole(role)
  if (isNoRole(role) || VAGUE_ROLES.has(r)) return false
  return r.length >= 3 && /[a-z]/.test(r)
}

/** Règles 1 + 2 réunies : l'entreprise mérite-t-elle d'être retournée ? */
export function isRetained(c: { match_score: number; possible_role: string }): boolean {
  if (isNoRole(c.possible_role)) return false
  return c.match_score >= MIN_SCORE || isConcreteRole(c.possible_role)
}

/**
 * Variante pour les lignes company_targets déjà en base : ne rejette QUE les
 * entreprises explicitement marquées non viables par un scoring précédent.
 * Un possible_role vide signifie « pas encore scorée » — on ne préjuge pas.
 */
export function isNonViableRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role ?? "")
  if (!r) return false
  return NO_ROLE_PATTERNS.some((re) => re.test(r))
}
