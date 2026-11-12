// Couche données — Liste de courses
// Génération depuis le planning, cochage, ajout manuel.

import { supabase } from '../supabase'
import type {
  ShoppingList,
  ShoppingListItemWithCategory,
  ShoppingCategory,
} from '../types'

// ────────── Liste active ──────────

/**
 * Récupère la liste de courses active du foyer (s'il y en a une).
 */
export async function fetchActiveList(
  familyId: string,
): Promise<ShoppingList | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as ShoppingList | null
}

/**
 * Charge les articles d'une liste avec leur rayon.
 */
export async function fetchListItems(
  listId: string,
): Promise<ShoppingListItemWithCategory[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('shopping_list_items')
    .select('*, shopping_categories(*)')
    .eq('shopping_list_id', listId)
    .order('position')

  if (error) throw error
  return (data ?? []) as ShoppingListItemWithCategory[]
}

// ────────── Historique (listes terminées) ──────────

/**
 * Récupère les listes terminées du foyer, triées par date (récentes d'abord).
 */
export async function fetchCompletedLists(
  familyId: string,
  limit = 20,
): Promise<ShoppingList[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('family_id', familyId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as ShoppingList[]
}

// ────────── Génération depuis le planning ──────────

interface AggregatedIngredient {
  name: string
  quantity: string
  shopping_category_id: string | null
  source_recipe_id: string | null
}

/**
 * Génère une liste de courses à partir du plan de la semaine.
 * Agrège les ingrédients identiques et ajuste les quantités selon les portions.
 */
export async function generateListFromPlan(
  familyId: string,
  planId: string,
): Promise<ShoppingList> {
  if (!supabase) throw new Error('Supabase non configuré')

  // 1. Récupérer les slots du plan avec les ingrédients de chaque recette
  const { data: slots, error: slotsErr } = await supabase
    .from('meal_slots')
    .select(`
      portions,
      recipe_id,
      recipes (
        id,
        default_portions,
        recipe_ingredients (
          name,
          quantity,
          unit,
          shopping_category_id
        )
      )
    `)
    .eq('meal_plan_id', planId)

  if (slotsErr) throw slotsErr
  if (!slots || slots.length === 0) {
    throw new Error('Le planning est vide. Ajoute des recettes avant de générer la liste.')
  }

  // 2. Agréger les ingrédients
  const aggregated = new Map<string, AggregatedIngredient>()

  for (const slot of slots) {
    const recipe = slot.recipes as any
    if (!recipe?.recipe_ingredients) continue

    const scale = slot.portions / (recipe.default_portions || 4)

    for (const ing of recipe.recipe_ingredients) {
      const key = ing.name.toLowerCase().trim()
      const scaledQty = ing.quantity ? Math.round(ing.quantity * scale * 100) / 100 : null
      const unit = ing.unit || ''
      const qtyStr = scaledQty ? `${scaledQty}${unit ? ' ' + unit : ''}` : unit || null

      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!
        // Essayer d'additionner les quantités si même unité
        if (scaledQty && existing.quantity) {
          const existingMatch = existing.quantity.match(/^([\d.]+)\s*(.*)$/)
          if (existingMatch) {
            const existingQty = parseFloat(existingMatch[1])
            const existingUnit = existingMatch[2].trim()
            if (existingUnit === unit) {
              const total = Math.round((existingQty + scaledQty) * 100) / 100
              existing.quantity = `${total}${unit ? ' ' + unit : ''}`
              continue
            }
          }
        }
        // Si les unités ne matchent pas, concaténer
        if (qtyStr && existing.quantity) {
          existing.quantity = `${existing.quantity} + ${qtyStr}`
        } else if (qtyStr) {
          existing.quantity = qtyStr
        }
      } else {
        aggregated.set(key, {
          name: ing.name.trim(),
          quantity: qtyStr,
          shopping_category_id: ing.shopping_category_id,
          source_recipe_id: recipe.id,
        })
      }
    }
  }

  // 3. Créer la liste
  const { data: list, error: listErr } = await supabase
    .from('shopping_lists')
    .insert({
      family_id: familyId,
      meal_plan_id: planId,
      status: 'active',
    })
    .select('*')
    .single()

  if (listErr) throw listErr

  // 4. Insérer les articles
  const items = Array.from(aggregated.values()).map((ing, i) => ({
    shopping_list_id: list.id,
    name: ing.name,
    quantity: ing.quantity,
    shopping_category_id: ing.shopping_category_id,
    source_recipe_id: ing.source_recipe_id,
    is_extra: false,
    checked: false,
    position: i,
  }))

  if (items.length > 0) {
    const { error: itemsErr } = await supabase
      .from('shopping_list_items')
      .insert(items)
    if (itemsErr) throw itemsErr
  }

  return list as ShoppingList
}

// ────────── Actions sur les articles ──────────

/**
 * Coche ou décoche un article.
 */
export async function toggleItem(
  itemId: string,
  checked: boolean,
  userId: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  const { error } = await supabase
    .from('shopping_list_items')
    .update({
      checked,
      checked_by: checked ? userId : null,
      checked_at: checked ? new Date().toISOString() : null,
    })
    .eq('id', itemId)

  if (error) throw error
}

/**
 * Ajoute un article manuellement (hors recettes).
 */
export async function addExtraItem(
  listId: string,
  name: string,
  quantity: string | null,
  shoppingCategoryId: string | null,
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  // Trouver la position max pour mettre à la fin
  const { data: maxPos } = await supabase
    .from('shopping_list_items')
    .select('position')
    .eq('shopping_list_id', listId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPos = (maxPos?.position ?? -1) + 1

  const { error } = await supabase
    .from('shopping_list_items')
    .insert({
      shopping_list_id: listId,
      name: name.trim(),
      quantity: quantity?.trim() || null,
      shopping_category_id: shoppingCategoryId,
      is_extra: true,
      checked: false,
      position: nextPos,
    })

  if (error) throw error
}

/**
 * Supprime un article de la liste.
 */
export async function removeItem(itemId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('id', itemId)

  if (error) throw error
}

/**
 * Marque la liste comme terminée.
 */
export async function completeList(listId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  const { error } = await supabase
    .from('shopping_lists')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', listId)

  if (error) throw error
}

/**
 * Supprime une liste et tous ses articles.
 */
export async function deleteList(listId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  const { error } = await supabase
    .from('shopping_lists')
    .delete()
    .eq('id', listId)

  if (error) throw error
}
