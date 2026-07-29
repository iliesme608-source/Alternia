-- ============================================================
-- Alternia Autopilot — Migration additive
-- company_targets : statut de suivi par entreprise (Autopilot étape 3)
--
-- Additive uniquement : aucun DROP, aucune modification de colonne
-- existante, aucune suppression de policy. Rejouable sans erreur.
-- ============================================================

-- 1. Colonne de suivi (défaut : « à contacter »).
ALTER TABLE company_targets
  ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'a_contacter';

-- 2. Contrainte CHECK sur les 4 valeurs autorisées.
--    Ajout idempotent SANS DROP : on ne l'ajoute que si elle n'existe pas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_targets_tracking_status_check'
  ) THEN
    ALTER TABLE company_targets
      ADD CONSTRAINT company_targets_tracking_status_check
      CHECK (tracking_status IN ('a_contacter', 'contactee', 'reponse_recue', 'entretien'));
  END IF;
END $$;
