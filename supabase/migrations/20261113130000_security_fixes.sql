-- ============================================================
-- Migration : corrections de l'audit de sécurité (13/11/2026)
-- ============================================================
-- Idempotente : peut être relancée sans risque.
--
-- 1. Un membre pouvait se nommer lui-même administrateur
--    (la règle profiles_update laissait chacun modifier TOUTE sa ligne,
--    y compris role). Désormais :
--      • chacun ne change que son nom d'affichage ;
--      • l'admin d'un foyer peut changer le rôle des membres DE SON foyer ;
--      • personne (hors super-admin / console Supabase) ne change de foyer.
-- 2. Un admin était « admin partout » dans la règle profiles_update :
--    limité à son propre foyer.
-- 3. recipe_exists() était appelable sans être connecté : fermé.
-- 4. image_url ne peut plus pointer n'importe où (pixel espion, http) :
--    seulement le stockage Supabase du projet ou Unsplash.
-- ============================================================

-- ── 1 & 2. profiles ─────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR (public.is_admin() AND family_id = public.user_family_id())
    OR public.is_super_admin()
  )
  WITH CHECK (
    id = auth.uid()
    OR (public.is_admin() AND family_id = public.user_family_id())
    OR public.is_super_admin()
  );

-- Les règles RLS portent sur des lignes, pas sur des colonnes : un garde
-- (trigger) vérifie QUELLES colonnes changent.
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Console Supabase / clé serveur (pas d'utilisateur) ou super-admin : libre
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Modification interdite : identifiant du profil'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION 'Modification interdite : changer de foyer'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Seul un admin du MÊME foyer, et pas sur lui-même
    -- (évite qu'un foyer se retrouve sans admin par erreur).
    IF NOT (public.is_admin() AND public.is_family(OLD.family_id))
       OR OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'Modification interdite : rôle'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- ── 3. recipe_exists : réservé aux utilisateurs connectés ──────
-- Supabase donne par défaut EXECUTE au rôle anon sur les fonctions de
-- public : « REVOKE … FROM PUBLIC » ne suffit pas, il faut viser anon.
DO $$
BEGIN
  IF to_regprocedure('public.recipe_exists(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.recipe_exists(text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.recipe_exists(text) TO authenticated;
  END IF;
END
$$;

-- ── 4. image_url : origines autorisées ───────────────────────
-- NOT VALID : ne bloque pas sur les lignes déjà présentes, mais s'applique
-- à toute nouvelle écriture.
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_image_url_origin;
ALTER TABLE public.recipes ADD CONSTRAINT recipes_image_url_origin CHECK (
  image_url IS NULL
  OR image_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/recipe-photos/'
  OR image_url ~ '^https://images\.unsplash\.com/'
) NOT VALID;
