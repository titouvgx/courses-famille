// Couche données — Recettes
// Toutes les requêtes Supabase pour le CRUD recettes.

import { supabase } from '../supabase'
import { pickSeeded } from '../random'
import { normalizeText } from '../quantities'
import {
  uploadRecipeImage,
  deleteRecipeImage,
  PhotoUploadError,
  RECIPE_PHOTOS_BUCKET,
  type PhotoChange,
} from './recipeImages'
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
  offset = 0,
  limit = RECIPES_PAGE_SIZE,
): Promise<RecipesPage> {
  if (!supabase) return { recipes: [], hasMore: false }

  // Les recettes sont partagées entre tous les foyers (RLS is_member)
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_categories(*)')
    .order('title')
    .range(offset, offset + limit)

  if (error) throw error

  const rows = data ?? []
  const hasMore = rows.length > limit
  const recipes = hasMore ? rows.slice(0, limit) : rows

  return { recipes, hasMore }
}

// ────────── Recherche (toute la base, sans accents) ──────────
//
// Une famille a au plus quelques centaines de recettes : on charge UNE fois
// un index léger (id, titre, catégorie ≈ 60 octets par recette), on filtre
// côté client (instantané, insensible à la casse et aux accents), puis on ne
// charge les recettes complètes (photo, temps…) que page par page.
// Avantage : aucune migration SQL (pas besoin de l'extension unaccent).

/** Taille des blocs lus pour l'index (PostgREST plafonne souvent à 1000 lignes). */
const INDEX_CHUNK = 1000

export interface RecipeIndexEntry {
  id: string
  title: string
  category_id: string | null
  /** Titre normalisé pour la recherche (voir searchKey) */
  key: string
}

/**
 * Clé de recherche : minuscules, sans accents, ligatures dépliées
 * (« Bœuf » est trouvé en tapant « boeuf »), ponctuation → espace.
 */
