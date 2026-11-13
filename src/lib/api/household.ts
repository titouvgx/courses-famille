// Couche données — Vie du foyer
//   • membres du foyer et « Qui cuisine ? »
//   • achats habituels (staples)
//   • placard (pantry_items) et « il en manque » (shopping_list_items.needed)
//   • index des ingrédients de toutes les recettes (page « Qu'est-ce qu'on mange ? »)
// Tables créées par la migration 20261113140000_household.sql (RLS par foyer).

import { supabase } from '../supabase'
import { getMonday, toISODate } from './meals'
import { ingredientKey, sameProduct } from '../quantities'
import type { FamilyMember, PantryItem, Staple, ShoppingListItem } from '../types'

function db() {
  if (!supabase) throw new Error('Supabase non configuré')
  return supabase
}

// ────────── Membres et cuisinier ──────────

/** Membres du foyer, triés par nom (RLS : on ne voit que son foyer). */
export async function fetchFamilyMembers(familyId: string): Promise<FamilyMember[]> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, display_name, role')
    .eq('family_id', familyId)
    .order('display_name')
  if (error) throw error
  return (data ?? []) as FamilyMember[]
}

/** Choisit qui cuisine un repas (null = personne). La base refuse un membre d'un autre foyer. */
export async function setSlotCook(slotId: string, cookId: string | null): Promise<void> {
  const { error } = await db().from('meal_slots').update({ cook_id: cookId }).eq('id', slotId)
  if (error) throw error
}

export interface TodayMeal {
  slotId: string
  mealType: 'midi' | 'soir'
  recipeId: string
  title: string
  imageUrl: string | null
  cookId: string | null
  cookName: string | null
}

