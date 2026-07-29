-- ============================================================
-- Alternia Autopilot — Migration corrective
-- company_targets : priority en anglais + colonnes angle/role
--
-- À exécuter UNIQUEMENT si autopilot.sql a DÉJÀ été appliqué
-- avec l'ancienne contrainte priority IN ('haute','moyenne','faible').
-- Idempotent : rejouable sans erreur.
-- ============================================================

-- 1. Convertit les valeurs françaises existantes en anglais (si présentes).
UPDATE company_targets
SET priority = CASE priority
  WHEN 'haute'   THEN 'high'
  WHEN 'moyenne' THEN 'medium'
  WHEN 'faible'  THEN 'low'
  ELSE priority
END
WHERE priority IN ('haute', 'moyenne', 'faible');

-- 2. Remplace la contrainte CHECK (français → anglais) et retire l'ancien default.
ALTER TABLE company_targets DROP CONSTRAINT IF EXISTS company_targets_priority_check;
ALTER TABLE company_targets ALTER COLUMN priority DROP DEFAULT;
ALTER TABLE company_targets
  ADD CONSTRAINT company_targets_priority_check CHECK (priority IN ('high', 'medium', 'low'));

-- 3. Ajoute les colonnes de scoring persistées (si absentes).
ALTER TABLE company_targets ADD COLUMN IF NOT EXISTS recommended_angle TEXT DEFAULT '';
ALTER TABLE company_targets ADD COLUMN IF NOT EXISTS possible_role     TEXT DEFAULT '';
