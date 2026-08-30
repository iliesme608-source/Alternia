-- Connexion Gmail de l'étudiant (OAuth Google, scope gmail.send uniquement).
-- À exécuter manuellement dans le SQL editor Supabase.
--
-- Le refresh_token n'est jamais lu côté navigateur : les routes /api/gmail/*
-- l'utilisent avec la service role key. La policy ci-dessous permet à l'étudiant
-- de consulter l'adresse connectée et de se déconnecter lui-même.

create table if not exists gmail_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  refresh_token text not null,
  email_address text not null,
  connected_at timestamptz default now()
);

alter table gmail_tokens enable row level security;

drop policy if exists "own tokens" on gmail_tokens;
create policy "own tokens" on gmail_tokens for all using (auth.uid() = user_id);
