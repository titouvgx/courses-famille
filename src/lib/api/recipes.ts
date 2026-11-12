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

/** Récupère tous les noms d'ingrédients distincts utilisés par la famille. */
export async function fetchKnownIngredients(familyId: string): Promise<KnownIngredient[]> {
  if (!supabase) return []
  // Jointure : recipe_ingredients → recipes (pour filtrer par famille)
  const { data, error } = await supabase
    .from('recipe_ingredients')
    .select('name, unit, shopping_category_id, recipes!inner(family_id)')
    .eq('recipes.family_id', familyId)
  if (error) throw error

  // Dédupliquer par nom (garder le dernier unit/category utilisé)
  const map = new Map<string, KnownIngredient>()
  for (const row of data ?? []) {
    const lower = row.name.toLowerCase()
    if (!map.has(lower)) {
      map.set(lower, {
        name: row.name,
        unit: row.unit,
        shopping_category_id: row.shopping_category_id,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// ────────── Liste des recettes ──────────

export async function fetchRecipes(familyId: string): Promise<RecipeWithCategory[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_categories(*)')
    .eq('family_id', familyId)
    .order('title')
  if (error) throw error
  return data ?? []
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
