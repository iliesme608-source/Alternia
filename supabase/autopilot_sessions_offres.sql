-- ============================================================
-- Alternia Autopilot — Sessions d'agent + candidatures sur offres
-- À exécuter dans Supabase > SQL Editor, APRÈS :
--   1. supabase/autopilot.sql
--   2. supabase/autopilot_contacts_agent.sql
--
-- Additive uniquement : aucun DROP de table, aucune colonne existante
-- modifiée. Rejouable sans erreur.
--
-- Contenu :
--   1. agent_sessions            — « active l'agent pour 30 min / 1 h »
--   2. application_packages.*    — rattacher une candidature à une offre réelle
-- ============================================================


-- ============================================================
-- 1. agent_sessions
--    Une session = une fenêtre de travail bornée dans le temps, pendant
--    laquelle l'agent cherche et prépare en continu.
--
--    Le travail est découpé en « ticks » (une tranche ≈ 1 à 2 min), parce
--    qu'une fonction serverless ne peut pas tourner une heure d'affilée.
--    Tout l'état vit ici : fermer l'onglet met la session en pause, il ne la
--    perd pas. `state` porte le curseur de reprise (page d'offres suivante,
--    entreprises déjà vues…).
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ce que l'agent est autorisé à explorer pendant cette session.
  --   offres    : uniquement les offres publiées (France Travail)
  --   spontane  : uniquement le marché caché (registre des entreprises)
  --   mixte     : les deux, offres d'abord
  mode             TEXT NOT NULL DEFAULT 'mixte'
                     CHECK (mode IN ('offres', 'spontane', 'mixte')),

  duration_minutes INTEGER NOT NULL DEFAULT 30
                     CHECK (duration_minutes BETWEEN 5 AND 180),

  status           TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'paused', 'finished', 'stopped', 'error')),

  -- Objectif figé au démarrage : une session ne change pas de cible en route.
  objective        JSONB DEFAULT '{}'::jsonb NOT NULL,
  -- Curseur de reprise entre deux ticks (offres déjà vues, page suivante…).
  state            JSONB DEFAULT '{}'::jsonb NOT NULL,
  -- Journal lisible par l'étudiant, une ligne par action.
  log              JSONB DEFAULT '[]'::jsonb NOT NULL,

  offers_found         INTEGER DEFAULT 0 NOT NULL,
  companies_found      INTEGER DEFAULT 0 NOT NULL,
  applications_prepared INTEGER DEFAULT 0 NOT NULL,
  contacts_found       INTEGER DEFAULT 0 NOT NULL,
  ticks                INTEGER DEFAULT 0 NOT NULL,

  message          TEXT DEFAULT '',
  started_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  last_tick_at     TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user
  ON agent_sessions (user_id, started_at DESC);

-- Une seule session active par étudiant : deux agents en parallèle
-- dupliqueraient les candidatures et exploseraient les plafonds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_sessions_active
  ON agent_sessions (user_id)
  WHERE status IN ('running', 'paused');


-- ============================================================
-- 2. application_packages — rattachement à une offre publiée
--    Les candidatures spontanées et les réponses à offre vivent dans la MÊME
--    table : l'étudiant a un seul suivi, pas deux. `source` les distingue.
-- ============================================================

ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS source         TEXT DEFAULT 'spontanee' NOT NULL;
ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS offer_id       TEXT;
ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS offer_title    TEXT DEFAULT '';
ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS offer_company  TEXT DEFAULT '';
ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS offer_location TEXT DEFAULT '';
ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS offer_url      TEXT DEFAULT '';
ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS offer_source   TEXT DEFAULT '';
-- Copie de l'offre au moment de la candidature : une offre disparaît vite du
-- site d'origine, l'étudiant doit pouvoir la relire avant son entretien.
ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS offer_snapshot JSONB DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE application_packages ADD COLUMN IF NOT EXISTS session_id     UUID REFERENCES agent_sessions(id) ON DELETE SET NULL;

-- Contrainte de valeurs, ajoutée sans DROP (rejouable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'application_packages_source_check'
  ) THEN
    ALTER TABLE application_packages
      ADD CONSTRAINT application_packages_source_check
      CHECK (source IN ('spontanee', 'offre'));
  END IF;
END $$;

-- Jamais deux candidatures pour la même offre.
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_packages_offer
  ON application_packages (user_id, offer_id)
  WHERE offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_application_packages_session
  ON application_packages (session_id);


-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_sessions: select own" ON agent_sessions;
CREATE POLICY "agent_sessions: select own"
  ON agent_sessions FOR SELECT
  USING (auth.uid() = user_id);
