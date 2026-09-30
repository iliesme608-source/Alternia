-- ============================================================
-- Alternia Autopilot — Contacts relevés sur le site des entreprises
-- À exécuter dans Supabase > SQL Editor, APRÈS :
--   supabase/autopilot_contacts_agent.sql
--
-- Autorise la provenance « site_web » : adresse publiée par l'entreprise
-- elle-même (page contact, mentions légales, recrutement…).
-- Additive, rejouable sans erreur.
--
-- Sans cette migration l'app fonctionne quand même : ces adresses sont
-- enregistrées comme « email_generique », avec la page source dans la note.
-- ============================================================

ALTER TABLE company_contacts DROP CONSTRAINT IF EXISTS company_contacts_source_check;
ALTER TABLE company_contacts ADD CONSTRAINT company_contacts_source_check
  CHECK (source IN (
    'registre_officiel', 'email_generique', 'email_nominatif',
    'site_web', 'saisie_etudiant'
  ));
