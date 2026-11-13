<script lang="ts">
  import { onDestroy } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import { toast } from '../lib/toast.svelte'
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
  import {
    compressRecipeImage,
    PhotoError,
    PhotoUploadError,
    type CompressedImage,
    type PhotoChange,
  } from '../lib/api/recipeImages'
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

  // Photo
  let currentImageUrl = $state<string | null>(null) // photo déjà enregistrée (édition)
  let pendingImage = $state<CompressedImage | null>(null) // nouvelle photo compressée, pas encore envoyée
  let pendingPreviewUrl = $state<string | null>(null)
  let imageRemoved = $state(false)
  let processingPhoto = $state(false)
  let photoInput = $state<HTMLInputElement | null>(null)

  const previewUrl = $derived(pendingPreviewUrl ?? (imageRemoved ? null : currentImageUrl))

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

    // Requêtes essentielles (catégories + recette en édition)
    const essentialPromises: Promise<any>[] = [
      fetchRecipeCategories(),
      fetchShoppingCategories(),
    ]

    if (editId) {
      essentialPromises.push(fetchRecipe(editId))
    }

    // L'autocomplétion est chargée à part pour ne pas bloquer le formulaire
    if (familyId) {
      fetchKnownIngredients(familyId)
        .then((data) => { knownIngredients = data })
        .catch(() => { /* silencieux : l'autocomplétion sera juste vide */ })
    }

    Promise.all(essentialPromises)
      .then((results) => {
        recipeCategories = results[0]
        shoppingCategories = results[1]

        if (editId && results[2]) {
          const r = results[2]
          title = r.title
          categoryId = r.category_id ?? ''
          prepTimeMin = r.prep_time_min
          defaultPortions = r.default_portions
          currentImageUrl = r.image_url ?? null

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

  // ── Photo ──
  function setPendingPreview(url: string | null) {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    pendingPreviewUrl = url
  }

  // Si on quitte la page pendant la compression, l'aperçu ne doit pas être créé
  // après coup (sinon son URL ne serait jamais libérée)
  let destroyed = false
  onDestroy(() => {
    destroyed = true
    setPendingPreview(null)
  })

  function pickPhoto() {
    if (processingPhoto || saving) return
    photoInput?.click()
  }

  async function onPhotoSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = '' // permet de re-choisir la même photo
    if (!file) return

    processingPhoto = true
    try {
      const img = await compressRecipeImage(file)
      if (destroyed) return
      pendingImage = img
      setPendingPreview(URL.createObjectURL(img.blob))
      imageRemoved = false
    } catch (err) {
      toast.error(
        err instanceof PhotoError ? err.message : 'Impossible de préparer cette photo. Essaie avec une autre.',
      )
    } finally {
      processingPhoto = false
    }
  }

  function removePhoto() {
    pendingImage = null
    setPendingPreview(null)
    imageRemoved = true
  }

  function photoChange(): PhotoChange {
    if (pendingImage) return { kind: 'replace', image: pendingImage }
    if (imageRemoved && currentImageUrl) return { kind: 'remove' }
    return { kind: 'keep' }
  }

  // Soumission
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (saving || processingPhoto) return

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
    const photo = photoChange()

    try {
      if (isEdit && editId) {
        await updateRecipe(editId, formData, photo)
        navigate('recette', editId)
      } else {
        const familyId = profileState.profile?.family_id
        const userId = auth.user?.id
        if (!familyId || !userId) {
          error = 'Profil non chargé.'
          saving = false
          return
        }
        const newId = await createRecipe(familyId, userId, formData, photo)
        navigate('recette', newId)
      }
    } catch (e: any) {
      if (e instanceof PhotoUploadError) {
        // La recette existe : on y va quand même (pas de doublon en réessayant)
        toast.error(e.message)
        navigate('recette', e.recipeId)
        return
      }
      error = e?.message ?? 'Enregistrement impossible.'
      if (e instanceof PhotoError) toast.error(e.message)
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

      <!-- ── Photo ── -->
      <div class="card">
        <span class="label-text" id="photo-label"><Icon name="image" size={14} /> Photo</span>
        <input
          bind:this={photoInput}
          type="file"
          accept="image/*"
          class="visually-hidden"
          tabindex="-1"
          aria-hidden="true"
          onchange={onPhotoSelected}
        />

        {#if previewUrl}
          <div class="photo-frame">
            <img src={previewUrl} alt={title.trim() || 'Aperçu'} class="photo-img" />
            {#if processingPhoto}
              <div class="photo-busy" role="status">
                <div class="spinner"></div>
                <span>Préparation de la photo…</span>
              </div>
            {/if}
          </div>
          <div class="photo-actions">
            <button
              type="button"
              class="photo-btn"
              onclick={pickPhoto}
              disabled={processingPhoto || saving}
            >
              <Icon name="camera" size={18} /> Changer
            </button>
            <button
              type="button"
              class="photo-btn photo-btn-danger"
              onclick={removePhoto}
              disabled={processingPhoto || saving}
            >
              <Icon name="trash" size={18} /> Retirer
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="photo-frame photo-empty"
            onclick={pickPhoto}
            disabled={processingPhoto || saving}
            aria-describedby="photo-label"
          >
            {#if processingPhoto}
              <div class="spinner"></div>
              <span class="photo-empty-title" role="status">Préparation de la photo…</span>
            {:else}
              <span class="photo-empty-icon"><Icon name="camera" size={28} strokeWidth={1.8} /></span>
              <span class="photo-empty-title">Ajouter une photo</span>
              <span class="photo-empty-sub">Galerie ou appareil photo</span>
            {/if}
          </button>
        {/if}
        <p class="photo-hint">Visible par toute la famille. Évite les visages et les documents.</p>
      </div>

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
            <span class="label-text"><Icon name="users" size={14} /> Portions</span>
            <input
              type="number"
              class="input"
              min="1"
              max="50"
              bind:value={defaultPortions}
            />
          </label>
          <label class="field">
            <span class="label-text"><Icon name="clock" size={14} /> Prépa (min)</span>
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
        <h2 class="section-title">Préparation</h2>

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
          {pendingImage ? 'Envoi de la photo…' : 'Enregistrement…'}
        {:else}
          <Icon name="check" /> {isEdit ? 'Enregistrer les modifications' : 'Créer la recette'}
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
    color: var(--on-primary);
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
    color: var(--on-primary);
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

  /* ── Photo ── */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .photo-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--bg);
  }

  .photo-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .photo-busy {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: rgba(9, 24, 50, 0.72);
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
  }

  .photo-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--tap);
    border: 1.5px dashed var(--border-strong);
    color: var(--text-secondary);
    font-family: var(--font-body);
    cursor: pointer;
    touch-action: manipulation;
    transition: border-color 0.15s, color 0.15s;
  }

  .photo-empty:active:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }

  .photo-empty:disabled {
    cursor: progress;
  }

  .photo-empty:focus-visible,
  .photo-btn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .photo-empty-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--primary-light);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }

  .photo-empty-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  .photo-empty-sub {
    font-size: 13px;
  }

  .photo-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .photo-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--primary);
    background: transparent;
    color: var(--primary);
    font-size: 15px;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 0.12s;
  }

  .photo-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .photo-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .photo-btn-danger {
    border-color: var(--border-strong);
    color: var(--text-secondary);
  }

  @media (hover: hover) and (pointer: fine) {
    .photo-empty:hover:not(:disabled) {
      border-color: var(--primary);
      color: var(--primary);
    }
    .photo-btn-danger:hover:not(:disabled) {
      border-color: var(--error);
      color: var(--error);
    }
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
  .photo-hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
