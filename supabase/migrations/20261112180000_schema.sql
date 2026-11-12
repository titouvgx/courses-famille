-- ============================================================
-- Migration 001 : Schéma complet — Courses en famille
-- ============================================================
-- Tables : families, profiles, super_admins,
--          recipe_categories, shopping_categories,
--          recipes, recipe_ingredients, recipe_steps,
--          meal_plans, meal_slots,
--          shopping_lists, shopping_list_items
-- ============================================================

-- 1. Familles --------------------------------------------------
CREATE TABLE families (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL    DEFAULT now()
);

COMMENT ON TABLE families IS 'Chaque foyer. 4 foyers prévus.';

-- 2. Profils utilisateurs --------------------------------------
--    Étend auth.users avec la famille et le rôle.
CREATE TABLE profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id     uuid        NOT NULL    REFERENCES families(id) ON DELETE CASCADE,
  display_name  text        NOT NULL,
  role          text        NOT NULL    DEFAULT 'member'
                            CHECK (role IN ('admin', 'member')),
  created_at    timestamptz NOT NULL    DEFAULT now()
);

CREATE INDEX idx_profiles_family ON profiles(family_id);

COMMENT ON TABLE profiles IS 'Un profil par utilisateur Supabase. role = admin | member.';

-- 3. Super-admins ----------------------------------------------
--    Seul Titouan pour le moment. Droit de gérer toutes les familles.
CREATE TABLE super_admins (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL    DEFAULT now()
);

COMMENT ON TABLE super_admins IS 'Administrateurs globaux (gestion inter-familles).';

-- 4. Catégories de recettes ------------------------------------
CREATE TABLE recipe_categories (
  id        uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text      NOT NULL UNIQUE,
  color     text      NOT NULL DEFAULT '#888888',
  position  smallint  NOT NULL DEFAULT 0
);

COMMENT ON TABLE recipe_categories IS 'Plat, Entrée, Dessert, Accompagnement…';

-- 5. Catégories de courses (rayons) ----------------------------
CREATE TABLE shopping_categories (
  id        uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text      NOT NULL UNIQUE,
  color     text      NOT NULL DEFAULT '#888888',
  position  smallint  NOT NULL DEFAULT 0
);

COMMENT ON TABLE shopping_categories IS 'Rayons supermarché : Fruits & légumes, Viandes, etc.';

-- 6. Recettes --------------------------------------------------
CREATE TABLE recipes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         uuid        NOT NULL    REFERENCES families(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  category_id       uuid                    REFERENCES recipe_categories(id) ON DELETE SET NULL,
  prep_time_min     smallint,
  default_portions  smallint    NOT NULL    DEFAULT 4
                                CHECK (default_portions > 0),
  created_by        uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL    DEFAULT now(),
  updated_at        timestamptz NOT NULL    DEFAULT now()
);

CREATE INDEX idx_recipes_family   ON recipes(family_id);
CREATE INDEX idx_recipes_category ON recipes(category_id);

COMMENT ON TABLE recipes IS 'Catalogue partagé par famille. Tout membre peut ajouter.';

-- 7. Ingrédients d'une recette --------------------------------
CREATE TABLE recipe_ingredients (
  id                    uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id             uuid      NOT NULL  REFERENCES recipes(id) ON DELETE CASCADE,
  name                  text      NOT NULL,
  quantity              numeric,
  unit                  text,
  shopping_category_id  uuid                REFERENCES shopping_categories(id) ON DELETE SET NULL,
  position              smallint  NOT NULL  DEFAULT 0
);

CREATE INDEX idx_ingredients_recipe ON recipe_ingredients(recipe_id);

COMMENT ON TABLE recipe_ingredients IS 'Chaque ligne = un ingrédient avec quantité pour default_portions.';

-- 8. Étapes de préparation ------------------------------------
CREATE TABLE recipe_steps (
  id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid      NOT NULL  REFERENCES recipes(id) ON DELETE CASCADE,
  position    smallint  NOT NULL,
  instruction text      NOT NULL
);

CREATE INDEX idx_steps_recipe ON recipe_steps(recipe_id);

COMMENT ON TABLE recipe_steps IS 'Étapes de la recette, triées par position.';

-- 9. Plans de repas (semaine) ---------------------------------
CREATE TABLE meal_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid        NOT NULL    REFERENCES families(id) ON DELETE CASCADE,
  week_start  date        NOT NULL,
  created_at  timestamptz NOT NULL    DEFAULT now(),

  CONSTRAINT uq_meal_plan_family_week UNIQUE (family_id, week_start)
);

CREATE INDEX idx_meal_plans_family ON meal_plans(family_id);

COMMENT ON TABLE meal_plans IS 'Un plan par famille par semaine. week_start = lundi.';

-- 10. Créneaux de repas (slots) --------------------------------
CREATE TABLE meal_slots (
  id            uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id  uuid      NOT NULL  REFERENCES meal_plans(id) ON DELETE CASCADE,
  day_of_week   smallint  NOT NULL  CHECK (day_of_week BETWEEN 0 AND 6),
  meal_type     text      NOT NULL  CHECK (meal_type IN ('midi', 'soir')),
  recipe_id     uuid      NOT NULL  REFERENCES recipes(id) ON DELETE CASCADE,
  portions      smallint  NOT NULL  DEFAULT 4
                          CHECK (portions > 0),

  CONSTRAINT uq_slot UNIQUE (meal_plan_id, day_of_week, meal_type)
);

CREATE INDEX idx_slots_plan ON meal_slots(meal_plan_id);

COMMENT ON TABLE meal_slots IS 'Chaque case du planning : jour × midi/soir → recette + couverts.';
COMMENT ON COLUMN meal_slots.day_of_week IS '0 = lundi … 6 = dimanche';

-- 11. Listes de courses ----------------------------------------
CREATE TABLE shopping_lists (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid        NOT NULL    REFERENCES families(id) ON DELETE CASCADE,
  meal_plan_id  uuid                    REFERENCES meal_plans(id) ON DELETE SET NULL,
  status        text        NOT NULL    DEFAULT 'active'
                            CHECK (status IN ('active', 'completed')),
  created_at    timestamptz NOT NULL    DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX idx_shopping_lists_family ON shopping_lists(family_id);

COMMENT ON TABLE shopping_lists IS 'Générée à partir du planning. "Terminer" passe en completed.';

-- 12. Articles d'une liste de courses --------------------------
CREATE TABLE shopping_list_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id      uuid        NOT NULL  REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  quantity              text,
  shopping_category_id  uuid                  REFERENCES shopping_categories(id) ON DELETE SET NULL,
  source_recipe_id      uuid                  REFERENCES recipes(id) ON DELETE SET NULL,
  is_extra              boolean     NOT NULL  DEFAULT false,
  checked               boolean     NOT NULL  DEFAULT false,
  checked_by            uuid                  REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at            timestamptz,
  position              smallint    NOT NULL  DEFAULT 0
);

CREATE INDEX idx_items_list     ON shopping_list_items(shopping_list_id);
CREATE INDEX idx_items_checked  ON shopping_list_items(shopping_list_id, checked);

COMMENT ON TABLE shopping_list_items IS 'Article généré ou ajouté manuellement (is_extra). quantity en texte libre.';

-- Trigger : updated_at auto sur recipes -----------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
