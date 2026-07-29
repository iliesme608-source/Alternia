-- ============================================================
-- Alternia Autopilot — Supabase Migration
-- Module "Agent Candidature" (Sarah)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
--
-- Safe & additive: ne touche à AUCUNE table existante.
-- Utilise CREATE TABLE IF NOT EXISTS + CREATE POLICY idempotents.
-- ============================================================


-- ============================================================
-- Helper — trigger updated_at (partagé par les tables Autopilot)
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
-- 1. candidate_master_profiles
--    Un profil candidat "maître" structuré par utilisateur.
--    L'IA n'a le droit de puiser QUE dans ces données vérifiées.
-- ============================================================

CREATE TABLE IF NOT EXISTS candidate_master_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cv_original_text     TEXT DEFAULT '' NOT NULL,
  verified_experiences JSONB DEFAULT '[]'::jsonb NOT NULL,
  verified_skills      JSONB DEFAULT '[]'::jsonb NOT NULL,
  education            JSONB DEFAULT '[]'::jsonb NOT NULL,
  tools                JSONB DEFAULT '[]'::jsonb NOT NULL,
  target_roles         JSONB DEFAULT '[]'::jsonb NOT NULL,
  constraints          JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidate_master_profiles_user
  ON candidate_master_profiles (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_candidate_master_profiles_updated_at ON candidate_master_profiles;
CREATE TRIGGER trg_candidate_master_profiles_updated_at
  BEFORE UPDATE ON candidate_master_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 2. company_targets
--    Entreprises trouvées + score de matching IA.
-- ============================================================

CREATE TABLE IF NOT EXISTS company_targets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name   TEXT NOT NULL,
  siren          TEXT,
  siret          TEXT,
  city           TEXT,
  region         TEXT,
  sector         TEXT,
  naf_code       TEXT,
  employee_range TEXT,
  website           TEXT,
  source            TEXT DEFAULT 'recherche-entreprises.api.gouv.fr',
  match_score       INTEGER CHECK (match_score BETWEEN 0 AND 100),
  match_reason      TEXT DEFAULT '',
  priority          TEXT CHECK (priority IN ('high', 'medium', 'low')),
  recommended_angle TEXT DEFAULT '',
  possible_role     TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_targets_user
  ON company_targets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_targets_score
  ON company_targets (user_id, match_score DESC);


-- ============================================================
-- 3. application_packages
--    Candidatures personnalisées générées, prêtes à valider/envoyer.
--    status: CHECK constraint (flexible, pas d'enum PostgreSQL).
-- ============================================================

CREATE TABLE IF NOT EXISTS application_packages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_target_id    UUID REFERENCES company_targets(id) ON DELETE CASCADE,
  status               TEXT DEFAULT 'ready' NOT NULL
                         CHECK (status IN ('ready', 'sent', 'follow_up', 'interview', 'rejected', 'accepted', 'archived')),
  email_subject        TEXT DEFAULT '',
  email_body           TEXT DEFAULT '',
  motivation_letter    TEXT DEFAULT '',
  linkedin_message     TEXT DEFAULT '',
  cv_adaptation_notes  TEXT DEFAULT '',
  highlighted_keywords JSONB DEFAULT '[]'::jsonb NOT NULL,
  generated_cv_text    TEXT DEFAULT '',
  follow_up_date       TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_packages_user
  ON application_packages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_packages_status
  ON application_packages (user_id, status);

CREATE INDEX IF NOT EXISTS idx_application_packages_company
  ON application_packages (company_target_id);

DROP TRIGGER IF EXISTS trg_application_packages_updated_at ON application_packages;
CREATE TRIGGER trg_application_packages_updated_at
  BEFORE UPDATE ON application_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 4. application_events
--    Historique de suivi d'une candidature (envoi, relance, etc.).
-- ============================================================

CREATE TABLE IF NOT EXISTS application_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_package_id UUID REFERENCES application_packages(id) ON DELETE CASCADE,
  event_type             TEXT NOT NULL,
  note                   TEXT DEFAULT '',
  metadata               JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_events_user
  ON application_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_events_package
  ON application_events (application_package_id, created_at DESC);


-- ============================================================
-- 5. autopilot_rules  (Niveau 2 — préparé, PAS automatisé)
--    Aucune logique cron ici : simple stockage des règles.
-- ============================================================

CREATE TABLE IF NOT EXISTS autopilot_rules (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active                BOOLEAN DEFAULT false NOT NULL,
  target_role              TEXT DEFAULT '',
  allowed_sectors          JSONB DEFAULT '[]'::jsonb NOT NULL,
  allowed_regions          JSONB DEFAULT '[]'::jsonb NOT NULL,
  max_applications_per_day INTEGER DEFAULT 5 CHECK (max_applications_per_day BETWEEN 0 AND 100),
  minimum_match_score      INTEGER DEFAULT 60 CHECK (minimum_match_score BETWEEN 0 AND 100),
  require_validation       BOOLEAN DEFAULT true NOT NULL,
  frequency                TEXT DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'manual')),
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at               TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autopilot_rules_user
  ON autopilot_rules (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_autopilot_rules_updated_at ON autopilot_rules;
CREATE TRIGGER trg_autopilot_rules_updated_at
  BEFORE UPDATE ON autopilot_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Row Level Security (RLS)
-- Chaque utilisateur ne voit / modifie QUE ses propres données.
-- ============================================================

ALTER TABLE candidate_master_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_targets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_packages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_rules            ENABLE ROW LEVEL SECURITY;

-- candidate_master_profiles
DROP POLICY IF EXISTS "candidate_master_profiles: all own" ON candidate_master_profiles;
CREATE POLICY "candidate_master_profiles: all own"
  ON candidate_master_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- company_targets
DROP POLICY IF EXISTS "company_targets: all own" ON company_targets;
CREATE POLICY "company_targets: all own"
  ON company_targets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- application_packages
DROP POLICY IF EXISTS "application_packages: all own" ON application_packages;
CREATE POLICY "application_packages: all own"
  ON application_packages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- application_events
DROP POLICY IF EXISTS "application_events: all own" ON application_events;
CREATE POLICY "application_events: all own"
  ON application_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- autopilot_rules
DROP POLICY IF EXISTS "autopilot_rules: all own" ON autopilot_rules;
CREATE POLICY "autopilot_rules: all own"
  ON autopilot_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
