-- ============================================================
-- Migration : familles, super-familles, invitations par lien,
--             visibilité des recettes (v2 du modèle de foyers)
-- ============================================================
-- Modèle :
--   • une personne appartient à UNE famille (profiles.family_id, inchangé) ;
--   • une famille appartient à UNE super-famille (families.super_family_id) ;
--   • une super-famille a un FONDATEUR (super_families.founder_id) : il en crée
--     les familles (3 au maximum, sans limite pour un super-admin) et peut y
--     inviter des gens ; il n'est membre que de sa propre famille ;
--   • l'admin d'une famille invite dans SA famille (rôle membre ou admin) ;
--   • le super-admin crée les liens « fondateur » (nouvelle super-famille).
-- Invitations : lien à usage unique, valable 7 jours, annulable. Seule
--   l'empreinte SHA-256 du jeton est stockée. Le compte est créé par la
--   fonction serveur « accepter-invitation » (clé secrète côté Supabase
--   uniquement), qui appelle consume_invitation() de façon atomique.
-- Recettes : visibility = 'famille' (défaut) | 'super_famille' | 'catalogue'
--   (recettes livrées avec l'appli, lecture seule pour tous).
-- Corrige aussi deux faiblesses relevées par le banc : liste rattachée au
--   planning d'un autre foyer ; created_by / checked_by d'une autre famille.
-- Données existantes : toutes les familles sont rattachées à UNE super-famille
--   (fondateur : le premier super-admin) ; recettes existantes → 'super_famille'
--   (même visibilité qu'avant) ; les 50 recettes livrées → 'catalogue'.
-- Idempotente : peut être relancée sans erreur.
-- ============================================================

-- ── 1. Super-familles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.super_families (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  founder_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_super_families_founder ON public.super_families(founder_id);
ALTER TABLE public.super_families ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.super_families IS 'Groupe de familles créé par un fondateur (lien d''invitation du super-admin).';

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS super_family_id uuid
  REFERENCES public.super_families(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_families_super_family ON public.families(super_family_id);

-- Familles existantes → une super-famille commune
DO $$
DECLARE
  v_sf      uuid;
  v_founder uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.families WHERE super_family_id IS NULL) THEN
    SELECT user_id INTO v_founder FROM public.super_admins ORDER BY created_at LIMIT 1;
    IF v_founder IS NULL THEN
      SELECT id INTO v_founder FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
    END IF;
    INSERT INTO public.super_families (name, founder_id) VALUES ('Notre famille', v_founder)
    RETURNING id INTO v_sf;
    UPDATE public.families SET super_family_id = v_sf WHERE super_family_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.families ALTER COLUMN super_family_id SET NOT NULL;
ALTER TABLE public.families DROP CONSTRAINT IF EXISTS families_name_length;
ALTER TABLE public.families ADD CONSTRAINT families_name_length
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 60) NOT VALID;

-- ── 2. Fonctions d'aide (SECURITY DEFINER : lisent sans dépendre des règles) ──
-- Colonne de visibilité d'abord : les fonctions SQL ci-dessous la lisent.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'famille';
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_visibility_check;
ALTER TABLE public.recipes ADD CONSTRAINT recipes_visibility_check
  CHECK (visibility IN ('famille', 'super_famille', 'catalogue'));

CREATE OR REPLACE FUNCTION public.my_super_family_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT f.super_family_id FROM public.profiles p
  JOIN public.families f ON f.id = p.family_id
  WHERE p.id = auth.uid()
$$;

-- Rien pour qui n'a pas de profil (pas d'oracle pour les anonymes)
CREATE OR REPLACE FUNCTION public.family_super_family(fid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT f.super_family_id FROM public.families f
  WHERE f.id = fid AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_founder(sfid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.super_families WHERE id = sfid AND founder_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_founder_of_family(fid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_founder(public.family_super_family(fid))
$$;

-- Peut inviter dans cette famille : admin de la famille, fondateur de sa
-- super-famille, ou super-admin.
CREATE OR REPLACE FUNCTION public.can_invite(fid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (public.is_family(fid) AND public.is_admin())
      OR public.is_founder_of_family(fid)
      OR public.is_super_admin()
$$;

-- Lecture d'une recette (même règle que la politique de lecture de recipes)
CREATE OR REPLACE FUNCTION public.can_read_recipe(rid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = rid AND (
      public.is_super_admin()
      OR public.is_family(r.family_id)
      OR (r.visibility = 'catalogue' AND public.is_member())
      OR (r.visibility = 'super_famille'
          AND public.family_super_family(r.family_id) = public.my_super_family_id())
    )
  )
$$;

-- Modification d'une recette et de son contenu : famille propriétaire (hors
-- catalogue) ou super-admin.
CREATE OR REPLACE FUNCTION public.can_edit_recipe(rid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = rid AND (
      public.is_super_admin()
      OR (public.is_family(r.family_id) AND r.visibility <> 'catalogue')
    )
  )
$$;

-- ── 3. Visibilité des recettes (colonne ajoutée en 2) ────────

DO $$
DECLARE
  v_seed_family uuid;
BEGIN
  -- Première exécution seulement : tout était partagé avant → 'super_famille'
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE visibility <> 'famille') THEN
    UPDATE public.recipes SET visibility = 'super_famille';
    -- Recettes livrées avec l'appli (migrations 7 et 16) → catalogue commun
    SELECT family_id INTO v_seed_family FROM public.recipes
      WHERE title = 'Bœuf bourguignon' ORDER BY created_at LIMIT 1;
    UPDATE public.recipes SET visibility = 'catalogue'
     WHERE family_id = v_seed_family AND title IN (
    'Bœuf bourguignon',
    'Poulet rôti',
    'Quiche lorraine',
    'Pâte à crêpes',
    'Gratin dauphinois',
    'Hachis parmentier',
    'Tartiflette',
    'Mousse au chocolat',
    'Pâtes à la carbonara',
    'Soupe à l''oignon gratinée',
    'Ratatouille',
    'Tarte aux pommes',
    'Fondant au chocolat',
    'Saumon en papillote',
    'Velouté de potiron',
    'Lasagnes bolognaise',
    'Salade niçoise',
    'Croque-monsieur',
    'Blanquette de veau',
    'Omelette aux champignons',
    'Pot-au-feu',
    'Poulet basquaise',
    'Chili con carne',
    'Curry de poulet au lait de coco',
    'Gratin de pâtes au jambon',
    'Endives au jambon',
    'Boulettes de bœuf à la sauce tomate',
    'Couscous au poulet et merguez',
    'Risotto aux champignons',
    'Petit salé aux lentilles',
    'Rôti de porc aux pommes de terre',
    'Galettes de sarrasin complètes',
    'Pizza maison',
    'Moules marinières',
    'Dahl de lentilles corail',
    'Cabillaud au four et sauce vierge',
    'Wok de nouilles au poulet et aux légumes',
    'Tomates farcies',
    'Soupe poireaux-pommes de terre',
    'Taboulé',
    'Œufs mimosa',
    'Salade de pâtes',
    'Purée de pommes de terre',
    'Riz pilaf',
    'Légumes rôtis au four',
    'Gâteau au yaourt',
    'Clafoutis aux cerises',
    'Riz au lait',
    'Crumble aux pommes',
    'Cookies aux pépites de chocolat'
    );
  END IF;
END $$;

-- ── 4. Invitations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text        NOT NULL UNIQUE,
  kind        text        NOT NULL CHECK (kind IN ('fondateur', 'membre')),
  family_id   uuid        REFERENCES public.families(id) ON DELETE CASCADE,
  role        text        CHECK (role IN ('admin', 'member')),
  label       text        CHECK (label IS NULL OR char_length(label) <= 60),
  created_by  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  used_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at  timestamptz,
  CONSTRAINT invitations_kind_shape CHECK (
    (kind = 'fondateur' AND family_id IS NULL AND role IS NULL)
    OR (kind = 'membre' AND family_id IS NOT NULL AND role IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_invitations_family ON public.invitations(family_id);
CREATE INDEX IF NOT EXISTS idx_invitations_creator ON public.invitations(created_by);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.invitations IS 'Liens d''invitation (usage unique, 7 jours). Jeton jamais stocké en clair.';

-- ── 5. Règles RLS ────────────────────────────────────────────
-- super_families : lecture par ses membres, son fondateur, le super-admin.
-- Pas d'écriture directe (fonctions ci-dessous), sauf renommage.
DROP POLICY IF EXISTS "super_families_select" ON public.super_families;
CREATE POLICY "super_families_select" ON public.super_families FOR SELECT
  USING (id = public.my_super_family_id() OR founder_id = auth.uid() OR public.is_super_admin());
DROP POLICY IF EXISTS "super_families_update" ON public.super_families;
CREATE POLICY "super_families_update" ON public.super_families FOR UPDATE
  USING (founder_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (founder_id = auth.uid() OR public.is_super_admin());

-- families : lecture des familles de sa super-famille (noms affichés sur les
-- recettes partagées) ; renommage par l'admin de la famille ou le fondateur.
DROP POLICY IF EXISTS "families_select" ON public.families;
CREATE POLICY "families_select" ON public.families FOR SELECT
  USING (
    public.is_family(id)
    OR super_family_id = public.my_super_family_id()
    OR public.is_founder(super_family_id)
    OR public.is_super_admin()
  );
DROP POLICY IF EXISTS "families_update" ON public.families;
CREATE POLICY "families_update" ON public.families FOR UPDATE
  USING ((public.is_family(id) AND public.is_admin()) OR public.is_founder(super_family_id) OR public.is_super_admin())
  WITH CHECK ((public.is_family(id) AND public.is_admin()) OR public.is_founder(super_family_id) OR public.is_super_admin());

-- profiles : sa famille, + le fondateur voit les membres de ses familles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (family_id = public.user_family_id() OR public.is_founder_of_family(family_id) OR public.is_super_admin());
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR (public.is_admin() AND family_id = public.user_family_id())
    OR public.is_founder_of_family(family_id)
    OR public.is_super_admin()
  )
  WITH CHECK (
    id = auth.uid()
    OR (public.is_admin() AND family_id = public.user_family_id())
    OR public.is_founder_of_family(family_id)
    OR public.is_super_admin()
  );

-- invitations : lecture par qui peut inviter ; aucune écriture directe
DROP POLICY IF EXISTS "invitations_select" ON public.invitations;
CREATE POLICY "invitations_select" ON public.invitations FOR SELECT
  USING (
    public.is_super_admin()
    OR (kind = 'membre' AND public.can_invite(family_id))
  );

-- recipes
DROP POLICY IF EXISTS "recipes_select" ON public.recipes;
CREATE POLICY "recipes_select" ON public.recipes FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_family(family_id)
    OR (visibility = 'catalogue' AND public.is_member())
    OR (visibility = 'super_famille' AND public.family_super_family(family_id) = public.my_super_family_id())
  );
DROP POLICY IF EXISTS "recipes_insert" ON public.recipes;
CREATE POLICY "recipes_insert" ON public.recipes FOR INSERT
  WITH CHECK (
    (public.is_family(family_id) AND visibility <> 'catalogue')
    OR public.is_super_admin()
  );
DROP POLICY IF EXISTS "recipes_update" ON public.recipes;
CREATE POLICY "recipes_update" ON public.recipes FOR UPDATE
  USING ((public.is_family(family_id) AND visibility <> 'catalogue') OR public.is_super_admin())
  WITH CHECK ((public.is_family(family_id) AND visibility <> 'catalogue') OR public.is_super_admin());
DROP POLICY IF EXISTS "recipes_delete" ON public.recipes;
CREATE POLICY "recipes_delete" ON public.recipes FOR DELETE
  USING ((public.is_family(family_id) AND public.is_admin() AND visibility <> 'catalogue') OR public.is_super_admin());

-- recipe_ingredients / recipe_steps : suivent la recette
DROP POLICY IF EXISTS "recipe_ingredients_select" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_select" ON public.recipe_ingredients FOR SELECT
  USING (public.can_read_recipe(recipe_id));
DROP POLICY IF EXISTS "recipe_ingredients_insert" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_insert" ON public.recipe_ingredients FOR INSERT
  WITH CHECK (public.can_edit_recipe(recipe_id));
DROP POLICY IF EXISTS "recipe_ingredients_update" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_update" ON public.recipe_ingredients FOR UPDATE
  USING (public.can_edit_recipe(recipe_id)) WITH CHECK (public.can_edit_recipe(recipe_id));
DROP POLICY IF EXISTS "recipe_ingredients_delete" ON public.recipe_ingredients;
CREATE POLICY "recipe_ingredients_delete" ON public.recipe_ingredients FOR DELETE
  USING (public.can_edit_recipe(recipe_id));

DROP POLICY IF EXISTS "recipe_steps_select" ON public.recipe_steps;
CREATE POLICY "recipe_steps_select" ON public.recipe_steps FOR SELECT
  USING (public.can_read_recipe(recipe_id));
DROP POLICY IF EXISTS "recipe_steps_insert" ON public.recipe_steps;
CREATE POLICY "recipe_steps_insert" ON public.recipe_steps FOR INSERT
  WITH CHECK (public.can_edit_recipe(recipe_id));
DROP POLICY IF EXISTS "recipe_steps_update" ON public.recipe_steps;
CREATE POLICY "recipe_steps_update" ON public.recipe_steps FOR UPDATE
  USING (public.can_edit_recipe(recipe_id)) WITH CHECK (public.can_edit_recipe(recipe_id));
DROP POLICY IF EXISTS "recipe_steps_delete" ON public.recipe_steps;
CREATE POLICY "recipe_steps_delete" ON public.recipe_steps FOR DELETE
  USING (public.can_edit_recipe(recipe_id));

-- meal_slots : on ne planifie qu'une recette qu'on a le droit de lire
DROP POLICY IF EXISTS "meal_slots_insert" ON public.meal_slots;
CREATE POLICY "meal_slots_insert" ON public.meal_slots FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.meal_plans mp WHERE mp.id = meal_plan_id AND public.is_family(mp.family_id))
    AND (recipe_id IS NULL OR public.can_read_recipe(recipe_id))
  );
DROP POLICY IF EXISTS "meal_slots_update" ON public.meal_slots;
CREATE POLICY "meal_slots_update" ON public.meal_slots FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meal_plans mp WHERE mp.id = meal_plan_id AND public.is_family(mp.family_id)))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.meal_plans mp WHERE mp.id = meal_plan_id AND public.is_family(mp.family_id))
    AND (recipe_id IS NULL OR public.can_read_recipe(recipe_id))
  );

