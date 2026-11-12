// Couche données — Planning des repas
// CRUD pour meal_plans et meal_slots.

import { supabase } from '../supabase'
import type { MealPlan, MealSlotWithRecipe } from '../types'

// ────────── Utilitaires dates ──────────

/** Retourne le lundi de la semaine contenant `date`. */
export function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0 = dimanche, 1 = lundi…
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Formate en YYYY-MM-DD (format attendu par Supabase pour le type date). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Avance ou recule d'un nombre de semaines. */
export function shiftWeek(monday: Date, weeks: number): Date {
  const d = new Date(monday)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

// ────────── Plan de la semaine ──────────

/**
 * Récupère (ou crée) le plan de repas pour une semaine donnée.
 * @param familyId – UUID du foyer
 * @param weekStart – date du lundi (YYYY-MM-DD)
 */
export async function fetchOrCreatePlan(
  familyId: string,
  weekStart: string,
): Promise<MealPlan> {
  if (!supabase) throw new Error('Supabase non configuré')

  // 1. Essayer de récupérer le plan existant
  const { data: existing, error: selErr } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('family_id', familyId)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (selErr) throw selErr
  if (existing) return existing as MealPlan

  // 2. Le plan n'existe pas → le créer
  const { data: created, error: insErr } = await supabase
    .from('meal_plans')
    .insert({ family_id: familyId, week_start: weekStart })
    .select('*')
    .single()

  if (insErr) throw insErr
  return created as MealPlan
}

// ────────── Slots (créneaux) ──────────

/**
 * Charge tous les slots d'un plan avec les infos de la recette.
 */
export async function fetchSlots(planId: string): Promise<MealSlotWithRecipe[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('meal_slots')
    .select(`
      *,
      recipes (
        id,
        title,
        image_url,
        default_portions,
        prep_time_min
      )
    `)
    .eq('meal_plan_id', planId)
    .order('day_of_week')

  if (error) throw error
  return (data ?? []) as MealSlotWithRecipe[]
}

/**
 * Ajoute ou remplace un créneau (upsert via DELETE + INSERT
 * car Supabase JS ne gère pas l'upsert sur contrainte composite facilement).
 */
export async function setSlot(
  planId: string,
  dayOfWeek: number,
  mealType: 'midi' | 'soir',
  recipeId: string,
  portions: number,
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  // Supprimer l'ancien slot s'il existe
  await supabase
    .from('meal_slots')
    .delete()
    .eq('meal_plan_id', planId)
    .eq('day_of_week', dayOfWeek)
    .eq('meal_type', mealType)

  // Insérer le nouveau
  const { error } = await supabase
    .from('meal_slots')
    .insert({
      meal_plan_id: planId,
      day_of_week: dayOfWeek,
      meal_type: mealType,
      recipe_id: recipeId,
      portions,
    })

  if (error) throw error
}

/**
 * Supprime un créneau (libère la case).
 */
export async function removeSlot(slotId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  const { error } = await supabase
    .from('meal_slots')
    .delete()
    .eq('id', slotId)

  if (error) throw error
}

/**
 * Met à jour le nombre de portions d'un créneau.
 */
export async function updateSlotPortions(
  slotId: string,
  portions: number,
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré')

  const { error } = await supabase
    .from('meal_slots')
    .update({ portions })
    .eq('id', slotId)

  if (error) throw error
}
