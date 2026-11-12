-- ============================================================
-- Migration : Recettes partagées entre tous les foyers
-- ============================================================
-- Les recettes sont visibles par TOUS les membres authentifiés.
-- Seul le foyer créateur peut modifier/supprimer ses recettes.
-- Les plans de repas et listes de courses restent par foyer.
-- ============================================================

-- ── recipes : SELECT ouvert à tous les membres ──────────────
DROP POLICY "recipes_select" ON recipes;
CREATE POLICY "recipes_select"
  ON recipes FOR SELECT
  USING (is_member());

-- INSERT/UPDATE/DELETE restent inchangés (liés au foyer créateur)

-- ── recipe_ingredients : SELECT ouvert ───────────────────────
DROP POLICY "recipe_ingredients_select" ON recipe_ingredients;
CREATE POLICY "recipe_ingredients_select"
  ON recipe_ingredients FOR SELECT
  USING (is_member());

-- INSERT/UPDATE/DELETE restent liés au foyer de la recette parente

-- ── recipe_steps : SELECT ouvert ─────────────────────────────
DROP POLICY "recipe_steps_select" ON recipe_steps;
CREATE POLICY "recipe_steps_select"
  ON recipe_steps FOR SELECT
  USING (is_member());

-- INSERT/UPDATE/DELETE restent liés au foyer de la recette parente
