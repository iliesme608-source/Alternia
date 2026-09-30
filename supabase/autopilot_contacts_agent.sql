-- ============================================================
-- Alternia Autopilot — Contacts décideurs + Agent de démarchage
-- À exécuter dans Supabase > SQL Editor (une seule fois).
--
-- Additive uniquement : aucun DROP de table, aucune colonne existante
-- modifiée. Rejouable sans erreur.
--
-- Contenu :
--   1. company_contacts    — décideurs / adresses de contact par entreprise
--   2. candidate_cv_files  — le CV de l'étudiant, joint à chaque candidature
--   3. autopilot_rules     — colonnes de pilotage de l'agent nocturne
--   4. autopilot_runs      — journal des exécutions de l'agent
-- ============================================================


-- ============================================================
-- Prérequis — supabase/autopilot.sql doit avoir été exécuté avant (les tables
-- company_targets / autopilot_rules référencées ci-dessous en viennent).
-- Le helper de trigger est recréé ici pour que ce fichier reste rejouable seul.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ============================================================
-- 1. company_contacts
--    Un contact = soit un dirigeant officiel (registre RNE, via
--    recherche-entreprises.api.gouv.fr), soit une adresse de contact
--    construite sur un domaine vérifié par DNS.
--
--    `source` dit TOUJOURS d'où vient l'info — l'UI l'affiche telle quelle,
--    pour qu'un email hypothétique ne soit jamais pris pour un email confirmé :
--      registre_officiel : nom + fonction issus du registre public (fiable)
--      email_generique   : adresse type (recrutement@, rh@…) sur domaine MX vérifié
--      email_nominatif   : prenom.nom@domaine — CONVENTION, à vérifier
--      saisie_etudiant   : adresse saisie/confirmée à la main par l'étudiant
-- ============================================================

CREATE TABLE IF NOT EXISTS company_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_target_id UUID NOT NULL REFERENCES company_targets(id) ON DELETE CASCADE,

  full_name         TEXT DEFAULT '',          -- vide pour une adresse générique
  job_title         TEXT DEFAULT '',          -- « Directeur Général », « Responsable RH »…
  email             TEXT DEFAULT '',
  domain            TEXT DEFAULT '',          -- domaine retenu, vérifié par enregistrement MX
  linkedin_search   TEXT DEFAULT '',          -- URL de recherche pré-remplie (jamais un faux profil)

  source            TEXT NOT NULL DEFAULT 'email_generique'
                      CHECK (source IN (
                        'registre_officiel', 'email_generique',
                        'email_nominatif', 'saisie_etudiant'
                      )),

  -- Fiabilité de l'email : 'confirme' uniquement si l'étudiant l'a vérifié.
  email_status      TEXT NOT NULL DEFAULT 'hypothese'
                      CHECK (email_status IN ('hypothese', 'confirme', 'invalide')),

  -- Priorité de démarchage calculée (0-100) : qui contacter en premier.
  outreach_rank     INTEGER DEFAULT 50 CHECK (outreach_rank BETWEEN 0 AND 100),
  is_primary        BOOLEAN DEFAULT false NOT NULL,
  note              TEXT DEFAULT '',

  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_contacts_user
  ON company_contacts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_contacts_company
  ON company_contacts (company_target_id, outreach_rank DESC);

-- Un même email n'est stocké qu'une fois par entreprise et par étudiant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_contacts_email
  ON company_contacts (user_id, company_target_id, email)
  WHERE email <> '';

DROP TRIGGER IF EXISTS trg_company_contacts_updated_at ON company_contacts;
CREATE TRIGGER trg_company_contacts_updated_at
  BEFORE UPDATE ON company_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 2. candidate_cv_files
