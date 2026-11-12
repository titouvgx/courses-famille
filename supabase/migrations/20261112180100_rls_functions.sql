-- ============================================================
-- Migration 002 : Fonctions helpers pour les policies RLS
-- ============================================================

-- user_family_id() : renvoie le family_id de l'utilisateur courant.
-- Utilisée dans presque toutes les policies.
CREATE OR REPLACE FUNCTION user_family_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT family_id FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION user_family_id IS 'Renvoie le family_id du JWT courant.';

-- is_family(fid) : vrai si l'utilisateur appartient à la famille fid.
CREATE OR REPLACE FUNCTION is_family(fid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND family_id = fid
  );
$$;

COMMENT ON FUNCTION is_family IS 'Vrai si auth.uid() est membre de la famille fid.';

-- is_member() : vrai si l'utilisateur est authentifié ET a un profil.
CREATE OR REPLACE FUNCTION is_member()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
  );
$$;

COMMENT ON FUNCTION is_member IS 'Vrai si auth.uid() a un profil (= compte activé).';

-- is_admin() : vrai si l'utilisateur est admin de sa famille.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

COMMENT ON FUNCTION is_admin IS 'Vrai si auth.uid() est admin de sa famille.';

-- is_super_admin() : vrai si l'utilisateur est super-admin global.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION is_super_admin IS 'Vrai si auth.uid() est dans super_admins (Titouan).';
