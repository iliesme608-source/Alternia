-- ============================================================
-- AlternaAI — Champs profil utilisés par la personnalisation des emails
-- À exécuter dans Supabase > SQL Editor.
--
-- Additive uniquement : aucun DROP, aucune colonne existante modifiée.
-- Rejouable sans erreur.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS poste_recherche       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rythme                TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS competences           TEXT;

-- Colonnes déjà utilisées par /profil (créées ici si elles manquent).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_debut_alternance TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS duree_alternance      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS presentation          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url            TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ DEFAULT now();