--    Le CV téléversé par l'étudiant, stocké en base64 pour être rattaché
--    en pièce jointe à CHAQUE candidature envoyée (manuelle ou par l'agent).
--    Un seul CV courant par étudiant (clé primaire = user_id).
-- ============================================================

CREATE TABLE IF NOT EXISTS candidate_cv_files (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4194304), -- 4 Mo max
  content_b64 TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_candidate_cv_files_updated_at ON candidate_cv_files;
CREATE TRIGGER trg_candidate_cv_files_updated_at
  BEFORE UPDATE ON candidate_cv_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 3. autopilot_rules — pilotage de l'agent de démarchage
--    La table existe déjà (supabase/autopilot.sql) : on ajoute uniquement
--    les colonnes dont l'agent a besoin.
-- ============================================================

-- Envoi réellement automatique. false = l'agent prépare, l'étudiant valide.
ALTER TABLE autopilot_rules ADD COLUMN IF NOT EXISTS auto_send         BOOLEAN DEFAULT false NOT NULL;
-- Joindre le CV à chaque email envoyé par l'agent.
ALTER TABLE autopilot_rules ADD COLUMN IF NOT EXISTS attach_cv         BOOLEAN DEFAULT true  NOT NULL;
-- Fenêtre d'envoi, en heures locales (22 → 7 = « pendant la nuit »).
ALTER TABLE autopilot_rules ADD COLUMN IF NOT EXISTS window_start_hour INTEGER DEFAULT 22 CHECK (window_start_hour BETWEEN 0 AND 23);
ALTER TABLE autopilot_rules ADD COLUMN IF NOT EXISTS window_end_hour   INTEGER DEFAULT 7  CHECK (window_end_hour   BETWEEN 0 AND 23);
ALTER TABLE autopilot_rules ADD COLUMN IF NOT EXISTS timezone          TEXT DEFAULT 'Europe/Paris' NOT NULL;
-- Objectif de recherche mémorisé, réutilisé à chaque passage de l'agent.
ALTER TABLE autopilot_rules ADD COLUMN IF NOT EXISTS objective         JSONB DEFAULT '{}'::jsonb NOT NULL;
-- Dernier passage + garde-fou : l'agent ne tourne qu'une fois par nuit.
ALTER TABLE autopilot_rules ADD COLUMN IF NOT EXISTS last_run_at       TIMESTAMPTZ;
-- Plafond global : au-delà, l'agent s'arrête même si le quota du jour le permet.
ALTER TABLE autopilot_rules ADD COLUMN IF NOT EXISTS total_send_cap    INTEGER DEFAULT 100 CHECK (total_send_cap BETWEEN 0 AND 2000);


-- ============================================================
-- 4. autopilot_runs — journal d'exécution (visible par l'étudiant)
-- ============================================================

CREATE TABLE IF NOT EXISTS autopilot_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_source    TEXT NOT NULL DEFAULT 'cron' CHECK (trigger_source IN ('cron', 'manuel')),
  status            TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'success', 'partial', 'skipped', 'error')),
  companies_found   INTEGER DEFAULT 0 NOT NULL,
  applications_made INTEGER DEFAULT 0 NOT NULL,
  emails_sent       INTEGER DEFAULT 0 NOT NULL,
  contacts_found    INTEGER DEFAULT 0 NOT NULL,
  cv_attached       BOOLEAN DEFAULT false NOT NULL,
  message           TEXT DEFAULT '',
  details           JSONB DEFAULT '[]'::jsonb NOT NULL,
  started_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_autopilot_runs_user
  ON autopilot_runs (user_id, started_at DESC);


-- ============================================================
-- Row Level Security — chaque étudiant ne voit que ses données.
-- ============================================================

ALTER TABLE company_contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_cv_files  ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_runs      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_contacts: all own" ON company_contacts;
CREATE POLICY "company_contacts: all own"
  ON company_contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "candidate_cv_files: all own" ON candidate_cv_files;
CREATE POLICY "candidate_cv_files: all own"
  ON candidate_cv_files FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Lecture seule côté étudiant : seul le serveur (service role) écrit le journal.
DROP POLICY IF EXISTS "autopilot_runs: select own" ON autopilot_runs;
CREATE POLICY "autopilot_runs: select own"
  ON autopilot_runs FOR SELECT
  USING (auth.uid() = user_id);
