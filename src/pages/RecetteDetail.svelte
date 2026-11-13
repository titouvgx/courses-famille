<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { router, href, navigate } from '../lib/router.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { fetchRecipe, deleteRecipe } from '../lib/api/recipes'
  import PlanRecipeDialog from '../components/PlanRecipeDialog.svelte'
  import { toast } from '../lib/toast.svelte'
  import type { RecipeDetail } from '../lib/types'

  let recipe: RecipeDetail | null = $state(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let deleting = $state(false)
  let showDeleteConfirm = $state(false)

  // ── Planifier / ajouter aux courses (fenêtre en 2 étapes) ──
  // 'plan' : choisir un créneau puis proposer les ingrédients ; 'cart' : seulement les ingrédients
  let dialogMode = $state<'plan' | 'cart' | null>(null)

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
        <span class="meta-item"><Icon name="users" size={16} /> {recipe.default_portions} portions</span>
        {#if recipe.prep_time_min}
          <span class="meta-item"><Icon name="clock" size={16} /> {formatTime(recipe.prep_time_min)}</span>
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
      <button class="btn btn-add-week" onclick={() => (dialogMode = 'plan')}>
        <Icon name="calendar" /> Ajouter à ma semaine
      </button>
      <button class="btn btn-add-cart" onclick={() => (dialogMode = 'cart')}>
        <Icon name="cart" /> Juste les ingrédients
      </button>
    </div>

    {#if isAdmin}
      <div class="actions">
        <a href={href('editer-recette', recipe.id)} class="btn btn-outline">
          <Icon name="pencil" /> Modifier
        </a>
        <button class="btn btn-danger" onclick={() => (showDeleteConfirm = true)}>
          <Icon name="trash" /> Supprimer
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

    {#if dialogMode}
      <PlanRecipeDialog {recipe} mode={dialogMode} onclose={() => (dialogMode = null)} />
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
    color: var(--on-primary);
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
    z-index: 200; /* au-dessus de la barre d'onglets (100) */
    padding: var(--gutter);
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
    flex-wrap: wrap; /* sur les petits écrans, les deux boutons passent l'un sous l'autre */
    gap: 8px;
    margin-top: 24px;
    margin-bottom: 8px;
  }

  .btn-add-cart,
  .btn-add-week {
    flex: 1 1 170px;
    white-space: nowrap;
    padding: 13px 12px;
    border-radius: var(--radius-lg);
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-body);
    border: none;
    cursor: pointer;
    touch-action: manipulation;
    transition: opacity 0.15s, transform 0.1s;
  }

  .btn-add-cart:active,
  .btn-add-week:active {
    transform: scale(0.97);
  }

  /* Action principale : planifier (les courses sont proposées juste après) */
  .btn-add-week {
    flex-basis: 100%;
    padding: 15px 12px;
    font-size: 15px;
    background: var(--accent);
    color: white;
  }

  /* Action secondaire : acheter sans planifier */
  .btn-add-cart {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border-strong);
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
