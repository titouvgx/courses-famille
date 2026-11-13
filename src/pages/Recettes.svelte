<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { href } from '../lib/router.svelte'
  import { fetchRecipes, fetchRecipeCategories, RECIPES_PAGE_SIZE } from '../lib/api/recipes'
  import type { RecipeWithCategory, RecipeCategory } from '../lib/types'

  let recipes: RecipeWithCategory[] = $state([])
  let categories: RecipeCategory[] = $state([])
  let loading = $state(true)
  let loadingMore = $state(false)
  let hasMore = $state(false)
  let error = $state<string | null>(null)

  // Filtres
  let search = $state('')
  let selectedCategory = $state<string | null>(null)

  // Chargement initial
  $effect(() => {
    if (profileState.loading) return

    const familyId = profileState.profile?.family_id
    if (!familyId) {
      loading = false
      error = 'Profil introuvable. Vérifie que ton compte est bien lié à une famille.'
      return
    }

    loading = true
    error = null
    recipes = []

    Promise.all([
      fetchRecipes(0),
      fetchRecipeCategories(),
    ])
      .then(([page, c]) => {
        recipes = page.recipes
        hasMore = page.hasMore
        categories = c
      })
      .catch((e) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  // Charger la page suivante
  async function loadMore() {
    if (loadingMore) return

    loadingMore = true
    try {
      const page = await fetchRecipes(recipes.length)
      recipes = [...recipes, ...page.recipes]
      hasMore = page.hasMore
    } catch (e: any) {
      error = e.message
    } finally {
      loadingMore = false
    }
  }

  // Recettes filtrées (le filtre s'applique sur ce qui est chargé)
  const filtered = $derived.by(() => {
    let result = recipes

    if (selectedCategory) {
      result = result.filter((r) => r.category_id === selectedCategory)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((r) => r.title.toLowerCase().includes(q))
    }

    return result
  })

  function formatTime(min: number | null): string {
    if (!min) return ''
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
  }
</script>

<div class="page">
  <header class="page-header">
    <h1>Recettes</h1>
  </header>

  <!-- Barre de recherche -->
  <div class="search-bar">
    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    <input
      type="search"
      class="search-input"
      placeholder="Rechercher une recette…"
      bind:value={search}
    />
  </div>

  <!-- Chips de catégorie -->
  <div class="chips" role="tablist">
    <button
      class="chip"
      class:active={!selectedCategory}
      onclick={() => (selectedCategory = null)}
      role="tab"
      aria-selected={!selectedCategory}
    >Tout</button>
    {#each categories as cat (cat.id)}
      <button
        class="chip"
        class:active={selectedCategory === cat.id}
        onclick={() => (selectedCategory = selectedCategory === cat.id ? null : cat.id)}
        role="tab"
        aria-selected={selectedCategory === cat.id}
        style="--chip-color: {cat.color}"
      >{cat.name}</button>
    {/each}
  </div>

  <!-- Contenu -->
  {#if loading}
    <div class="center-msg"><div class="spinner"></div></div>
  {:else if error}
    <div class="center-msg error-msg">{error}</div>
  {:else if filtered.length === 0}
    <div class="empty">
      {#if recipes.length === 0}
        <p class="empty-icon"><Icon name="book" size={44} strokeWidth={1.5} /></p>
        <p>Aucune recette pour le moment.</p>
        <p class="empty-hint">Ajoute ta première recette !</p>
      {:else}
        <p>Aucun résultat pour cette recherche.</p>
      {/if}
    </div>
  {:else}
    <div class="recipe-grid">
      {#each filtered as recipe (recipe.id)}
        <a href={href('recette', recipe.id)} class="recipe-card">
          <div class="card-visual">
            {#if recipe.image_url}
              <img
                src={recipe.image_url}
                alt={recipe.title}
                class="card-img"
                loading="lazy"
              />
            {:else}
              <span class="card-emoji" aria-hidden="true">{recipe.title.trim().charAt(0)}</span>
            {/if}
          </div>
          <div class="card-body">
            {#if recipe.recipe_categories}
              <span
                class="card-badge"
                style="background: {recipe.recipe_categories.color}20; color: {recipe.recipe_categories.color}"
              >{recipe.recipe_categories.name}</span>
            {/if}
            <h2 class="card-title">{recipe.title}</h2>
            <div class="card-meta">
              <span><Icon name="users" size={13} /> {recipe.default_portions} parts</span>
              {#if recipe.prep_time_min}
                <span><Icon name="clock" size={13} /> {formatTime(recipe.prep_time_min)}</span>
              {/if}
            </div>
          </div>
        </a>
      {/each}
    </div>

    <!-- Bouton charger plus -->
    {#if hasMore}
      <div class="load-more-wrap">
        <button class="btn btn-outline btn-load-more" onclick={loadMore} disabled={loadingMore}>
          {#if loadingMore}
            <span class="btn-spinner"></span>
            Chargement…
          {:else}
            Voir plus de recettes
          {/if}
        </button>
      </div>
    {/if}
  {/if}

  <!-- FAB : ajouter une recette -->
  <a href="#/nouvelle-recette" class="fab" aria-label="Nouvelle recette">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  </a>
</div>

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
  }

  .page-header {
    margin-bottom: 16px;
  }

  .page-header h1 {
    font-size: 28px;
  }

  /* Recherche */
  .search-bar {
    position: relative;
    margin-bottom: 12px;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-placeholder);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 10px 12px 10px 40px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    font-size: 15px;
    font-family: var(--font-body);
    transition: border-color 0.15s;
  }

  .search-input::placeholder {
    color: var(--text-placeholder);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  /* Chips */
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
    margin-bottom: 20px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .chips::-webkit-scrollbar {
    display: none;
  }

  .chip {
    flex-shrink: 0;
    padding: 6px 14px;
    border-radius: 20px;
    border: 1.5px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    font-family: var(--font-body);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .chip:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .chip.active {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }

  /* Grille recettes */
  .recipe-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }

  .recipe-card {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .recipe-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .card-visual {
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    font-size: 36px;
    overflow: hidden;
  }

  /* Pas de photo : grande initiale (même style que l'accueil) */
  .card-emoji {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 56px;
    line-height: 1;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--primary) 75%, white);
  }

  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-body {
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-badge {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .card-title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    display: flex;
    gap: 10px;
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 2px;
  }

  /* Load more */
  .load-more-wrap {
    display: flex;
    justify-content: center;
    padding: 20px 0 8px;
  }

  .btn-load-more {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    font-size: 14px;
  }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* État vide */
  .empty {
    text-align: center;
    padding: 48px 16px;
    color: var(--text-secondary);
    font-size: 15px;
  }

  .empty-icon {
    margin-bottom: 8px;
    color: var(--text-secondary);
  }

  .empty-hint {
    margin-top: 4px;
    font-size: 13px;
    color: var(--text-placeholder);
  }

  /* Loading / erreur */
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

  /* FAB */
  .fab {
    position: fixed;
    bottom: calc(76px + env(safe-area-inset-bottom, 0px) + 16px);
    right: max(16px, env(safe-area-inset-right, 0px));
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(255, 107, 53, 0.4);
    text-decoration: none;
    transition: transform 0.15s, box-shadow 0.15s;
    z-index: 10;
  }

  .fab:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(255, 107, 53, 0.5);
  }

  .fab:active {
    transform: scale(0.95);
  }
</style>