-- shopping_lists : le planning rattaché doit être celui du même foyer
DROP POLICY IF EXISTS "shopping_lists_insert" ON public.shopping_lists;
CREATE POLICY "shopping_lists_insert" ON public.shopping_lists FOR INSERT
  WITH CHECK (
    public.is_family(family_id)
    AND (meal_plan_id IS NULL OR EXISTS (
      SELECT 1 FROM public.meal_plans mp WHERE mp.id = meal_plan_id AND mp.family_id = shopping_lists.family_id))
  );
DROP POLICY IF EXISTS "shopping_lists_update" ON public.shopping_lists;
CREATE POLICY "shopping_lists_update" ON public.shopping_lists FOR UPDATE
  USING (public.is_family(family_id))
  WITH CHECK (
    public.is_family(family_id)
    AND (meal_plan_id IS NULL OR EXISTS (
      SELECT 1 FROM public.meal_plans mp WHERE mp.id = meal_plan_id AND mp.family_id = shopping_lists.family_id))
  );

-- Photos : on ne liste que les photos des recettes qu'on peut lire ; envoi
-- seulement dans une recette modifiable (pas le catalogue, sauf super-admin)
DROP POLICY IF EXISTS "recipe_photos_select" ON storage.objects;
CREATE POLICY "recipe_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'recipe-photos' AND public.is_member()
    AND (
      NOT public.recipe_exists((storage.foldername(name))[1])
      OR EXISTS (SELECT 1 FROM public.recipes r
                 WHERE r.id::text = (storage.foldername(name))[1] AND public.can_read_recipe(r.id))
    )
  );