export function searchKey(text: string): string {
  return normalizeText(text.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae'))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Index léger de TOUTES les recettes, trié par titre (ordre français). */
export async function fetchRecipeIndex(): Promise<RecipeIndexEntry[]> {
  if (!supabase) return []

  const rows: { id: string; title: string; category_id: string | null }[] = []
  for (let from = 0; ; from += INDEX_CHUNK) {
    const { data, error } = await supabase
      .from('recipes')
      .select('id, title, category_id')
      .order('title')
      .order('id')
      .range(from, from + INDEX_CHUNK - 1)
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < INDEX_CHUNK) break
  }

  return rows
    .map((r) => ({ id: r.id, title: r.title, category_id: r.category_id, key: searchKey(r.title) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
}

/**
 * Filtre l'index : catégorie exacte + chaque mot tapé doit apparaître dans le
 * titre (dans n'importe quel ordre : « pomme gratin » trouve « Gratin de pommes »).
 */
export function filterRecipeIndex(
  index: RecipeIndexEntry[],
  query: string,
  categoryId: string | null,
): RecipeIndexEntry[] {
  const words = searchKey(query).split(' ').filter(Boolean)
  return index.filter((r) =>
    (!categoryId || r.category_id === categoryId) &&
    words.every((w) => r.key.includes(w)),
  )
}

/** Recettes complètes (avec catégorie) pour une liste d'id, dans l'ordre demandé. */
export async function fetchRecipesByIds(ids: string[]): Promise<RecipeWithCategory[]> {
  if (!supabase || ids.length === 0) return []
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_categories(*)')
    .in('id', ids)
  if (error) throw error
  const byId = new Map((data ?? []).map((r) => [r.id, r as RecipeWithCategory]))
  return ids.map((id) => byId.get(id)).filter((r): r is RecipeWithCategory => !!r)
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

/**
 * Crée la recette, puis (si fournie) envoie sa photo.
 * Ordre : la ligne `recipes` d'abord (la règle RLS du stockage vérifie que le
 * dossier `<recipeId>/` appartient à une recette du foyer), puis la photo,
 * puis `image_url`. Si la photo échoue, la recette reste enregistrée et une
 * PhotoUploadError est levée (avec recipeId) — aucun fichier orphelin.
 */
export async function createRecipe(
  familyId: string,
  userId: string,
  form: RecipeFormData,
  photo: PhotoChange = { kind: 'keep' },
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

  // 4. Photo (après coup : il faut l'id de la recette pour le dossier)
  if (photo.kind === 'replace') {
    let url: string | null = null
    try {
      url = await uploadRecipeImage(recipeId, photo.image)
      const { error } = await supabase
        .from('recipes')
        .update({ image_url: url })
        .eq('id', recipeId)
      if (error) throw error
    } catch (e) {
      // Fichier envoyé mais URL non enregistrée : on le retire pour ne pas laisser d'orphelin
      if (url) await deleteRecipeImage(url)
      throw new PhotoUploadError(recipeId, e)
    }
  }

  return recipeId
}

// ────────── Mise à jour ──────────

/**
 * Met à jour la recette. Pour la photo :
 *  - 'replace' : la nouvelle photo est envoyée AVANT la mise à jour de la ligne ;
 *    si la mise à jour échoue, le nouveau fichier est supprimé. Une fois la
 *    ligne à jour, l'ancien fichier (s'il vient de notre bucket) est supprimé.
 *  - 'remove'  : image_url → null, puis suppression de l'ancien fichier.
 *  - 'keep'    : image_url n'est pas touchée.
 */
export async function updateRecipe(
  recipeId: string,
  form: RecipeFormData,
  photo: PhotoChange = { kind: 'keep' },
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  // 0. Photo : lire l'URL actuelle (source de vérité = la base) puis envoyer la nouvelle
  let previousUrl: string | null = null
  let newUrl: string | null = null
  if (photo.kind !== 'keep') {
    const { data, error } = await supabase
      .from('recipes')
      .select('image_url')
      .eq('id', recipeId)
      .single()
    if (error) throw error
    previousUrl = data?.image_url ?? null
  }
  if (photo.kind === 'replace') {
    newUrl = await uploadRecipeImage(recipeId, photo.image)
  }

  // 1. Mettre à jour la recette
  const patch: Record<string, unknown> = {
    title: form.title.trim(),
    category_id: form.category_id || null,
    prep_time_min: form.prep_time_min,
    default_portions: form.default_portions,
  }
  if (photo.kind !== 'keep') patch.image_url = newUrl

  const { error: recipeErr } = await supabase
    .from('recipes')
    .update(patch)
    .eq('id', recipeId)

  if (recipeErr) {
    // Ne supprimer la nouvelle photo que si elle n'a vraiment pas été enregistrée
    // (la mise à jour peut avoir réussi côté serveur et seule la réponse s'est perdue)
    if (newUrl) {
      const { data: check } = await supabase.from('recipes').select('image_url').eq('id', recipeId).maybeSingle()
      if (check?.image_url !== newUrl) await deleteRecipeImage(newUrl)
    }
    throw recipeErr
  }

  // L'ancienne photo n'est plus référencée : on la retire du stockage (pas les URL Unsplash)
  if (photo.kind !== 'keep' && previousUrl && previousUrl !== newUrl) {
    await deleteRecipeImage(previousUrl)
  }

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

  // URL de la photo, lue avant la suppression de la ligne
  const { data: current } = await supabase
    .from('recipes')
    .select('image_url')
    .eq('id', recipeId)
    .maybeSingle()

  const { data: deleted, error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId)
    .select('id')
  if (error) throw error

  // Le fichier n'est supprimé que si la ligne l'a bien été (RLS peut filtrer
  // silencieusement un DELETE non autorisé : 0 ligne, pas d'erreur).
  if (deleted && deleted.length > 0) {
    await deleteRecipeImage(current?.image_url)
    // Vider aussi tout le dossier de la recette : récupère les photos restées
    // orphelines après un échec précédent. Jamais bloquant.
    try {
      const bucket = supabase.storage.from(RECIPE_PHOTOS_BUCKET)
      const { data: files } = await bucket.list(recipeId, { limit: 100 })
      const paths = (files ?? []).filter((f) => f.id).map((f) => `${recipeId}/${f.name}`)
      if (paths.length > 0) await bucket.remove(paths)
    } catch (e) {
      console.warn('Nettoyage des photos de la recette impossible :', e)
    }
  }
}

// ────────── Recettes du jour (page d'accueil) ──────────

export const DAILY_RECIPES_COUNT = 5

/** Date locale au format AAAA-MM-JJ (pas l'heure UTC, sinon ça change à 1h du matin). */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Les 5 recettes du jour.
 * Le tirage dépend uniquement de la date : toute la famille voit les mêmes
 * recettes toute la journée, et la sélection change à minuit.
 * Deux requêtes légères : la liste des id, puis les 5 recettes choisies.
 */
export async function fetchDailyRecipes(
  dateKey = todayKey(),
  count = DAILY_RECIPES_COUNT,
): Promise<RecipeWithCategory[]> {
  if (!supabase) return []

  const { data: idRows, error: idErr } = await supabase
    .from('recipes')
    .select('id')
    .order('id') // ordre stable, indispensable pour que le tirage soit reproductible

  if (idErr) throw idErr
  const ids = (idRows ?? []).map((r: { id: string }) => r.id)
  if (ids.length === 0) return []

  const picked = pickSeeded(ids, count, `courses-famille:${dateKey}`)

  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_categories(*)')
    .in('id', picked)

  if (error) throw error

  // Remettre les recettes dans l'ordre du tirage
  const byId = new Map((data ?? []).map((r) => [r.id, r as RecipeWithCategory]))
  return picked.map((id) => byId.get(id)).filter((r): r is RecipeWithCategory => !!r)
}
