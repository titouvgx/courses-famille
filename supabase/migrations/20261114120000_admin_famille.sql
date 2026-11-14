-- ============================================================
-- Migration 19 : administration des familles (v1)
-- ============================================================
-- Nouveaux droits, tous vérifiés ICI (jamais seulement dans l'appli) :
--   • remove_member(id)  : retirer quelqu'un d'une famille = supprimer son
--     compte (auth.users → profil en cascade). Accès coupé tout de suite ;
--     la personne pourra être réinvitée avec le même e-mail.
--       - admin de la famille : membres et admins de SA famille ;
--       - fondateur : n'importe qui dans les familles de sa super-famille ;
--       - super-admin : tout le monde ;
--       - jamais soi-même, jamais le fondateur, jamais un super-admin.
--     Ses recettes restent à la famille (auteur effacé), les liens qu'il avait
--     créés disparaissent (ceux en attente ne servent donc plus).
--   • delete_family(id)  : fondateur (dans sa super-famille) ou super-admin,
--     seulement si la famille est VIDE (0 membre, 0 lien en attente), n'est
--     pas la sienne, ne contient pas le catalogue et qu'aucune de ses recettes
--     n'est au planning d'une autre famille.
-- Trous bouchés :
--   • personne ne renomme le profil d'un autre (sauf super-admin) ;
--   • le rôle du fondateur ne change pas (sauf super-admin).
-- Plus de DELETE direct sur families et profiles (même super-admin) : il passe
-- par ces fonctions, qui font les vérifications. Garde-fou en plus : une
-- famille qui contient le catalogue ne se supprime pas depuis l'API.
-- Idempotente : peut être relancée sans erreur.
-- ============================================================

-- ── 1. Profils : nom d'un autre et rôle du fondateur ─────────
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Modification interdite : identifiant du profil' USING ERRCODE = '42501';
  END IF;
  IF NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION 'Modification interdite : changer de foyer' USING ERRCODE = '42501';
  END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name AND OLD.id <> auth.uid() THEN
    RAISE EXCEPTION 'Modification interdite : le nom d''un autre membre' USING ERRCODE = '42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.id = auth.uid()
       OR NOT ((public.is_admin() AND public.is_family(OLD.family_id))
               OR public.is_founder_of_family(OLD.family_id)) THEN
      RAISE EXCEPTION 'Modification interdite : rôle' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.families f JOIN public.super_families sf ON sf.id = f.super_family_id
      WHERE f.id = OLD.family_id AND sf.founder_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Modification interdite : rôle du fondateur' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. Recette : l'auteur peut être effacé quand son compte n'existe plus ──
-- (suppression du compte → recipes.created_by passe à NULL par la clé
-- étrangère ; sans cette exception, la garde bloquait la suppression)
CREATE OR REPLACE FUNCTION public.guard_recipe_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Auteur de la recette : soi-même uniquement' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.family_id IS DISTINCT FROM OLD.family_id
     OR (NEW.created_by IS DISTINCT FROM OLD.created_by
         AND NOT (NEW.created_by IS NULL
                  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.created_by))) THEN
    RAISE EXCEPTION 'Modification interdite : famille ou auteur de la recette' USING ERRCODE = '42501';
  END IF;
  IF OLD.visibility = 'super_famille' AND NEW.visibility = 'famille' AND EXISTS (
    SELECT 1 FROM public.meal_slots s JOIN public.meal_plans mp ON mp.id = s.meal_plan_id
    WHERE s.recipe_id = NEW.id AND mp.family_id <> NEW.family_id
  ) THEN
    RAISE EXCEPTION 'Cette recette est au planning d''une autre famille : elle doit rester partagée'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Plus de suppression directe : seulement par les fonctions ──
DROP POLICY IF EXISTS "families_delete" ON public.families;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

-- Garde-fou : la famille qui porte le catalogue ne se supprime pas depuis
-- l'API (même super-admin). Depuis le SQL Editor (auth.uid() NULL) : permis.
CREATE OR REPLACE FUNCTION public.guard_family_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.recipes r WHERE r.family_id = OLD.id AND r.visibility = 'catalogue'
  ) THEN
    RAISE EXCEPTION 'Cette famille contient le catalogue de recettes : suppression interdite'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_family_delete ON public.families;
CREATE TRIGGER trg_guard_family_delete
  BEFORE DELETE ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.guard_family_delete();

-- ── 4. Retirer quelqu'un ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_member(p_member uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_family uuid;
  v_sf     uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;
  -- Verrou sur le profil : deux retraits simultanés ne se gênent pas
  SELECT p.family_id, f.super_family_id INTO v_family, v_sf
    FROM public.profiles p JOIN public.families f ON f.id = p.family_id
   WHERE p.id = p_member
     FOR UPDATE OF p;
  -- Même message si la personne n'existe pas ou si on n'a pas le droit :
  -- pas d'indice sur les comptes des autres familles
  IF NOT FOUND OR NOT (
    public.is_super_admin()
    OR public.is_founder(v_sf)
    OR (public.is_admin() AND public.is_family(v_family))
  ) THEN
    RAISE EXCEPTION 'Membre introuvable' USING ERRCODE = '42501';
  END IF;
  IF p_member = auth.uid() THEN
    RAISE EXCEPTION 'Tu ne peux pas te retirer toi-même' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.super_families WHERE founder_id = p_member) THEN
    RAISE EXCEPTION 'Le fondateur ne peut pas être retiré' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = p_member) THEN
    RAISE EXCEPTION 'Un super-admin ne peut pas être retiré' USING ERRCODE = '42501';
  END IF;
  -- Le compte disparaît ; profil supprimé en cascade, recettes gardées
  -- (auteur → NULL), « coché par » / cuisinier → NULL, ses liens supprimés.
  DELETE FROM auth.users WHERE id = p_member;
END;
$$;

-- ── 5. Supprimer une famille vide ────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_family(p_family uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sf uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;
  -- FOR UPDATE : une invitation acceptée en même temps attend la fin de la
  -- suppression (puis échoue), au lieu d'ajouter un membre qui serait effacé.
  SELECT super_family_id INTO v_sf FROM public.families WHERE id = p_family FOR UPDATE;
  IF NOT FOUND OR NOT (public.is_founder(v_sf) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Famille introuvable' USING ERRCODE = '42501';
  END IF;
  IF public.is_family(p_family) THEN
    RAISE EXCEPTION 'Tu ne peux pas supprimer ta propre famille' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE family_id = p_family) THEN
    RAISE EXCEPTION 'Cette famille a encore des membres : retire-les d''abord' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invitations
              WHERE family_id = p_family AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()) THEN
    RAISE EXCEPTION 'Annule d''abord les liens d''invitation en attente' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recipes WHERE family_id = p_family AND visibility = 'catalogue') THEN
    RAISE EXCEPTION 'Cette famille contient le catalogue de recettes : suppression interdite' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.recipes r
      JOIN public.meal_slots s ON s.recipe_id = r.id
      JOIN public.meal_plans mp ON mp.id = s.meal_plan_id
     WHERE r.family_id = p_family AND mp.family_id <> p_family
  ) THEN
    RAISE EXCEPTION 'Une de ses recettes est au planning d''une autre famille' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM public.families WHERE id = p_family;
END;
$$;

-- ── 6. Droits d'exécution ────────────────────────────────────
REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_family(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_family(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_family_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_recipe_write() FROM PUBLIC, anon, authenticated;