DROP POLICY IF EXISTS "recipe_photos_insert" ON storage.objects;
CREATE POLICY "recipe_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-photos'
    AND public.is_member()
    AND lower(storage.extension(name)) IN ('webp', 'jpg')
    AND array_length(storage.foldername(name), 1) = 1
    AND EXISTS (SELECT 1 FROM public.recipes r
                WHERE r.id::text = (storage.foldername(name))[1] AND public.can_edit_recipe(r.id))
  );
DROP POLICY IF EXISTS "recipe_photos_delete" ON storage.objects;
CREATE POLICY "recipe_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'recipe-photos'
    AND public.is_member()
    AND (
      EXISTS (SELECT 1 FROM public.recipes r
              WHERE r.id::text = (storage.foldername(name))[1] AND public.can_edit_recipe(r.id))
      OR NOT public.recipe_exists((storage.foldername(name))[1])
    )
  );

-- ── 6. Gardes (triggers) ─────────────────────────────────────
-- 6a. Profil : rôle modifiable par l'admin de la famille OU le fondateur
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
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.id = auth.uid()
       OR NOT ((public.is_admin() AND public.is_family(OLD.family_id))
               OR public.is_founder_of_family(OLD.family_id)) THEN
      RAISE EXCEPTION 'Modification interdite : rôle' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 6b. Famille : on ne change pas de super-famille (sauf super-admin) ;
