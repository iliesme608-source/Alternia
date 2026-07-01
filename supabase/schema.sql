-- ============================================================
-- AlternaAI — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ── Profiles ────────────────────────────────────────────────
-- Mirrors auth.users; populated by trigger on signup
CREATE TABLE IF NOT EXISTS profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email     TEXT,
  prenom    TEXT,
  nom       TEXT,
  ecole     TEXT,
  niveau    TEXT,
  secteur   TEXT,
  region    TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ── Entretien sessions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS entretien_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  entreprise TEXT DEFAULT '',
  poste      TEXT DEFAULT '',
  messages   JSONB DEFAULT '[]'::jsonb NOT NULL,
  score      INTEGER CHECK (score BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entretien_sessions_user
  ON entretien_sessions (user_id, created_at DESC);

-- ── CV analyses ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cv_analyses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cv_original         TEXT DEFAULT '' NOT NULL,
  fiche_poste         TEXT DEFAULT '' NOT NULL,
  cv_adapte           TEXT DEFAULT '' NOT NULL,
  score_ats           INTEGER CHECK (score_ats BETWEEN 0 AND 100),
  mots_cles_ajoutes   TEXT[] DEFAULT '{}'::text[] NOT NULL,
  mots_cles_manquants TEXT[] DEFAULT '{}'::text[] NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cv_analyses_user
  ON cv_analyses (user_id, created_at DESC);

-- ── Prospection campagnes ───────────────────────────────────
-- entreprises: array of EntrepriseProspect objects (JSON)
CREATE TABLE IF NOT EXISTS prospection_campagnes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  secteur     TEXT DEFAULT '' NOT NULL,
  region      TEXT DEFAULT '' NOT NULL,
  entreprises JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prospection_campagnes_user
  ON prospection_campagnes (user_id, created_at DESC);


-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE entretien_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_analyses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospection_campagnes ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: select own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: insert own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- entretien_sessions
CREATE POLICY "entretiens: all own"
  ON entretien_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- cv_analyses
CREATE POLICY "cv_analyses: all own"
  ON cv_analyses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- prospection_campagnes
CREATE POLICY "prospection: all own"
  ON prospection_campagnes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- Trigger — create profile on new signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, prenom, nom, ecole, niveau, secteur, region)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'prenom',
    NEW.raw_user_meta_data ->> 'nom',
    NEW.raw_user_meta_data ->> 'ecole',
    NEW.raw_user_meta_data ->> 'niveau',
    NEW.raw_user_meta_data ->> 'secteur',
    NEW.raw_user_meta_data ->> 'region'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
