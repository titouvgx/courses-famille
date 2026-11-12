<script lang="ts">
  import { router, href, navigate } from '../lib/router.svelte'
  import { auth } from '../lib/auth.svelte'
  import { profileState } from '../lib/profile.svelte'
  import {
    fetchRecipe,
    fetchRecipeCategories,
    fetchShoppingCategories,
    fetchKnownIngredients,
    createRecipe,
    updateRecipe,
    type KnownIngredient,
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
  let knownIngredients: KnownIngredient[] = $state([])

  // Autocomplétion
  let activeAutocomplete = $state<number | null>(null)
  let autocompleteResults = $state<KnownIngredient[]>([])

  // UI
  let loading = $state(true)
  let saving = $state(false)
  let error = $state<string | null>(null)

  // Charger les catégories + ingrédients connus + données existantes si édition
  $effect(() => {
    if (profileState.loading) return
    const familyId = profileState.profile?.family_id

    loading = true
    error = null

    const promises: Promise<any>[] = [
      fetchRecipeCategories(),
      fetchShoppingCategories(),
      familyId ? fetchKnownIngredients(familyId) : Promise.resolve([]),
    ]

    if (editId) {
      promises.push(fetchRecipe(editId))
    }

    Promise.all(promises)
      .then((results) => {
        recipeCategories = results[0]
        shoppingCategories = results[1]
        knownIngredients = results[2]

        if (editId && results[3]) {
          const r = results[3]
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

  // Autocomplétion : filtrer les suggestions
  function onIngredientInput(index: number) {
    const query = ingredients[index].name.trim().toLowerCase()
    if (query.length < 1) {
      activeAutocomplete = null
      autocompleteResults = []
      return
    }

    const results = knownIngredients.filter(
      (ki) => ki.name.toLowerCase().includes(query)
    ).slice(0, 6)

    if (results.length > 0) {
      activeAutocomplete = index
      autocompleteResults = results
    } else {
      activeAutocomplete = null
      autocompleteResults = []
    }
  }

  function selectSuggestion(index: number, suggestion: KnownIngredient) {
    ingredients[index].name = suggestion.name
    if (suggestion.unit && !ingredients[index].unit) {
      ingredients[index].unit = suggestion.unit
    }
    if (suggestion.shopping_category_id && !ingredients[index].shopping_category_id) {
      ingredients[index].shopping_category_id = suggestion.shopping_category_id
    }
    activeAutocomplete = null
    autocompleteResults = []
  }

  function closeAutocomplete() {
    // Petit délai pour laisser le click sur la suggestion se propager
    setTimeout(() => {
      activeAutocomplete = null
      autocompleteResults = []
    }, 150)
  }

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

  function shoppingCatIcon(id: string): string {
    return shoppingCategories.find((s) => s.id === id)?.icon ?? '🛒'
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

      <!-- ── Infos principales ── -->
      <div class="card">
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

        <label class="field">
          <span class="label-text">Catégorie</span>
          <div class="chip-select">
            <button
              type="button"
              class="chip-option"
              class:selected={categoryId === ''}
              onclick={() => (categoryId = '')}
            >Aucune</button>
            {#each recipeCategories as cat (cat.id)}
              <button
                type="button"
                class="chip-option"
                class:selected={categoryId === cat.id}
                onclick={() => (categoryId = cat.id)}
                style="--cat-color: {cat.color}"
              >{cat.name}</button>
            {/each}
          </div>
        </label>

        <div class="row-2">
          <label class="field">
            <span class="label-text">🍽️ Portions</span>
            <input
              type="number"
              class="input"
              min="1"
              max="50"
              bind:value={defaultPortions}
            />
          </label>
          <label class="field">
            <span class="label-text">⏱️ Prépa (min)</span>
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
      </div>

      <!-- ── Ingrédients ── -->
      <div class="card">
        <h2 class="section-title">🥕 Ingrédients</h2>

        <div class="ingredient-list">
          {#each ingredients as ing, i (i)}
            <div class="ingredient-item">
              <div class="ing-main-row">
                <div class="ing-name-wrap">
                  <input
                    type="text"
                    class="input"
                    placeholder="Nom (ex : oeufs, beurre…)"
                    bind:value={ing.name}
                    oninput={() => onIngredientInput(i)}
                    onfocusout={closeAutocomplete}
                  />
                  {#if activeAutocomplete === i && autocompleteResults.length > 0}
                    <ul class="autocomplete">
                      {#each autocompleteResults as suggestion (suggestion.name)}
                        <li>
                          <button
                            type="button"
                            class="autocomplete-item"
                            onmousedown={() => selectSuggestion(i, suggestion)}
                          >
                            <span class="ac-name">{suggestion.name}</span>
                            {#if suggestion.unit}
                              <span class="ac-unit">({suggestion.unit})</span>
                            {/if}
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
                <button
                  type="button"
                  class="btn-remove"
                  onclick={() => removeIngredient(i)}
                  title="Retirer"
                  aria-label="Retirer l'ingrédient"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div class="ing-detail-row">
                <input
                  type="number"
                  class="input input-sm"
                  placeholder="Qté"
                  step="any"
                  min="0"
                  bind:value={ing.quantity}
                />
                <input
                  type="text"
                  class="input input-sm"
                  placeholder="Unité (g, cl…)"
                  bind:value={ing.unit}
                />
                <select class="input input-sm" bind:value={ing.shopping_category_id} title="Rayon">
                  <option value="">🛒 Rayon</option>
                  {#each shoppingCategories as sc (sc.id)}
                    <option value={sc.id}>{sc.icon} {sc.name}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/each}
        </div>

        <button type="button" class="btn-add" onclick={addIngredient}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Ajouter un ingrédient
        </button>
      </div>

      <!-- ── Étapes ── -->
      <div class="card">
        <h2 class="section-title">👩‍🍳 Préparation</h2>

        <div class="step-list">
          {#each steps as step, i (i)}
            <div class="step-item">
              <span class="step-badge">{i + 1}</span>
              <textarea
                class="input textarea"
                placeholder="Décris cette étape…"
                rows="2"
                bind:value={step.instruction}
              ></textarea>
              <button
                type="button"
                class="btn-remove"
                onclick={() => removeStep(i)}
                title="Retirer"
                aria-label="Retirer l'étape"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          {/each}
        </div>

        <button type="button" class="btn-add" onclick={addStep}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Ajouter une étape
        </button>
      </div>

      {#if error}
        <p class="form-error">{error}</p>
      {/if}

      <button type="submit" class="btn btn-primary btn-submit" disabled={saving}>
        {#if saving}
          Enregistrement…
        {:else}
          {isEdit ? '✅ Enregistrer les modifications' : '✅ Créer la recette'}
        {/if}
      </button>
    </form>
  {/if}
</div>

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    max-width: 560px;
    padding-bottom: 32px;
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--primary);
    font-size: 15px;
    font-weight: 500;
    margin-bottom: 12px;
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

  /* ── Card sections ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }

  /* ── Champs ── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  /* ── Chip select (catégories) ── */
  .chip-select {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chip-option {
    padding: 6px 14px;
    border-radius: 20px;
    border: 1.5px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-body);
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip-option:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .chip-option.selected {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
  }

  /* ── Ingrédients ── */
  .ingredient-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ingredient-item {
    background: var(--bg);
    border-radius: var(--radius-md);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ing-main-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .ing-name-wrap {
    flex: 1;
    position: relative;
  }

  .ing-detail-row {
    display: grid;
    grid-template-columns: 70px 80px 1fr;
    gap: 6px;
  }

  .input-sm {
    font-size: 13px;
    padding: 7px 10px;
  }

  /* ── Autocomplétion ── */
  .autocomplete {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    list-style: none;
    padding: 4px 0;
    margin: 4px 0 0;
    z-index: 50;
    max-height: 200px;
    overflow-y: auto;
  }

  .autocomplete-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    color: var(--text);
    font-size: 14px;
    font-family: var(--font-body);
    cursor: pointer;
    text-align: left;
  }

  .autocomplete-item:hover {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }

  .ac-name {
    font-weight: 500;
  }

  .ac-unit {
    color: var(--text-secondary);
    font-size: 12px;
  }

  /* ── Étapes ── */
  .step-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .step-item {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 8px;
    align-items: start;
  }

  .step-badge {
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
    flex-shrink: 0;
  }

  .textarea {
    resize: vertical;
    min-height: 56px;
    font-family: var(--font-body);
  }

  /* ── Boutons ── */
  .btn-add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    background: none;
    border: none;
    color: var(--primary);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    padding: 6px 0;
  }

  .btn-add:hover {
    text-decoration: underline;
  }

  .btn-remove {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-placeholder);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .btn-remove:hover {
    background: var(--error);
    color: white;
  }

  .btn-submit {
    margin-top: 4px;
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

  /* ── Mobile ── */
  @media (max-width: 440px) {
    .ing-detail-row {
      grid-template-columns: 60px 70px 1fr;
    }
  }

  /* ── Loading ── */
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
