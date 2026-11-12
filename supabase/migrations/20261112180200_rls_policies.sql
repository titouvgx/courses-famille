-- ============================================================
-- Migration 003 : Policies RLS — toutes les tables
-- ============================================================
-- Principe général :
--   • SELECT : membres de la même famille (ou super_admin)
--   • INSERT : membres de la même famille
--   • UPDATE : admin de la famille (ou super_admin)
--   • DELETE : admin de la famille (ou super_admin)
--   Exceptions documentées au cas par cas.
-- ============================================================

-- ── families ──────────────────────────────────────────────────
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

CREATE POLICY "families_select"
  ON families FOR SELECT
  USING (is_family(id) OR is_super_admin());

CREATE POLICY "families_insert"
  ON families FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "families_update"
  ON families FOR UPDATE
  USING (is_super_admin());

CREATE POLICY "families_delete"
  ON families FOR DELETE
  USING (is_super_admin());

-- ── profiles ──────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Chaque membre voit les profils de sa famille
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  USING (family_id = user_family_id() OR is_super_admin());

-- Un profil est créé par le super_admin (inscription manuelle)
CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT
  WITH CHECK (is_super_admin());

-- Chaque user peut éditer son propre profil (display_name)
-- L'admin ou super_admin peut changer le rôle
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  USING (id = auth.uid() OR is_admin() OR is_super_admin());

CREATE POLICY "profiles_delete"
  ON profiles FOR DELETE
  USING (is_super_admin());

-- ── super_admins ──────────────────────────────────────────────
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admins_select"
  ON super_admins FOR SELECT
  USING (is_super_admin());

-- INSERT/UPDATE/DELETE uniquement via la console Supabase (pas de policy)

-- ── recipe_categories ─────────────────────────────────────────
ALTER TABLE recipe_categories ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié peut voir les catégories (données globales)
CREATE POLICY "recipe_categories_select"
  ON recipe_categories FOR SELECT
  USING (is_member());

-- Seul le super_admin peut créer/modifier/supprimer les catégories
CREATE POLICY "recipe_categories_insert"
  ON recipe_categories FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "recipe_categories_update"
  ON recipe_categories FOR UPDATE
  USING (is_super_admin());

CREATE POLICY "recipe_categories_delete"
  ON recipe_categories FOR DELETE
  USING (is_super_admin());

-- ── shopping_categories ───────────────────────────────────────
ALTER TABLE shopping_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shopping_categories_select"
  ON shopping_categories FOR SELECT
  USING (is_member());

CREATE POLICY "shopping_categories_insert"
  ON shopping_categories FOR INSERT
  WITH CHECK (is_super_admin());

CREATE POLICY "shopping_categories_update"
  ON shopping_categories FOR UPDATE
  USING (is_super_admin());

CREATE POLICY "shopping_categories_delete"
  ON shopping_categories FOR DELETE
  USING (is_super_admin());

-- ── recipes ───────────────────────────────────────────────────
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Membres voient les recettes de leur famille
CREATE POLICY "recipes_select"
  ON recipes FOR SELECT
  USING (is_family(family_id));

-- Tout membre peut ajouter une recette à sa famille
CREATE POLICY "recipes_insert"
  ON recipes FOR INSERT
  WITH CHECK (is_family(family_id));

-- Tout membre peut modifier les recettes de sa famille
CREATE POLICY "recipes_update"
  ON recipes FOR UPDATE
  USING (is_family(family_id));

-- Seul l'admin de la famille peut supprimer (renommage admin)
CREATE POLICY "recipes_delete"
  ON recipes FOR DELETE
  USING (is_family(family_id) AND (is_admin() OR is_super_admin()));

-- ── recipe_ingredients ────────────────────────────────────────
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- Accès via la recette parente (même famille)
CREATE POLICY "recipe_ingredients_select"
  ON recipe_ingredients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_id AND is_family(r.family_id)
  ));

CREATE POLICY "recipe_ingredients_insert"
  ON recipe_ingredients FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_id AND is_family(r.family_id)
  ));

CREATE POLICY "recipe_ingredients_update"
  ON recipe_ingredients FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_id AND is_family(r.family_id)
  ));

CREATE POLICY "recipe_ingredients_delete"
  ON recipe_ingredients FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_id AND is_family(r.family_id)
  ));

-- ── recipe_steps ──────────────────────────────────────────────
ALTER TABLE recipe_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_steps_select"
  ON recipe_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_id AND is_family(r.family_id)
  ));

CREATE POLICY "recipe_steps_insert"
  ON recipe_steps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_id AND is_family(r.family_id)
  ));

CREATE POLICY "recipe_steps_update"
  ON recipe_steps FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_id AND is_family(r.family_id)
  ));

CREATE POLICY "recipe_steps_delete"
  ON recipe_steps FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM recipes r WHERE r.id = recipe_id AND is_family(r.family_id)
  ));

-- ── meal_plans ────────────────────────────────────────────────
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_plans_select"
  ON meal_plans FOR SELECT
  USING (is_family(family_id));

CREATE POLICY "meal_plans_insert"
  ON meal_plans FOR INSERT
  WITH CHECK (is_family(family_id));

CREATE POLICY "meal_plans_update"
  ON meal_plans FOR UPDATE
  USING (is_family(family_id));

CREATE POLICY "meal_plans_delete"
  ON meal_plans FOR DELETE
  USING (is_family(family_id) AND (is_admin() OR is_super_admin()));

-- ── meal_slots ────────────────────────────────────────────────
ALTER TABLE meal_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_slots_select"
  ON meal_slots FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp WHERE mp.id = meal_plan_id AND is_family(mp.family_id)
  ));

CREATE POLICY "meal_slots_insert"
  ON meal_slots FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM meal_plans mp WHERE mp.id = meal_plan_id AND is_family(mp.family_id)
  ));

CREATE POLICY "meal_slots_update"
  ON meal_slots FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp WHERE mp.id = meal_plan_id AND is_family(mp.family_id)
  ));

CREATE POLICY "meal_slots_delete"
  ON meal_slots FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM meal_plans mp WHERE mp.id = meal_plan_id AND is_family(mp.family_id)
  ));

-- ── shopping_lists ────────────────────────────────────────────
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shopping_lists_select"
  ON shopping_lists FOR SELECT
  USING (is_family(family_id));

CREATE POLICY "shopping_lists_insert"
  ON shopping_lists FOR INSERT
  WITH CHECK (is_family(family_id));

CREATE POLICY "shopping_lists_update"
  ON shopping_lists FOR UPDATE
  USING (is_family(family_id));

CREATE POLICY "shopping_lists_delete"
  ON shopping_lists FOR DELETE
  USING (is_family(family_id) AND (is_admin() OR is_super_admin()));

-- ── shopping_list_items ───────────────────────────────────────
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shopping_list_items_select"
  ON shopping_list_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM shopping_lists sl WHERE sl.id = shopping_list_id AND is_family(sl.family_id)
  ));

CREATE POLICY "shopping_list_items_insert"
  ON shopping_list_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM shopping_lists sl WHERE sl.id = shopping_list_id AND is_family(sl.family_id)
  ));

CREATE POLICY "shopping_list_items_update"
  ON shopping_list_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists sl WHERE sl.id = shopping_list_id AND is_family(sl.family_id)
  ));

CREATE POLICY "shopping_list_items_delete"
  ON shopping_list_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM shopping_lists sl WHERE sl.id = shopping_list_id AND is_family(sl.family_id)
  ));
