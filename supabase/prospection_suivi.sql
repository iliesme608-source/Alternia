-- ============================================================
-- AlternaAI — Suivi des candidatures (prospection)
-- À exécuter dans Supabase > SQL Editor.
--
-- Additive uniquement : aucun DROP, aucune colonne existante modifiée.
-- Rejouable sans erreur.
-- ============================================================

-- Statut de suivi au niveau campagne (défaut « Prête »).
-- Le statut par candidature est stocké dans entreprises[].statut_suivi (JSONB).
ALTER TABLE prospection_campagnes
  ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'Prête';

-- Backfill des campagnes déjà enregistrées.
UPDATE prospection_campagnes SET statut = 'Prête' WHERE statut IS NULL;
