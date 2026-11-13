<script lang="ts">
  import { router, href, navigate } from '../lib/router.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { fetchRecipe, deleteRecipe } from '../lib/api/recipes'
  import { getMonday, toISODate, fetchOrCreatePlan, setSlot } from '../lib/api/meals'
  import { addIngredientsToList } from '../lib/api/shopping'
  import type { IngredientToAdd } from '../lib/api/shopping'
  import { toast } from '../lib/toast.svelte'
  import type { RecipeDetail } from '../lib/types'

  let recipe: RecipeDetail | null = $state(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let deleting = $state(false)
  let showDeleteConfirm = $state(false)

  // ── Ajouter au panier ──
  let showCartPicker = $state(false)
  let cartPortions = $state(4)
  let cartChecked = $state<Record<string, boolean>>({})
  let addingToCart = $state(false)

  function openCartPicker() {
    if (!recipe) return
    cartPortions = recipe.default_portions
    // Tout coché par défaut
    cartChecked = {}
    for (const ing of recipe.recipe_ingredients) {
      cartChecked[ing.id] = true
    }
    showCartPicker = true
  }

  const cartSelectedCount = $derived(
    Object.values(cartChecked).filter(Boolean).length
  )

  function toggleAllCart() {
    if (!recipe) return
    const allChecked = cartSelectedCount === recipe.recipe_ingredients.length
    for (const ing of recipe.recipe_ingredients) {
      cartChecked[ing.id] = !allChecked
    }
  }

  function scaledQty(qty: number | null): string {
    if (!qty || !recipe) return ''
    const scale = cartPortions / (recipe.default_portions || 4)
    const scaled = Math.round(qty * scale * 100) / 100
    // Afficher proprement : pas de .00
    return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  }

  async function confirmAddToCart() {
    if (!recipe || addingToCart) return
    const familyId = profileState.profile?.family_id
    if (!familyId) {
      toast.error('Profil introuvable.')
      return
    }

    const selected: IngredientToAdd[] = recipe.recipe_ingredients
      .filter((ing) => cartChecked[ing.id])
      .map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        shopping_category_id: ing.shopping_category_id,
      }))

    if (selected.length === 0) {
      toast.error('Sélectionne au moins un ingrédient.')
      return
    }

    addingToCart = true
    try {
      const count = await addIngredientsToList(
        familyId,
        selected,
        cartPortions,
        recipe.default_portions,
        recipe.id,
      )
      showCartPicker = false
      toast.success(`${count} ingrédient${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} au panier !`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      addingToCart = false
    }
  }

  // ── Ajouter à la semaine ──
  let showWeekPicker = $state(false)
  let addingToWeek = $state(false)

  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  function weekDayDate(dayIdx: number): string {
    const monday = getMonday(new Date())
    const d = new Date(monday)
    d.setDate(d.getDate() + dayIdx)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  function isDayToday(dayIdx: number): boolean {
    const monday = getMonday(new Date())
    const d = new Date(monday)
    d.setDate(d.getDate() + dayIdx)
    const now = new Date()
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate()
  }

  async function addToWeek(dayIdx: number, meal: 'midi' | 'soir') {
    if (!recipe || addingToWeek) return
    const familyId = profileState.profile?.family_id
    if (!familyId) {
      toast.error('Profil introuvable.')
      return
    }

    addingToWeek = true
    try {
      const monday = getMonday(new Date())
      const plan = await fetchOrCreatePlan(familyId, toISODate(monday))
      await setSlot(plan.id, dayIdx, meal, recipe.id, recipe.default_portions)
      showWeekPicker = false
      const mealLabel = meal === 'midi' ? 'midi' : 'soir'
      toast.success(`${recipe.title} ajoutée ${DAY_NAMES[dayIdx]} ${mealLabel} !`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      addingToWeek = false
    }
  }

  $effect(() => {
    const id = router.recipeId
    if (!id) return

    loading = true
    error = null
    recipe = null

    fetchRecipe(id)
      .then((r) => {
        recipe = r
        if (!r) error = 'Recette introuvable.'
      })
      .catch((e) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  const isAdmin = $derived(
    profileState.profile?.role === 'admin'
  )

  function formatTime(min: number | null): string {
    if (!min) return ''
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
  }

  async function handleDelete() {
    if (!recipe || deleting) return
    deleting = true
    try {
      await deleteRecipe(recipe.id)
      navigate('recettes')
    } catch (e: any) {
      error = e.message
      deleting = false
      showDeleteConfirm = false
    }
  }
</script>

<div class="page">
  <a href={href('recettes')} class="back">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
    Recettes
  </a>

  {#if loading}
    <div class="center-msg"><div class="spinner"></div></div>
  {:else if error}
    <div class="center-msg error-msg">{error}</div>
  {:else if recipe}
    {#if recipe.image_url}
      <div class="recipe-hero">
        <img src={recipe.image_url} alt={recipe.title} class="hero-img" />
      </div>
    {/if}

    <div class="recipe-header">
      {#if recipe.recipe_categories}
        <span
          class="badge"
          style="background: {recipe.recipe_categories.color}20; color: {recipe.recipe_categories.color}"
        >{recipe.recipe_categories.name}</span>
      {/if}
      <h1>{recipe.title}</h1>
      <div class="meta">
        <span class="meta-item">🍽️ {recipe.default_portions} portions</span>
        {#if recipe.prep_time_min}
          <span class="meta-item">⏱️ {formatTime(recipe.prep_time_min)}</span>
        {/if}
      </div>
    </div>

    {#if recipe.recipe_ingredients.length > 0}
      <section class="section">
        <h2>Ingrédients</h2>
        <ul class="ingredient-list">
          {#each recipe.recipe_ingredients as ing (ing.id)}
            <li class="ingredient">
              <span class="ing-qty">
                {#if ing.quantity}{ing.quantity}{/if}
                {#if ing.unit} {ing.unit}{/if}
              </span>
              <span class="ing-name">{ing.name}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if recipe.recipe_steps.length > 0}
      <section class="section">
        <h2>Préparation</h2>
        <ol class="step-list">
          {#each recipe.recipe_steps as step, i (step.id)}
            <li class="step">
              <span class="step-num">{i + 1}</span>
              <p class="step-text">{step.instruction}</p>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    <!-- Actions rapides -->
    <div class="quick-actions">
      <button class="btn btn-add-cart" onclick={openCartPicker}>
        🛒 Ajouter au panier
      </button>
      <button class="btn btn-add-week" onclick={() => (showWeekPicker = true)}>
        📅 Ajouter à ma semaine
      </button>
    </div>

    {#if isAdmin}
      <div class="actions">
        <a href={href('editer-recette', recipe.id)} class="btn btn-outline">
          ✏️ Modifier
        </a>
        <button class="btn btn-danger" onclick={() => (showDeleteConfirm = true)}>
          🗑️ Supprimer
        </button>
      </div>
    {/if}

    {#if showDeleteConfirm}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="overlay" onclick={() => (showDeleteConfirm = false)} onkeydown={(e) => { if (e.key === 'Escape') showDeleteConfirm = false }}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="confirm-dialog" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
          <p class="confirm-title">Supprimer cette recette ?</p>
          <p class="confirm-text">« {recipe.title} » sera définitivement supprimée.</p>
          <div class="confirm-actions">
            <button class="btn btn-outline" onclick={() => (showDeleteConfirm = false)}>
              Annuler
            </button>
            <button class="btn btn-danger" disabled={deleting} onclick={handleDelete}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Picker « Ajouter à la semaine » -->
    <!-- Picker « Ajouter au panier » -->
    {#if showCartPicker}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="overlay overlay-bottom" onclick={() => (showCartPicker = false)}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="cart-picker" onclick={(e) => e.stopPropagation()}>
          <div class="cp-header">
            <h2>🛒 Ajouter au panier</h2>
            <button class="picker-close" onclick={() => (showCartPicker = false)} aria-label="Fermer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Portions -->
          <div class="cp-portions">
            <span class="cp-portions-label">Portions :</span>
            <div class="cp-portions-ctrl">
              <button class="cp-pm-btn" onclick={() => { if (cartPortions > 1) cartPortions-- }}>−</button>
              <span class="cp-pm-val">{cartPortions}</span>
              <button class="cp-pm-btn" onclick={() => cartPortions++}>+</button>
            </div>
          </div>

          <!-- Toggle tout / rien -->
          <div class="cp-toggle-row">
            <button class="cp-toggle-btn" onclick={toggleAllCart}>
              {#if recipe && cartSelectedCount === recipe.recipe_ingredients.length}
                Tout désélectionner
              {:else}
                Tout sélectionner
              {/if}
            </button>
            <span class="cp-count">{cartSelectedCount} sélectionné{cartSelectedCount > 1 ? 's' : ''}</span>
          </div>

          <!-- Liste des ingrédients -->
          <div class="cp-list">
            {#if recipe}
              {#each recipe.recipe_ingredients as ing (ing.id)}
                <label class="cp-item" class:cp-unchecked={!cartChecked[ing.id]}>
                  <input
                    type="checkbox"
                    class="cp-checkbox"
                    checked={cartChecked[ing.id]}
                    onchange={() => (cartChecked[ing.id] = !cartChecked[ing.id])}
                  />
                  <span class="cp-item-qty">
                    {scaledQty(ing.quantity)}{#if ing.unit} {ing.unit}{/if}
                  </span>
                  <span class="cp-item-name">{ing.name}</span>
                </label>
              {/each}
            {/if}
          </div>

          <!-- Bouton confirmer -->
          <button
            class="btn btn-primary cp-confirm"
            disabled={addingToCart || cartSelectedCount === 0}
            onclick={confirmAddToCart}
          >
            {#if addingToCart}
              Ajout en cours…
            {:else}
              Ajouter {cartSelectedCount} ingrédient{cartSelectedCount > 1 ? 's' : ''}
            {/if}
          </button>
        </div>
      </div>
    {/if}

    {#if showWeekPicker}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="overlay overlay-bottom" onclick={() => (showWeekPicker = false)}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="week-picker" onclick={(e) => e.stopPropagation()}>
          <div class="wp-header">
            <h2>📅 Ajouter à la semaine</h2>
            <button class="picker-close" onclick={() => (showWeekPicker = false)} aria-label="Fermer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <p class="wp-sub">Choisis le créneau pour « {recipe.title} »</p>
          <div class="wp-grid">
            {#each Array(7) as _, dayIdx}
              {@const today = isDayToday(dayIdx)}
              <div class="wp-day" class:wp-today={today}>
                <div class="wp-day-label">
                  <span class="wp-day-name">{DAY_NAMES[dayIdx]}</span>
                  <span class="wp-day-date">{weekDayDate(dayIdx)}</span>
                </div>
                <div class="wp-meals">
                  <button
                    class="wp-meal-btn"
                    disabled={addingToWeek}
                    onclick={() => addToWeek(dayIdx, 'midi')}
                  >☀️ Midi</button>
                  <button
                    class="wp-meal-btn"
                    disabled={addingToWeek}
                    onclick={() => addToWeek(dayIdx, 'soir')}
                  >🌙 Soir</button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
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

  .recipe-hero {
    width: 100%;
    height: 200px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    margin-bottom: 16px;
  }

  .hero-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .recipe-header {
    margin-bottom: 24px;
  }

  .badge {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 12px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .recipe-header h1 {
    font-size: 26px;
    line-height: 1.2;
    margin-bottom: 8px;
  }

  .meta {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .meta-item {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .section {
    margin-bottom: 28px;
  }

  .section h2 {
    font-size: 18px;
    margin-bottom: 12px;
    color: var(--text);
  }

  .ingredient-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ingredient {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    background: var(--surface);
    border-radius: var(--radius-sm);
    font-size: 15px;
  }

  .ing-qty {
    flex-shrink: 0;
    font-weight: 600;
    color: var(--primary);
    min-width: 60px;
  }

  .ing-name {
    color: var(--text);
  }

  .step-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .step {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .step-num {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-text {
    font-size: 15px;
    line-height: 1.5;
    color: var(--text);
    padding-top: 3px;
  }

  .actions {
    display: flex;
    gap: 12px;
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .btn-danger {
    background: var(--error);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-danger:hover {
    opacity: 0.9;
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--gutter);
  }

  .overlay-bottom {
    align-items: flex-end;
    padding: 0;
  }

  .confirm-dialog {
    background: var(--surface);
    border-radius: var(--radius-lg);
    padding: 24px;
    max-width: 360px;
    width: 100%;
  }

  .confirm-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
  }

  .confirm-text {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 20px;
    line-height: 1.4;
  }

  .confirm-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  /* ── Actions rapides ── */
  .quick-actions {
    display: flex;
    gap: 8px;
    margin-top: 24px;
    margin-bottom: 8px;
  }

  .btn-add-cart,
  .btn-add-week {
    flex: 1;
    padding: 12px 8px;
    border-radius: var(--radius-lg);
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-body);
    border: none;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }

  .btn-add-cart:active,
  .btn-add-week:active {
    transform: scale(0.97);
  }

  .btn-add-cart {
    background: var(--accent);
    color: white;
  }

  .btn-add-week {
    background: var(--primary);
    color: white;
  }

  /* ── Cart picker modal ── */
  .cart-picker {
    background: var(--bg);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    width: 100%;
    max-width: 500px;
    max-height: 85dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px;
    animation: picker-in 0.25s ease-out;
  }

  .cp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .cp-header h2 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }

  .cp-portions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--surface);
    border-radius: var(--radius-md);
    margin-bottom: 10px;
  }

  .cp-portions-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .cp-portions-ctrl {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cp-pm-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1.5px solid var(--border-strong);
    background: var(--bg);
    color: var(--text);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-family: var(--font-body);
    line-height: 1;
    transition: all 0.15s;
  }

  .cp-pm-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .cp-pm-val {
    font-size: 16px;
    font-weight: 700;
    min-width: 24px;
    text-align: center;
    color: var(--text);
  }

  .cp-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .cp-toggle-btn {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary);
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-body);
    padding: 0;
  }

  .cp-toggle-btn:hover {
    text-decoration: underline;
  }

  .cp-count {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .cp-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
    max-height: 40dvh;
  }

  .cp-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--surface);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .cp-unchecked {
    opacity: 0.45;
  }

  .cp-checkbox {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    accent-color: var(--primary);
    flex-shrink: 0;
    cursor: pointer;
  }

  .cp-item-qty {
    font-size: 14px;
    font-weight: 600;
    color: var(--primary);
    min-width: 50px;
    flex-shrink: 0;
  }

  .cp-item-name {
    font-size: 14px;
    color: var(--text);
    flex: 1;
    min-width: 0;
  }

  .cp-confirm {
    flex-shrink: 0;
  }

  /* ── Week picker modal ── */
  .week-picker {
    background: var(--bg);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    width: 100%;
    max-width: 500px;
    max-height: 85dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
    animation: picker-in 0.25s ease-out;
  }

  @keyframes picker-in {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  .wp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .wp-header h2 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }

  .picker-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .wp-sub {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wp-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .wp-day {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    gap: 8px;
  }

  .wp-today {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }

  .wp-day-label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }

  .wp-day-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }

  .wp-today .wp-day-name {
    color: var(--primary);
  }

  .wp-day-date {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .wp-meals {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .wp-meal-btn {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--border);
    background: transparent;
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: var(--font-body);
    transition: all 0.15s;
    white-space: nowrap;
  }

  .wp-meal-btn:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    color: var(--primary);
  }

  .wp-meal-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .center-msg {
    display: flex;
    justify-content: center;
    padding: 48px 16px;
  }

  .error-msg {
    color: var(--error);
    font-size: 14px;
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
