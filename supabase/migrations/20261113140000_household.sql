-- ============================================================
-- Migration : vie du foyer (V1+)
-- ============================================================
--  1. « Qui cuisine ? »   : meal_slots.cook_id
--  2. Achats habituels    : table staples
--  3. Placard             : table pantry_items + shopping_list_items.needed
-- Tout est scopé par foyer (RLS via is_family). Idempotente.
-- ============================================================

-- ── 1. Qui cuisine ? ─────────────────────────────────────────
ALTER TABLE public.meal_slots
  ADD COLUMN IF NOT EXISTS cook_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Le cuisinier doit appartenir au foyer du planning (sinon on pourrait
-- attacher le profil d'un autre foyer à son planning).
CREATE OR REPLACE FUNCTION public.guard_meal_slot_cook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.cook_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.meal_plans mp ON mp.family_id = p.family_id
    WHERE p.id = NEW.cook_id AND mp.id = NEW.meal_plan_id
  ) THEN
    RAISE EXCEPTION 'Le cuisinier doit faire partie du foyer' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_meal_slot_cook ON public.meal_slots;
CREATE TRIGGER trg_guard_meal_slot_cook
  BEFORE INSERT OR UPDATE OF cook_id, meal_plan_id ON public.meal_slots
  FOR EACH ROW EXECUTE FUNCTION public.guard_meal_slot_cook();

-- ── 2. Achats habituels ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staples (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name                  text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  quantity              text                 CHECK (quantity IS NULL OR char_length(quantity) <= 40),
  shopping_category_id  uuid                 REFERENCES public.shopping_categories(id) ON DELETE SET NULL,
  position              smallint    NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staples_family ON public.staples(family_id);
COMMENT ON TABLE public.staples IS 'Achats habituels du foyer (lait, pain…) ajoutés en un clic à la liste.';

ALTER TABLE public.staples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staples_select" ON public.staples;
DROP POLICY IF EXISTS "staples_insert" ON public.staples;
DROP POLICY IF EXISTS "staples_update" ON public.staples;
DROP POLICY IF EXISTS "staples_delete" ON public.staples;
CREATE POLICY "staples_select" ON public.staples FOR SELECT USING (public.is_family(family_id));
CREATE POLICY "staples_insert" ON public.staples FOR INSERT WITH CHECK (public.is_family(family_id));
CREATE POLICY "staples_update" ON public.staples FOR UPDATE
  USING (public.is_family(family_id)) WITH CHECK (public.is_family(family_id));
CREATE POLICY "staples_delete" ON public.staples FOR DELETE USING (public.is_family(family_id));

-- ── 3. Placard ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pantry_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pantry_family_name
  ON public.pantry_items (family_id, lower(btrim(name)));
COMMENT ON TABLE public.pantry_items IS 'Produits toujours à la maison : rangés à part dans la liste générée.';

ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pantry_select" ON public.pantry_items;
DROP POLICY IF EXISTS "pantry_insert" ON public.pantry_items;
DROP POLICY IF EXISTS "pantry_update" ON public.pantry_items;
DROP POLICY IF EXISTS "pantry_delete" ON public.pantry_items;
CREATE POLICY "pantry_select" ON public.pantry_items FOR SELECT USING (public.is_family(family_id));
CREATE POLICY "pantry_insert" ON public.pantry_items FOR INSERT WITH CHECK (public.is_family(family_id));
CREATE POLICY "pantry_update" ON public.pantry_items FOR UPDATE
  USING (public.is_family(family_id)) WITH CHECK (public.is_family(family_id));
CREATE POLICY "pantry_delete" ON public.pantry_items FOR DELETE USING (public.is_family(family_id));

-- « Il en manque » : l'article du placard est quand même à acheter cette fois
ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS needed boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.shopping_list_items.needed IS
  'true = produit du placard qu''il faut quand même acheter (sorti de « Sûrement à la maison »).';