--     3 familles au maximum par super-famille (sauf fondateur super-admin)
CREATE OR REPLACE FUNCTION public.guard_family_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_founder uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.super_family_id IS DISTINCT FROM OLD.super_family_id
     AND auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Modification interdite : changer de super-famille' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.super_family_id IS DISTINCT FROM OLD.super_family_id THEN
    -- Verrou par super-famille : deux créations simultanées ne dépassent pas 3
    PERFORM pg_advisory_xact_lock(hashtext('famille:' || NEW.super_family_id::text));
    SELECT founder_id INTO v_founder FROM public.super_families WHERE id = NEW.super_family_id;
    IF NOT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = v_founder)
       AND (SELECT count(*) FROM public.families WHERE super_family_id = NEW.super_family_id) >= 3 THEN
      RAISE EXCEPTION 'Limite atteinte : 3 familles au maximum' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_family_write ON public.families;
CREATE TRIGGER trg_guard_family_write
  BEFORE INSERT OR UPDATE OF super_family_id ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.guard_family_write();

-- 6c. Super-famille : le fondateur ne se transfère pas (sauf super-admin)
CREATE OR REPLACE FUNCTION public.guard_super_family_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin()
     AND (NEW.founder_id IS DISTINCT FROM OLD.founder_id OR NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'Modification interdite : fondateur' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_super_family_update ON public.super_families;
CREATE TRIGGER trg_guard_super_family_update
  BEFORE UPDATE ON public.super_families
  FOR EACH ROW EXECUTE FUNCTION public.guard_super_family_update();

-- 6d. Recette : auteur = soi ; famille et auteur figés ; passage en
--     « famille seulement » refusé si une autre famille l'a au planning
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
  IF NEW.family_id IS DISTINCT FROM OLD.family_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
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
DROP TRIGGER IF EXISTS trg_guard_recipe_write ON public.recipes;
CREATE TRIGGER trg_guard_recipe_write
  BEFORE INSERT OR UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.guard_recipe_write();

-- 6e. Liste : « coché par » = un membre du même foyer (ou personne) ;
--     la recette d'origine doit être une recette qu'on peut lire
CREATE OR REPLACE FUNCTION public.guard_item_checked_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.source_recipe_id IS NOT NULL AND auth.uid() IS NOT NULL AND NOT public.is_super_admin()
     AND (TG_OP = 'INSERT' OR NEW.source_recipe_id IS DISTINCT FROM OLD.source_recipe_id)
     AND NOT public.can_read_recipe(NEW.source_recipe_id) THEN
    RAISE EXCEPTION 'Recette d''origine inaccessible' USING ERRCODE = '42501';
  END IF;
  IF NEW.checked_by IS NOT NULL AND auth.uid() IS NOT NULL AND NOT public.is_super_admin()
     AND (TG_OP = 'INSERT' OR NEW.checked_by IS DISTINCT FROM OLD.checked_by)
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p JOIN public.shopping_lists sl ON sl.family_id = p.family_id
       WHERE p.id = NEW.checked_by AND sl.id = NEW.shopping_list_id
     ) THEN
    RAISE EXCEPTION '« Coché par » doit être un membre du foyer' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_item_checked_by ON public.shopping_list_items;
