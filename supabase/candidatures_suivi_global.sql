-- ============================================================
-- AlternaAI — Suivi global des candidatures (/candidatures)
-- À exécuter dans Supabase > SQL Editor.
--
-- Additive uniquement : aucun DROP, aucune colonne existante modifiée,
-- aucune policy touchée. Rejouable sans erreur.
--
-- Contexte : company_targets.tracking_status ne connaît que 4 valeurs
-- (a_contacter / contactee / reponse_recue / entretien), alors que le suivi
-- global en utilise 7 (cf. lib/suivi.ts). On ajoute une colonne libre
-- statut_suivi qui porte le statut complet ; tracking_status continue d'être
-- mis à jour en parallèle pour ne rien casser côté Autopilot.
-- ============================================================

-- Statut de suivi complet (7 valeurs, cf. lib/suivi.ts).
-- Pas de contrainte CHECK : la liste peut évoluer côté app sans migration.
ALTER TABLE company_targets
  ADD COLUMN IF NOT EXISTS statut_suivi TEXT DEFAULT 'Prête';

-- Backfill depuis tracking_status pour les entreprises déjà enregistrées.
UPDATE company_targets
SET statut_suivi = CASE tracking_status
  WHEN 'a_contacter'   THEN 'Prête'
  WHEN 'contactee'     THEN 'Envoyée'
  WHEN 'reponse_recue' THEN 'Relance à faire'
  WHEN 'entretien'     THEN 'Entretien'
  ELSE 'Prête'
END
WHERE statut_suivi IS NULL;
