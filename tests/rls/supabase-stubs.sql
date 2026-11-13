-- ============================================================
-- Stubs Supabase pour le banc d'attaque RLS (PGlite)
-- ============================================================
-- Rejoué AVANT les migrations de supabase/migrations/.
-- But : reproduire ce que Supabase met en place sur un projet neuf
-- et dont dépendent nos migrations et nos règles RLS :
--   • rôles anon / authenticated / service_role ;
--   • droits PAR DÉFAUT accordés à ces rôles sur le schéma public
--     (Supabase donne ALL : c'est RLS, et seulement RLS, qui protège) ;
--   • schéma auth (auth.users, auth.uid(), auth.role(), auth.jwt()) ;
--   • schéma storage (buckets, objects avec RLS activé, fonctions) ;
--   • publication supabase_realtime ;
--   • extensions préinstallées dans le schéma « extensions ».
-- Les définitions reprennent celles de supabase/postgres et de
-- supabase/storage (simplifiées : colonnes principales seulement).
-- Voir README.md (« Différences avec le vrai Supabase »).
-- ============================================================

-- ── 1. Rôles ─────────────────────────────────────────────────
-- Sur Supabase : NOLOGIN NOINHERIT, et service_role contourne RLS.
CREATE ROLE anon          NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role  NOLOGIN NOINHERIT BYPASSRLS;
-- Rôle de connexion de PostgREST (bascule ensuite vers anon / authenticated)
CREATE ROLE authenticator NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;

-- Délais imposés par Supabase aux rôles d'API (sans effet sur le banc,
-- reproduits pour mémoire)
ALTER ROLE anon          SET statement_timeout = '3s';
ALTER ROLE authenticated SET statement_timeout = '8s';

-- ── 2. Schéma public : droits par défaut de Supabase ──────────
-- (supabase/postgres, migrations/db/init-scripts/00000000000000-initial-schema.sql)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- ── 3. Extensions préinstallées (schéma « extensions ») ───────
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
-- pgcrypto et uuid-ossp sont activées d'office sur tout projet Supabase.
-- (Les modules sont chargés par harness.ts ; ici on les crée seulement.)
CREATE EXTENSION IF NOT EXISTS pgcrypto    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ── 4. Schéma auth ───────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Colonnes principales de auth.users (GoTrue). Aucun droit pour
-- anon / authenticated : comme sur Supabase, la table n'est pas exposée.
CREATE TABLE auth.users (
  instance_id         uuid,
  id                  uuid        PRIMARY KEY,
  aud                 varchar(255),
  role                varchar(255),
  email               varchar(255),
  encrypted_password  varchar(255),
  email_confirmed_at  timestamptz,
  last_sign_in_at     timestamptz,
  raw_app_meta_data   jsonb,
  raw_user_meta_data  jsonb,
  is_super_admin      boolean,
  is_anonymous        boolean     NOT NULL DEFAULT false,
  phone               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
GRANT ALL ON auth.users TO service_role;

-- Fonctions identiques à celles de Supabase : elles lisent les « claims »
-- du JWT que PostgREST place dans request.jwt.claims (ou, pour les très
-- vieilles versions, request.jwt.claim.sub / .role).
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt()
  TO anon, authenticated, service_role;

-- ── 5. Schéma storage ────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;

CREATE TABLE storage.buckets (
  id                  text        PRIMARY KEY,
  name                text        NOT NULL,
  owner               uuid,
  owner_id            text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  public              boolean     DEFAULT false,
  avif_autodetection  boolean     DEFAULT false,
  file_size_limit     bigint,
  allowed_mime_types  text[]
);
CREATE UNIQUE INDEX bname ON storage.buckets (name);

CREATE TABLE storage.objects (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id         text        REFERENCES storage.buckets (id),
  name              text,
  owner             uuid,
  owner_id          text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  last_accessed_at  timestamptz DEFAULT now(),
  metadata          jsonb,
  path_tokens       text[]      GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  version           text,
  user_metadata     jsonb
);
CREATE UNIQUE INDEX bucketid_objname ON storage.objects (bucket_id, name);

-- Supabase active RLS sur les deux tables et donne tous les droits aux
-- rôles d'API : seules les règles RLS (créées par nos migrations) ouvrent
-- l'accès.
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;

-- Fonctions utilitaires de supabase/storage (définitions d'origine)
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1 : array_length(_parts, 1) - 1];
END
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[array_length(_parts, 1)];
END
$$;

CREATE OR REPLACE FUNCTION storage.extension(name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _parts    text[];
  _filename text;
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  SELECT _parts[array_length(_parts, 1)] INTO _filename;
  RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;

GRANT EXECUTE ON FUNCTION storage.foldername(text), storage.filename(text), storage.extension(text)
  TO anon, authenticated, service_role;

-- ── 6. Realtime ──────────────────────────────────────────────
CREATE PUBLICATION supabase_realtime;