CREATE TRIGGER trg_guard_item_checked_by
  BEFORE INSERT OR UPDATE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_item_checked_by();

-- ── 7. Fonctions appelées par l'appli ────────────────────────
-- 7a. Créer un lien d'invitation. Renvoie le jeton EN CLAIR une seule fois.
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_kind text, p_family_id uuid DEFAULT NULL, p_role text DEFAULT NULL, p_label text DEFAULT NULL
)
RETURNS TABLE (id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_token   text;
  v_id      uuid;
  v_expires timestamptz := now() + interval '7 days';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'fondateur' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Réservé au super-admin' USING ERRCODE = '42501';
    END IF;
    p_family_id := NULL; p_role := NULL;
  ELSIF p_kind = 'membre' THEN
    IF p_family_id IS NULL OR p_role IS NULL OR p_role NOT IN ('admin', 'member') THEN
      RAISE EXCEPTION 'Famille et rôle requis' USING ERRCODE = '22023';
    END IF;
    IF NOT public.can_invite(p_family_id) THEN
      RAISE EXCEPTION 'Tu ne peux pas inviter dans cette famille' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Type d''invitation inconnu' USING ERRCODE = '22023';
  END IF;
  -- Anti-abus : 20 liens en attente au maximum par personne (verrou : deux
  -- demandes simultanées ne dépassent pas la limite)
  PERFORM pg_advisory_xact_lock(hashtext('create_invitation:' || auth.uid()::text));
  IF (SELECT count(*) FROM public.invitations i
      WHERE i.created_by = auth.uid() AND i.used_at IS NULL AND i.revoked_at IS NULL
        AND i.expires_at > now()) >= 20 THEN
    RAISE EXCEPTION 'Trop de liens en attente : annule ceux qui ne servent plus' USING ERRCODE = 'check_violation';
  END IF;
  -- 2 × 122 bits aléatoires (gen_random_uuid, générateur cryptographique)
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.invitations (token_hash, kind, family_id, role, label, created_by, expires_at)
  VALUES (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_kind, p_family_id, p_role,
          NULLIF(btrim(left(p_label, 60)), ''), auth.uid(), v_expires)
  RETURNING invitations.id INTO v_id;
  RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$$;

-- 7b. Annuler un lien encore valable
CREATE OR REPLACE FUNCTION public.revoke_invitation(p_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v public.invitations;
BEGIN
  SELECT * INTO v FROM public.invitations WHERE id = p_id;
  IF NOT FOUND OR NOT (
    public.is_super_admin() OR (v.kind = 'membre' AND public.can_invite(v.family_id))
  ) THEN
    RAISE EXCEPTION 'Lien introuvable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.invitations SET revoked_at = now()
   WHERE id = p_id AND used_at IS NULL AND revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

-- 7c. Informations d'un lien (page « Rejoindre », avant création du compte).
--     Ne renvoie rien d'autre que l'état, le type, le rôle et le nom de la famille.
CREATE OR REPLACE FUNCTION public.invitation_info(p_token text)
RETURNS TABLE (status text, kind text, role text, family_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    CASE
      WHEN i.id IS NULL THEN 'inconnue'
      WHEN i.revoked_at IS NOT NULL THEN 'annulee'
      WHEN i.used_at IS NOT NULL THEN 'utilisee'
      WHEN i.expires_at <= now() THEN 'expiree'
      ELSE 'valide'
    END,
    i.kind, i.role, f.name
  FROM (SELECT 1) AS one
  LEFT JOIN public.invitations i
    ON i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  LEFT JOIN public.families f ON f.id = i.family_id
$$;

-- 7d. Consommer un lien (appelée UNIQUEMENT par la fonction serveur, avec la
--     clé secrète, juste après la création du compte). Atomique : le lien ne
--     peut servir qu'une fois, même avec deux demandes simultanées.
CREATE OR REPLACE FUNCTION public.consume_invitation(
  p_token text, p_user_id uuid, p_display_name text, p_family_name text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v      public.invitations;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_fam  text := btrim(coalesce(p_family_name, ''));
  v_sf   uuid;
  v_fid  uuid;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Prénom ou nom invalide' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Ce compte a déjà une famille' USING ERRCODE = '22023';
  END IF;
  UPDATE public.invitations
     SET used_at = now(), used_by = p_user_id
   WHERE token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  RETURNING * INTO v;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lien d''invitation invalide, expiré ou déjà utilisé' USING ERRCODE = '22023';
  END IF;

  IF v.kind = 'fondateur' THEN
    IF char_length(v_fam) NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION 'Nom de famille invalide' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.super_families (name, founder_id) VALUES (v_fam, p_user_id) RETURNING id INTO v_sf;
    INSERT INTO public.families (name, super_family_id) VALUES (v_fam, v_sf) RETURNING id INTO v_fid;
    INSERT INTO public.profiles (id, family_id, display_name, role) VALUES (p_user_id, v_fid, v_name, 'admin');
  ELSE
    v_fid := v.family_id;
    INSERT INTO public.profiles (id, family_id, display_name, role) VALUES (p_user_id, v_fid, v_name, v.role);
  END IF;
  RETURN jsonb_build_object('kind', v.kind, 'family_id', v_fid);
END;
$$;

-- 7e. Créer une famille supplémentaire (fondateur : 3 au maximum)
CREATE OR REPLACE FUNCTION public.create_family(p_name text, p_super_family_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sf  uuid := p_super_family_id;
  v_fid uuid;
  v_nm  text := btrim(coalesce(p_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_nm) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Nom de famille invalide' USING ERRCODE = '22023';
  END IF;
  IF v_sf IS NULL THEN
    SELECT id INTO v_sf FROM public.super_families WHERE founder_id = auth.uid() ORDER BY created_at LIMIT 1;
  END IF;
  IF v_sf IS NULL OR NOT (public.is_founder(v_sf) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Seul le fondateur peut créer une famille' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.families (name, super_family_id) VALUES (v_nm, v_sf) RETURNING id INTO v_fid;
  RETURN v_fid;
END;
$$;

-- ── 8. Droits d'exécution ────────────────────────────────────
-- Supabase donne EXECUTE à anon par défaut : on le retire explicitement.
REVOKE ALL ON FUNCTION public.create_invitation(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(text, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_family(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_family(text, uuid) TO authenticated;
-- Page « Rejoindre » : avant d'avoir un compte
GRANT EXECUTE ON FUNCTION public.invitation_info(text) TO anon, authenticated;
-- Réservée à la fonction serveur (clé secrète)
REVOKE ALL ON FUNCTION public.consume_invitation(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invitation(text, uuid, text, text) TO service_role;
-- Fonctions de triggers : jamais appelables directement
REVOKE ALL ON FUNCTION public.guard_family_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_super_family_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_recipe_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_item_checked_by() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_update() FROM PUBLIC, anon, authenticated;
