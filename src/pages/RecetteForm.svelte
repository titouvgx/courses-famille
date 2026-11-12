<script lang="ts">
  import { router, href, navigate } from '../lib/router.svelte'
  import { auth } from '../lib/auth.svelte'
  import { profileState } from '../lib/profile.svelte'
  import {
    fetchRecipe,
    fetchRecipeCategories,
    fetchShoppingCategories,
    createRecipe,
    updateRecipe,
  } from '../lib/api/recipes'
  import type {
    RecipeCategory,
    ShoppingCategory,
    RecipeFormData,
    RecipeIngredientInput,
    RecipeStepInput,
  } from '../lib/types'

  // Props
  interface Props {
    editId?: string | null
  }
  let { editId = null }: Props = $props()

  const isEdit = $derived(Boolean(editId))

  // État du formulaire
  let title = $state('')
  let categoryId = $state('')
  let prepTimeMin = $state<number | null>(null)
  let defaultPortions = $state(4)
  let ingredients = $state<RecipeIngredientInput[]>([
    { name: '', quantity: null, unit: '', shopping_category_id: '' },
  ])
  let steps = $state<RecipeStepInput[]>([{ instruction: '' }])

  // Données de référence
  let recipeCategories: RecipeCategory[] = $state([])
  let shoppingCategories: ShoppingCategory[] = $state([])

  // UI
  let loading = $state(true)
  let saving = $state(false)
  let error = $state<string | null>(null)

  // Charger les catégories + données existantes si édition
  $effect(() => {
    loading = true
    error = null

    const promises: Promise<any>[] = [
      fetchRecipeCategories(),
      fetchShoppingCategories(),
    ]

    if (editId) {
      promises.push(fetchRecipe(editId))
    }

    Promise.all(promises)
      .then((results) => {
        recipeCategories = results[0]
        shoppingCategories = results[1]

        if (editId && results[2]) {
          const r = results[2]
          title = r.title
          categoryId = r.category_id ?? ''
          prepTimeMin = r.prep_time_min
          defaultPortions = r.default_portions

          ingredients = r.recipe_ingredients.length > 0
            ? r.recipe_ingredients.map((ing: any) => ({
                id: ing.id,
                name: ing.name,
                quantity: ing.quantity,
                unit: ing.unit ?? '',
                shopping_category_id: ing.shopping_category_id ?? '',
              }))
            : [{ name: '', quantity: null, unit: '', shopping_category_id: '' }]

          steps = r.recipe_steps.length > 0
            ? r.recipe_steps.map((s: any) => ({
                id: s.id,
                instruction: s.instruction,
              }))
            : [{ instruction: '' }]
        }
      })
      .catch((e) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  // Gestion ingrédients
  function addIngredient() {
    ingredients = [...ingredients, { name: '', quantity: null, unit: '', shopping_category_id: '' }]
  }

  function removeIngredient(index: number) {
    ingredients = ingredients.filter((_, i) => i !== index)
    if (ingredients.length === 0) addIngredient()
  }

  // Gestion étapes
  function addStep() {
    steps = [...steps, { instruction: '' }]
  }

  function removeStep(index: number) {
    steps = steps.filter((_, i) => i !== index)
    if (steps.length === 0) addStep()
  }

  // Soumission
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (saving) return

    // Validation
    if (!title.trim()) {
      error = 'Le titre est requis.'
      return
    }

    const validIngredients = ingredients.filter((i) => i.name.trim())
    const validSteps = steps.filter((s) => s.instruction.trim())

    const formData: RecipeFormData = {
      title: title.trim(),
      category_id: categoryId,
      prep_time_min: prepTimeMin,
      default_portions: defaultPortions,
      ingredients: validIngredients,
      steps: validSteps,
    }

    saving = true
    error = null

    try {
      if (isEdit && editId) {
        await updateRecipe(editId, formData)
        navigate('recette', editId)
      } else {
        const familyId = profileState.profile?.family_id
        const userId = auth.user?.id
        if (!familyId || !userId) {
          error = 'Profil non chargé.'
          saving = false
          return
        }
        const newId = await createRecipe(familyId, userId, formData)
        navigate('recette', newId)
      }
    } catch (e: any) {
      error = e.message
      saving = false
    }
  }
</script>

<div class="page">
  <a href={isEdit && editId ? href('recette', editId) : href('recettes')} class="back">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
    {isEdit ? 'Retour' : 'Recettes'}
  </a>

  <h1>{isEdit ? 'Modifier la recette' : 'Nouvelle recette'}</h1>

  {#if loading}
    <div class="center-msg"><div class="spinner"></div></div>
  {:else}
    <form onsubmit={handleSubmit}>
      <!-- Titre -->
      <label class="field">
        <span class="label-text">Titre *</span>
        <input
          type="text"
          class="input"
          placeholder="Ex : Poulet rôti aux herbes"
          required
          bind:value={title}
        />
      </label>

      <!-- Catégorie -->
      <label class="field">
        <span class="label-text">Catégorie</span>
        <select class="input" bind:value={categoryId}>
          <option value="">— Aucune —</option>
          {#each recipeCategories as cat (cat.id)}
            <option value={cat.id}>{cat.name}</option>
          {/each}
        </select>
      </label>

      <!-- Portions + Temps -->
      <div class="row-2">
        <label class="field">
          <span class="label-text">Portions</span>
          <input
            type="number"
            class="input"
            min="1"
            max="50"
            bind:value={defaultPortions}
          />
        </label>
        <label class="field">
          <span class="label-text">Temps de prépa (min)</span>
          <input
            type="number"
            class="input"
            min="0"
            max="600"
            placeholder="Ex : 45"
            bind:value={prepTimeMin}
          />
        </label>
      </div>

      <!-- Ingrédients -->
      <fieldset class="fieldset">
        <legend>Ingrédients</legend>
        {#each ingredients as ing, i (i)}
          <div class="ingredient-row">
            <input
              type="number"
              class="input input-qty"
              placeholder="Qté"
              step="any"
              min="0"
              bind:value={ing.quantity}
            />
            <input
              type="text"
              class="input input-unit"
              placeholder="Unité"
              bind:value={ing.unit}
            />
            <input
              type="text"
              class="input input-name"
              placeholder="Nom de l'ingrédient"
              bind:value={ing.name}
            />
            <select class="input input-cat" bind:value={ing.shopping_category_id} title="Rayon">
              <option value="">Rayon</option>
              {#each shoppingCategories as sc (sc.id)}
                <option value={sc.id}>{sc.icon} {sc.name}</option>
              {/each}
            </select>
            <button
              type="button"
              class="btn-icon btn-remove"
              onclick={() => removeIngredient(i)}
              title="Retirer"
              aria-label="Retirer l'ingrédient"
            >×</button>
          </div>
        {/each}
        <button type="button" class="btn-add" onclick={addIngredient}>
          + Ajouter un ingrédient
        </button>
      </fieldset>

      <!-- Étapes -->
      <fieldset class="fieldset">
        <legend>Préparation</legend>
        {#each steps as step, i (i)}
          <div class="step-row">
            <span class="step-num">{i + 1}</span>
            <textarea
              class="input textarea"
              placeholder="Décris cette étape…"
              rows="2"
              bind:value={step.instruction}
            ></textarea>
            <button
              type="button"
              class="btn-icon btn-remove"
              onclick={() => removeStep(i)}
              title="Retirer"
              aria-label="Retirer l'étape"
            >×</button>
          </div>
        {/each}
        <button type="button" class="btn-add" onclick={addStep}>
          + Ajouter une étape
        </button>
      </fieldset>

      {#if error}
        <p class="form-error">{error}</p>
      {/if}

      <button type="submit" class="btn btn-primary btn-submit" disabled={saving}>
        {#if saving}
          Enregistrement…
        {:else}
          {isEdit ? 'Enregistrer' : 'Créer la recette'}
        {/if}
      </button>
    </form>
  {/if}
</div>

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    max-width: 600px;
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--primary);
    font-size: 15px;
    font-weight: 500;
    margin-bottom: 16px;
    text-decoration: none;
  }

  h1 {
    font-size: 24px;
    margin-bottom: 20px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  /* Fieldset */
  .fieldset {
    border: 1.5px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .fieldset legend {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    padding: 0 8px;
  }

  /* Ligne ingrédient */
  .ingredient-row {
    display: grid;
    grid-template-columns: 60px 60px 1fr auto auto;
    gap: 6px;
    align-items: center;
  }

  .input-qty {
    text-align: center;
  }

  .input-unit {
    text-align: center;
  }

  .input-cat {
    max-width: 100%;
    font-size: 13px;
  }

  /* Ligne étape */
  .step-row {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 8px;
    align-items: start;
  }

  .step-num {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 6px;
  }

  .textarea {
    resize: vertical;
    min-height: 56px;
    font-family: var(--font-body);
  }

  /* Boutons */
  .btn-add {
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--primary);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    padding: 4px 0;
  }

  .btn-add:hover {
    text-decoration: underline;
  }

  .btn-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--error);
    color: white;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }

  .btn-icon:hover {
    opacity: 0.8;
  }

  .btn-submit {
    margin-top: 8px;
    font-size: 16px;
    padding: 14px;
  }

  .form-error {
    color: var(--error);
    background: var(--error-bg);
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    font-size: 14px;
  }

  /* Mobile : empiler les colonnes ingrédient */
  @media (max-width: 480px) {
    .ingredient-row {
      grid-template-columns: 50px 50px 1fr auto;
      gap: 6px;
    }

    .input-cat {
      grid-column: 1 / -2;
    }
  }

  /* Loading */
  .center-msg {
    display: flex;
    justify-content: center;
    padding: 48px 16px;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
