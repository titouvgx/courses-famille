// Types métier — miroir des tables Supabase

export interface Family {
  id: string
  name: string
  created_at: string
}

export interface Profile {
  id: string
  family_id: string
  display_name: string
  role: 'admin' | 'member'
  created_at: string
}

export interface RecipeCategory {
  id: string
  name: string
  color: string
  position: number
}

export interface ShoppingCategory {
  id: string
  name: string
  color: string
  icon: string
  position: number
}

export interface Recipe {
  id: string
  family_id: string
  title: string
  category_id: string | null
  prep_time_min: number | null
  default_portions: number
  image_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Recette enrichie avec sa catégorie (jointure) */
export interface RecipeWithCategory extends Recipe {
  recipe_categories: RecipeCategory | null
}

export interface RecipeIngredient {
  id: string
  recipe_id: string
  name: string
  quantity: number | null
  unit: string | null
  shopping_category_id: string | null
  position: number
}

export interface RecipeStep {
  id: string
  recipe_id: string
  position: number
  instruction: string
}

/** Recette complète avec ingrédients + étapes (page détail / formulaire) */
export interface RecipeDetail extends Recipe {
  recipe_categories: RecipeCategory | null
  recipe_ingredients: RecipeIngredient[]
  recipe_steps: RecipeStep[]
}

// ---------- Planning repas ----------

export interface MealPlan {
  id: string
  family_id: string
  week_start: string          // date ISO (lundi)
  created_at: string
}

export interface MealSlot {
  id: string
  meal_plan_id: string
  day_of_week: number          // 0 = lundi … 6 = dimanche
  meal_type: 'midi' | 'soir'
  recipe_id: string
  portions: number
}

/** Slot enrichi avec les infos de la recette (jointure) */
export interface MealSlotWithRecipe extends MealSlot {
  recipes: {
    id: string
    title: string
    image_url: string | null
    default_portions: number
    prep_time_min: number | null
  }
}

// ---------- Liste de courses ----------

export interface ShoppingList {
  id: string
  family_id: string
  meal_plan_id: string | null
  status: 'active' | 'completed'
  created_at: string
  completed_at: string | null
}

export interface ShoppingListItem {
  id: string
  shopping_list_id: string
  name: string
  quantity: string | null
  shopping_category_id: string | null
  source_recipe_id: string | null
  is_extra: boolean
  checked: boolean
  checked_by: string | null
  checked_at: string | null
  position: number
}

/** Item enrichi avec son rayon (jointure) */
export interface ShoppingListItemWithCategory extends ShoppingListItem {
  shopping_categories: ShoppingCategory | null
}

// ---------- Formulaire ----------

export interface RecipeIngredientInput {
  id?: string
  name: string
  quantity: number | null
  unit: string
  shopping_category_id: string
}

export interface RecipeStepInput {
  id?: string
  instruction: string
}

export interface RecipeFormData {
  title: string
  category_id: string
  prep_time_min: number | null
  default_portions: number
  ingredients: RecipeIngredientInput[]
  steps: RecipeStepInput[]
}