/** Repas prévus aujourd'hui (midi puis soir), avec le cuisinier. Lecture seule : ne crée aucun plan. */
export async function fetchTodayMeals(familyId: string, now = new Date()): Promise<TodayMeal[]> {
  const weekStart = toISODate(getMonday(now))
  const day = (now.getDay() + 6) % 7 // 0 = lundi

  const { data: plan, error: planErr } = await db()
    .from('meal_plans')
    .select('id')
    .eq('family_id', familyId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (planErr) throw planErr
  if (!plan) return []

  const { data, error } = await db()
    .from('meal_slots')
    .select('*, recipes (id, title, image_url)')
    .eq('meal_plan_id', plan.id)
    .eq('day_of_week', day)
  if (error) throw error

  const slots = (data ?? []) as any[]
  const cookIds = [...new Set(slots.map((s) => s.cook_id).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (cookIds.length > 0) {
    const { data: people } = await db().from('profiles').select('id, display_name').in('id', cookIds)
    for (const p of people ?? []) names.set(p.id, p.display_name)
  }

  return slots
    .filter((s) => s.recipes)
    .sort((a, b) => (a.meal_type === b.meal_type ? 0 : a.meal_type === 'midi' ? -1 : 1))
    .map((s) => ({
      slotId: s.id,
      mealType: s.meal_type,
      recipeId: s.recipes.id,
      title: s.recipes.title,
      imageUrl: s.recipes.image_url,
      cookId: s.cook_id ?? null,
      cookName: s.cook_id ? names.get(s.cook_id) ?? null : null,
    }))
}

// ────────── Achats habituels ──────────

export async function fetchStaples(familyId: string): Promise<Staple[]> {
  const { data, error } = await db()
    .from('staples')
    .select('*')
    .eq('family_id', familyId)
    .order('position')
    .order('created_at')
  if (error) throw error
  return (data ?? []) as Staple[]
}

export async function addStaple(
  familyId: string,
  name: string,
  quantity: string | null,
  shoppingCategoryId: string | null,
  position: number,
): Promise<Staple> {
  const { data, error } = await db()
    .from('staples')
    .insert({
      family_id: familyId,
      name: name.trim(),
      quantity: quantity?.trim() || null,
      shopping_category_id: shoppingCategoryId || null,
      position,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Staple
}

export async function removeStaple(id: string): Promise<void> {
  const { error } = await db().from('staples').delete().eq('id', id)
  if (error) throw error
}

/**
 * Ajoute des habituels à la liste comme articles « ajoutés à la main » (is_extra :
 * ils restent quand on met la liste à jour). Un article identique pas encore
 * coché déjà présent n'est pas ajouté en double.
 * @returns le nombre d'articles réellement ajoutés
 */
export async function addStaplesToList(listId: string, staples: Staple[]): Promise<number> {
  const { data: existing, error: exErr } = await db()
    .from('shopping_list_items')
    .select('name, checked, position')
    .eq('shopping_list_id', listId)
  if (exErr) throw exErr

  const already = new Set(
    (existing ?? []).filter((i) => !i.checked).map((i) => ingredientKey(i.name)),
  )
  let position = (existing ?? []).reduce((m, i) => Math.max(m, i.position ?? 0), -1) + 1

  const rows = staples
    .filter((s) => !already.has(ingredientKey(s.name)))
    .map((s) => ({
      shopping_list_id: listId,
      name: s.name,
      quantity: s.quantity,
      shopping_category_id: s.shopping_category_id,
      is_extra: true,
      checked: false,
      position: position++,
    }))
  if (rows.length === 0) return 0

  const { error } = await db().from('shopping_list_items').insert(rows)
  if (error) throw error
  return rows.length
}

// ────────── Placard ──────────

export async function fetchPantry(familyId: string): Promise<PantryItem[]> {
  const { data, error } = await db()
    .from('pantry_items')
    .select('id, family_id, name')
    .eq('family_id', familyId)
    .order('name')
  if (error) throw error
  return (data ?? []) as PantryItem[]
}

/** Ajoute au placard (un doublon, même écrit autrement, est ignoré). */
export async function addPantryItem(familyId: string, name: string): Promise<PantryItem | null> {
  const { data, error } = await db()
    .from('pantry_items')
    .insert({ family_id: familyId, name: name.trim() })
    .select('id, family_id, name')
    .single()
  if (error) {
    if (error.code === '23505') return null // déjà au placard
    throw error
  }
  return data as PantryItem
}

export async function removePantryItem(id: string): Promise<void> {
  const { error } = await db().from('pantry_items').delete().eq('id', id)
  if (error) throw error
}

/** Vrai si l'article correspond à un produit du placard. */
export function isInPantry(name: string, pantry: PantryItem[]): boolean {
  return pantry.some((p) => sameProduct(name, p.name))
}

/**
 * Article à ranger dans « Sûrement déjà à la maison » : issu du planning (pas
 * ajouté à la main), pas encore pris, pas marqué « il en manque », et au placard.
 */
export function isProbablyAtHome(item: ShoppingListItem, pantry: PantryItem[]): boolean {
  return !item.is_extra && !item.checked && !item.needed && isInPantry(item.name, pantry)
}

/** « Il en manque » (true) : l'article repasse dans la liste pour tous les membres. */
export async function setItemNeeded(itemId: string, needed: boolean): Promise<void> {
  const { error } = await db().from('shopping_list_items').update({ needed }).eq('id', itemId)
  if (error) throw error
}

// ────────── Index des ingrédients (« Qu'est-ce qu'on mange ? ») ──────────

export interface RecipeIngredientRef {
  recipe_id: string
  name: string
}

/**
 * Noms des ingrédients de TOUTES les recettes (partagées entre foyers).
 * Lu par pages de 1000 : c'est le plafond par requête de Supabase.
 */
export async function fetchAllRecipeIngredients(): Promise<RecipeIngredientRef[]> {
  const PAGE = 1000
  const out: RecipeIngredientRef[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from('recipe_ingredients')
      .select('recipe_id, name')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as RecipeIngredientRef[]))
    if (!data || data.length < PAGE) break
    if (from > 50_000) break // garde-fou
  }
  return out
}

export interface FridgeMatch {
  recipeId: string
  /** Ingrédients de la recette qu'on a (frigo ou placard) */
  have: string[]
  /** Ingrédients qui manquent */
  missing: string[]
  /** Combien d'ingrédients du frigo la recette utilise (pour départager) */
  usesFromFridge: number
}

/**
 * Classe les recettes selon ce qu'on a : d'abord celles où il manque le moins,
 * puis celles qui utilisent le plus d'ingrédients du frigo. Une recette qui
 * n'utilise RIEN du frigo est écartée (sinon « sel + poivre » remonterait tout).
 */
export function rankByFridge(
  ingredients: RecipeIngredientRef[],
  fridge: string[],
  pantry: string[],
): FridgeMatch[] {
  const byRecipe = new Map<string, string[]>()
  for (const ing of ingredients) {
    const list = byRecipe.get(ing.recipe_id)
    if (list) list.push(ing.name)
    else byRecipe.set(ing.recipe_id, [ing.name])
  }

  const matches: FridgeMatch[] = []
  for (const [recipeId, names] of byRecipe) {
    const have: string[] = []
    const missing: string[] = []
    let usesFromFridge = 0
    for (const n of names) {
      const inFridge = fridge.some((f) => sameProduct(n, f))
      if (inFridge) usesFromFridge++
      if (inFridge || pantry.some((p) => sameProduct(n, p))) have.push(n)
      else missing.push(n)
    }
    if (usesFromFridge > 0) matches.push({ recipeId, have, missing, usesFromFridge })
  }

  return matches.sort(
    (a, b) =>
      a.missing.length - b.missing.length ||
      b.usesFromFridge - a.usesFromFridge ||
      a.recipeId.localeCompare(b.recipeId),
  )
}
