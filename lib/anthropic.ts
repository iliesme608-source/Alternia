import Anthropic from "@anthropic-ai/sdk"

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODEL = "claude-haiku-4-5-20251001"

/**
 * Modèle des textes que l'étudiant ENVOIE (candidatures, prospection,
 * relances, LinkedIn). La qualité d'écriture y compte plus que partout
 * ailleurs : ANTHROPIC_WRITING_MODEL permet d'y mettre un modèle plus fort
 * (ex. claude-sonnet-5-5) sans toucher au reste de l'app.
 */
export const WRITING_MODEL = process.env.ANTHROPIC_WRITING_MODEL?.trim() || MODEL

/**
 * Texte d'une réponse Claude. Les modèles récents peuvent renvoyer d'abord un
 * bloc de réflexion (`thinking`) : lire `content[0]` ne suffit donc pas.
 */
export function textOf(response: Anthropic.Message, fallback = ""): string {
  const parts = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text")
  return parts.length ? parts.map((b) => b.text).join("") : fallback
}
