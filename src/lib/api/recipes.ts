// Couche données — Recettes
// Toutes les requêtes Supabase pour le CRUD recettes.

import { supabase } from '../supabase'
import type {
  RecipeWithCategory,
  RecipeDetail,
  RecipeCategory,
  ShoppingCategory,
  RecipeFormData,
} from '../types'

// ────────── Catégories ──────────

export async function fetchRecipeCategories(): Promise<RecipeCategory[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('recipe_categories')
    .select('*')
    .order('position')
  if (error) throw error
  return data ?? []
}

export async function fetchShoppingCategories(): Promise<ShoppingCategory[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('shopping_categories')
    .select('*')
    .order('position')
  if (error) throw error
  return data ?? []
}

// ────────── Ingrédients connus (autocomplétion) ──────────

export interface KnownIngredient {
  name: string
  unit: string | null
  shopping_category_id: string | null
}

/**
 * Récupère les ingrédients connus pour l'autocomplétion.
 * Fusionne deux sources :
 *  1. La table known_ingredients (base de ~250 ingrédients courants)
 *  2. Les ingrédients déjà utilisés dans les recettes de la famille
 * Les ingrédients de la famille ont la priorité (écrasent l'unité/rayon).
 */
export async function fetchKnownIngredients(familyId: string): Promise<KnownIngredient[]> {
  if (!supabase) return []

  // Charger les deux sources en parallèle
  const [globalRes, familyRes] = await Promise.all([
    supabase
      .from('known_ingredients')
      .select('name, default_unit, shopping_category_id'),
    supabase
      .from('recipe_ingredients')
      .select('name, unit, shopping_category_id, recipes!inner(family_id)')
      .eq('recipes.family_id', familyId),
  ])

  if (globalRes.error) throw globalRes.error
  if (familyRes.error) throw familyRes.error

  // Fusionner : les ingrédients de la famille écrasent les globaux
  const map = new Map<string, KnownIngredient>()

  // D'abord les globaux
  for (const row of globalRes.data ?? []) {
    const lower = row.name.toLowerCase()
    if (!map.has(lower)) {
      map.set(lower, {
        name: row.name,
        unit: row.default_unit,
        shopping_category_id: row.shopping_category_id,
      })
    }
  }

  // Ensuite la famille (écrase si même nom)
  for (const row of familyRes.data ?? []) {
    const lower = row.name.toLowerCase()
    map.set(lower, {
      name: row.name,
      unit: row.unit,
      shopping_category_id: row.shopping_category_id,
    })
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// ────────── Liste des recettes (paginée) ──────────

export const RECIPES_PAGE_SIZE = 30

export interface RecipesPage {
  recipes: RecipeWithCategory[]
  /** true s'il reste des recettes après cette page */
  hasMore: boolean
}

/**
 * Charge une page de recettes.
 * @param offset – nombre de recettes à sauter (0 pour la première page)
 */
export async function fetchRecipes(
  familyId: string,
  offset = 0,
  limit = RECIPES_PAGE_SIZE,
): Promise<RecipesPage> {
  if (!supabase) return { recipes: [], hasMore: false }

  // On demande limit + 1 pour savoir s'il reste des résultats après
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_categories(*)')
    .eq('family_id', familyId)
    .order('title')
    .range(offset, offset + limit)

  if (error) throw error

  const rows = data ?? []
  const hasMore = rows.length > limit
  const recipes = hasMore ? rows.slice(0, limit) : rows

  return { recipes, hasMore }
}

// ────────── Détail d'une recette ──────────

export async function fetchRecipe(id: string): Promise<RecipeDetail | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_categories(*),
      recipe_ingredients(*),
      recipe_steps(*)
    `)
    .eq('id', id)
    .single()
  if (error) throw error

  // Trier ingrédients et étapes par position côté client
  if (data) {
    data.recipe_ingredients.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
    data.recipe_steps.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
  }

  return data as RecipeDetail
}

// ────────── Création ──────────

export async function createRecipe(
  familyId: string,
  userId: string,
  form: RecipeFormData,
): Promise<string> {
  if (!supabase) throw new Error('Supabase non configuré')

  // 1. Insérer la recette
  const { data: recipe, error: recipeErr } = await supabase
    .from('recipes')
    .insert({
      family_id: familyId,
      title: form.title.trim(),
      category_id: form.category_id || null,
      prep_time_min: form.prep_time_min,
      default_portions: form.default_portions,
      created_by: userId,
    })
    .select('id')
    .single()

  if (recipeErr) throw recipeErr
  const recipeId = recipe.id

  // 2. Insérer les ingrédients
  if (form.ingredients.length > 0) {
    const rows = form.ingredients.map((ing, i) => ({
      recipe_id: recipeId,
      name: ing.name.trim(),
      quantity: ing.quantity,
      unit: ing.unit || null,
      shopping_category_id: ing.shopping_category_id || null,
      position: i,
    }))
    const { error } = await supabase.from('recipe_ingredients').insert(rows)
    if (error) throw error
  }

  // 3. Insérer les étapes
  if (form.steps.length > 0) {
    const rows = form.steps.map((s, i) => ({
      recipe_id: recipeId,
      position: i,
      instruction: s.instruction.trim(),
    }))
    const { error } = await supabase.from('recipe_steps').insert(rows)
    if (error) throw error
  }

  return recipeId
}

// ────────── Mise à jour ──────────

export async function updateRecipe(
  recipeId: string,
  form: RecipeFormData,
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  // 1. Mettre à jour la recette
  const { error: recipeErr } = await supabase
    .from('recipes')
    .update({
      title: form.title.trim(),
      category_id: form.category_id || null,
      prep_time_min: form.prep_time_min,
      default_portions: form.default_portions,
    })
    .eq('id', recipeId)

  if (recipeErr) throw recipeErr

  // 2. Supprimer les anciens ingrédients + ré-insérer
  const { error: delIng } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', recipeId)
  if (delIng) throw delIng

  if (form.ingredients.length > 0) {
    const rows = form.ingredients.map((ing, i) => ({
      recipe_id: recipeId,
      name: ing.name.trim(),
      quantity: ing.quantity,
      unit: ing.unit || null,
      shopping_category_id: ing.shopping_category_id || null,
      position: i,
    }))
    const { error } = await supabase.from('recipe_ingredients').insert(rows)
    if (error) throw error
  }

  // 3. Supprimer les anciennes étapes + ré-insérer
  const { error: delSteps } = await supabase
    .from('recipe_steps')
    .delete()
    .eq('recipe_id', recipeId)
  if (delSteps) throw delSteps

  if (form.steps.length > 0) {
    const rows = form.steps.map((s, i) => ({
      recipe_id: recipeId,
      position: i,
      instruction: s.instruction.trim(),
    }))
    const { error } = await supabase.from('recipe_steps').insert(rows)
    if (error) throw error
  }
}

// ────────── Suppression ──────────

export async function deleteRecipe(recipeId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId)
  if (error) throw error
}
