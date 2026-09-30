import type { VercelConfig } from "@vercel/config/v1"

/**
 * Configuration Vercel d'Alternia.
 *
 * Le cron déclenche l'agent de démarchage nocturne : chaque nuit à 1 h UTC
 * (≈ 2 h / 3 h à Paris selon la saison), /api/autopilot/agent/run passe sur les
 * étudiants ayant activé l'agent. Chacun garde sa propre fenêtre horaire dans
 * autopilot_rules — l'agent saute ceux qui sont hors fenêtre.
 *
 * ⚠️ Deux variables d'environnement sont indispensables côté Vercel :
 *   CRON_SECRET  — Vercel l'envoie en `Authorization: Bearer`. Sans elle, la
 *                  route refuse l'appel cron (un endpoint d'envoi d'emails ne
 *                  doit jamais être ouvert).
 *   NEXT_PUBLIC_APP_URL — base de l'URL de redirection OAuth Gmail.
 *
 * Note : le plan Hobby n'autorise qu'un passage de cron par jour.
 */
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    {
      path: "/api/autopilot/agent/run",
      schedule: "0 1 * * *",
    },
  ],
}

export default config
