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
