<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { href } from '../lib/router.svelte'
  import { sizedImage } from '../lib/images'
  import {
    fetchRecipeCategories,
    fetchRecipeIndex,
    fetchRecipesByIds,
    filterRecipeIndex,
    RECIPES_PAGE_SIZE,
    type RecipeIndexEntry,
  } from '../lib/api/recipes'
  import type { RecipeWithCategory, RecipeCategory } from '../lib/types'

  // ── Données ──
  // index : TOUTES les recettes en version légère (id, titre, catégorie).
  // La recherche et le filtre s'appliquent sur l'index (toute la base),
  // puis on charge les recettes complètes page par page.
  let index: RecipeIndexEntry[] = $state([])
  let categories: RecipeCategory[] = $state([])
  let shown: RecipeWithCategory[] = $state([])
  let indexLoading = $state(true)
  let pageLoading = $state(false)
  let loadingMore = $state(false)
  let error = $state<string | null>(null)
  let reloadTick = $state(0)

  /** Recettes complètes déjà chargées (évite de redemander les mêmes). */
  const cache = new Map<string, RecipeWithCategory>()
  /** Numéro de la dernière requête : une réponse plus ancienne est ignorée. */
  let requestSeq = 0

  // ── Filtres ──
  let search = $state('')
  let query = $state('') // recherche appliquée (après le délai)
  let selectedCategory = $state<string | null>(null)

  // Délai de 250 ms pendant la frappe ; effacer s'applique tout de suite.
  $effect(() => {
    const value = search.trim()
    if (!value) {
      query = ''
      return
    }
    const t = setTimeout(() => (query = value), 250)
    return () => clearTimeout(t)
  })

  // ── Chargement de l'index + catégories ──
  // Les recettes sont partagées entre tous les foyers (RLS is_member()) :
  // pas besoin d'attendre le profil pour les charger.
  $effect(() => {
    void reloadTick
    indexLoading = true
    error = null
    let cancelled = false

    Promise.all([fetchRecipeIndex(), fetchRecipeCategories()])
      .then(([idx, cats]) => {
        if (cancelled) return
        index = idx
        categories = cats
      })
      .catch((e) => {
        if (!cancelled) error = e?.message ?? 'Impossible de charger les recettes.'
      })
      .finally(() => {
        if (!cancelled) indexLoading = false
      })

    return () => { cancelled = true }
  })

  // Profil chargé mais sans foyer : la base ne renvoie aucune recette
  const noFamily = $derived(!profileState.loading && !profileState.profile?.family_id)

  // Toute la base filtrée (instantané, côté client)
  const matches = $derived(filterRecipeIndex(index, query, selectedCategory))
  const hasMore = $derived(shown.length < matches.length)
  const isFiltered = $derived(!!query || !!selectedCategory)

  /** Charge (si besoin) les recettes complètes d'une liste d'id. */
  async function resolve(ids: string[]): Promise<RecipeWithCategory[]> {
    const missing = ids.filter((id) => !cache.has(id))
    if (missing.length > 0) {
      for (const r of await fetchRecipesByIds(missing)) cache.set(r.id, r)
    }
    return ids.map((id) => cache.get(id)).filter((r): r is RecipeWithCategory => !!r)
  }

  // Première page à chaque changement de recherche / catégorie
  $effect(() => {
    if (indexLoading || error) return
    const ids = matches.slice(0, RECIPES_PAGE_SIZE).map((r) => r.id)
    const seq = ++requestSeq
    loadingMore = false

    // Tout est déjà en cache : pas de requête
    if (ids.every((id) => cache.has(id))) {
      shown = ids.map((id) => cache.get(id)!)
      pageLoading = false
      return
    }

    pageLoading = true
    resolve(ids)
      .then((list) => {
        if (seq !== requestSeq) return // réponse obsolète
        shown = list
      })
      .catch((e) => {
        if (seq === requestSeq) error = e?.message ?? 'Impossible de charger les recettes.'
      })
      .finally(() => {
        if (seq === requestSeq) pageLoading = false
      })
  })

  // Page suivante (dans les résultats filtrés)
  async function loadMore() {
    if (loadingMore || pageLoading) return
    const ids = matches.slice(shown.length, shown.length + RECIPES_PAGE_SIZE).map((r) => r.id)
    if (ids.length === 0) return
    const seq = requestSeq
    loadingMore = true
    try {
      const list = await resolve(ids)
      if (seq !== requestSeq) return // la recherche a changé entre-temps
      shown = [...shown, ...list]
    } catch (e: any) {
      if (seq === requestSeq) error = e?.message ?? 'Impossible de charger la suite.'
    } finally {
      if (seq === requestSeq) loadingMore = false
    }
  }

  function retry() {
    cache.clear()
    shown = []
    reloadTick++
  }

  function clearFilters() {
    search = ''
    query = ''
    selectedCategory = null
  }

  function formatTime(min: number | null): string {
    if (!min) return ''
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
  }

  const countLabel = $derived.by(() => {
    if (isFiltered) {
      const n = matches.length
      return n === 0 ? 'Aucun résultat' : `${n} résultat${n > 1 ? 's' : ''}`
    }
    const n = index.length
    return `${n} recette${n > 1 ? 's' : ''}`
  })
</script>

<div class="page">
  <header class="head">
    <h1>Recettes</h1>
    {#if !indexLoading && !error && index.length > 0}
      <p class="head-sub" aria-live="polite">{countLabel}</p>
    {/if}
  </header>

  <!-- Barre de recherche -->
  <div class="search-bar" role="search">
    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    <input
      type="search"
      class="search-input"
      placeholder="Rechercher une recette…"
      aria-label="Rechercher une recette"
      autocomplete="off"
      enterkeyhint="search"
      bind:value={search}
    />
    {#if search}
      <button class="search-clear" onclick={() => { search = ''; query = '' }} aria-label="Effacer la recherche">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    {/if}
  </div>

  <!-- Puces de catégorie (défilement horizontal sur téléphone) -->
  {#if categories.length > 0}
    <div class="chips" role="group" aria-label="Catégories">
      <button
        class="chip"
        class:active={!selectedCategory}
        onclick={() => (selectedCategory = null)}
        aria-pressed={!selectedCategory}
      >Tout</button>
      {#each categories as cat (cat.id)}
        <button
          class="chip"
          class:active={selectedCategory === cat.id}
          onclick={() => (selectedCategory = selectedCategory === cat.id ? null : cat.id)}
          aria-pressed={selectedCategory === cat.id}
          style="--chip-color: {cat.color}"
        ><span class="chip-dot" aria-hidden="true"></span>{cat.name}</button>
      {/each}
    </div>
  {/if}

  <!-- Contenu -->
  {#if indexLoading || (pageLoading && shown.length === 0 && matches.length > 0)}
    <div class="recipe-grid" aria-busy="true" aria-label="Chargement des recettes">
      {#each Array(6) as _, i (i)}
        <div class="recipe-card skeleton" style="animation-delay: {i * 80}ms">
          <div class="card-visual"></div>
          <div class="card-body">
            <span class="sk-line sk-short"></span>
            <span class="sk-line"></span>
            <span class="sk-line sk-mid"></span>
          </div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="card state">
      <p class="state-title">Oups, les recettes n’ont pas pu être chargées</p>
      <p class="state-text error-text">{error}</p>
      <button class="btn btn-outline state-btn" onclick={retry}>
        <Icon name="refresh" /> Réessayer
      </button>
    </div>
  {:else if index.length === 0}
    <div class="card state">
      <span class="state-icon"><Icon name="book" size={44} strokeWidth={1.5} /></span>
      {#if noFamily}
        <p class="state-title">Profil introuvable</p>
        <p class="state-text">Vérifie que ton compte est bien lié à une famille.</p>
      {:else}
        <p class="state-title">Aucune recette pour le moment</p>
        <p class="state-text">Ajoute ta première recette, elle sera partagée avec toute la famille.</p>
        <a href="#/nouvelle-recette" class="btn btn-primary state-cta">Ajouter une recette</a>
      {/if}
    </div>
  {:else if matches.length === 0}
    <div class="card state">
      <svg class="state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M8 11h6"/>
      </svg>
      <p class="state-title">Aucun résultat</p>
      <p class="state-text">
        {#if query}Aucune recette ne correspond à « {query} »{:else}Aucune recette dans cette catégorie{/if}{#if query && selectedCategory} dans cette catégorie{/if}.
      </p>
      <button class="btn btn-outline state-btn" onclick={clearFilters}>Tout afficher</button>
    </div>
  {:else}
    <div class="recipe-grid" class:refreshing={pageLoading}>
      {#each shown as recipe (recipe.id)}
        <a href={href('recette', recipe.id)} class="recipe-card">
          <div class="card-visual">
            {#if sizedImage(recipe.image_url, 240, 180)}
              <img
                src={sizedImage(recipe.image_url, 240, 180)}
                alt=""
                class="card-img"
                loading="lazy"
                decoding="async"
              />
            {:else}
              <span class="card-initial" aria-hidden="true">{recipe.title.trim().charAt(0)}</span>
            {/if}
          </div>
          <div class="card-body">
            {#if recipe.recipe_categories}
              <span class="card-badge" style="--cat: {recipe.recipe_categories.color}">{recipe.recipe_categories.name}</span>
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

    {#if hasMore}
      <div class="load-more-wrap">
        <button class="btn btn-outline btn-load-more" onclick={loadMore} disabled={loadingMore || pageLoading}>
          {#if loadingMore}
            <span class="btn-spinner"></span>
            Chargement…
          {:else}
            Voir plus ({matches.length - shown.length})
          {/if}
        </button>
      </div>
    {/if}
  {/if}

  <!-- FAB : ajouter une recette (au-dessus de la barre d'onglets) -->
  <a href="#/nouvelle-recette" class="fab" aria-label="Nouvelle recette">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  </a>
</div>

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    /* Place pour le FAB sous la dernière rangée */
    padding-bottom: calc(var(--gutter) + 72px);
    max-width: 1400px;
    margin: 0 auto;
  }

  /* ── En-tête ── */
  .head { margin-bottom: 14px; }

  .head h1 {
    font-size: 28px;
    padding-right: 48px; /* avatar en haut à droite */
  }

  .head-sub {
    margin-top: 4px;
    font-size: 15px;
    color: var(--text-secondary);
  }

  /* ── Recherche ── */
  .search-bar {
    position: relative;
    margin-bottom: 12px;
    max-width: 560px;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    min-height: 48px;
    padding: 12px 48px 12px 42px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    background: rgba(9, 24, 50, 0.6);
    color: var(--text);
    font-size: 16px; /* 16 px : pas de zoom auto sur iOS */
    font-family: var(--font-body);
    transition: border-color 0.15s;
    -webkit-appearance: none;
    appearance: none;
  }

  .search-input::-webkit-search-cancel-button { display: none; }
  .search-input::placeholder { color: var(--text-placeholder); }

  .search-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .search-clear {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
  }

  .search-clear:active { color: var(--text); }

  /* ── Puces ── */
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    /* Bord à bord sur téléphone : la rangée défile jusqu'au bord de l'écran */
    margin: 0 calc(-1 * var(--gutter)) 16px;
    padding: 2px var(--gutter) 4px;
    scroll-padding-inline: var(--gutter);
    scrollbar-width: none;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
  }

  .chips::-webkit-scrollbar { display: none; }

  .chip {
    flex-shrink: 0;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    white-space: nowrap;
    touch-action: manipulation;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  }

  .chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--chip-color, var(--primary));
  }

  .chip:active { transform: scale(0.97); }

  .chip.active {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }

  .chip.active .chip-dot { background: var(--on-primary); }

  /* ── Grille : 2 colonnes sur téléphone, plus sur grand écran ── */
  .recipe-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    transition: opacity 0.2s;
  }

  .recipe-grid.refreshing { opacity: 0.55; }

  @media (min-width: 640px) {
    .recipe-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  }

  @media (min-width: 960px) {
    .recipe-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  }

  @media (min-width: 1240px) {
    .recipe-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  }

  .recipe-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-radius: var(--radius-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    touch-action: manipulation;
    transition: transform 0.15s;
  }

  .recipe-card:active { transform: scale(0.98); }

  .card-visual {
    aspect-ratio: 4 / 3;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 12%, rgba(9, 24, 50, 0.5));
    overflow: hidden;
  }

  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Pas de photo : grande initiale (même style que l'accueil) */
  .card-initial {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 56px;
    line-height: 1;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--primary) 75%, white);
  }

  .card-body {
    flex: 1;
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-badge {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--cat) 55%, white);
    background: color-mix(in srgb, var(--cat) 24%, transparent);
  }

  .card-title {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .card-meta {
    margin-top: auto;
    padding-top: 2px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .card-meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  /* ── Squelettes ── */
  .skeleton {
    pointer-events: none;
    animation: sk-pulse 1.2s ease-in-out infinite alternate;
  }

  .skeleton .card-visual { background: rgba(255, 255, 255, 0.08); }

  .sk-line {
    display: block;
    height: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.12);
  }

  .sk-short { width: 40%; height: 10px; }
  .sk-mid { width: 65%; }

  @keyframes sk-pulse {
    from { opacity: 1; }
    to { opacity: 0.45; }
  }

  /* ── États (vide, aucun résultat, erreur) ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
  }

  .state {
    max-width: 480px;
    margin: 8px auto 0;
    padding: 32px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .state-icon { color: var(--text-secondary); }

  .state-title {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
  }

  .state-text {
    font-size: 15px;
    line-height: 1.45;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .error-text { color: var(--error); }

  .state-btn {
    margin-top: 8px;
    min-height: 46px;
    border-radius: 14px;
    background: rgba(9, 24, 50, 0.6);
    color: var(--text);
    touch-action: manipulation;
  }

  .state-cta {
    margin-top: 12px;
    width: auto;
    padding: 14px 22px;
    touch-action: manipulation;
  }

  /* ── Voir plus ── */
  .load-more-wrap {
    display: flex;
    justify-content: center;
    padding: 20px 0 8px;
  }

  .btn-load-more {
    min-height: 48px;
    padding: 0 24px;
    border-radius: 999px;
    font-size: 15px;
    background: rgba(9, 24, 50, 0.6);
    color: var(--text);
    touch-action: manipulation;
  }

  .btn-load-more:disabled { opacity: 0.7; }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── FAB (au-dessus de la barre d'onglets : 76 px réservés + safe area) ── */
  .fab {
    position: fixed;
    bottom: calc(76px + env(safe-area-inset-bottom, 0px) + 12px);
    right: max(16px, env(safe-area-inset-right, 0px));
    width: 56px;
    height: 56px;
    border-radius: var(--radius-fab);
    background: var(--accent);
    color: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 18px var(--accent-shadow), 0 2px 6px rgba(0, 0, 0, 0.3);
    text-decoration: none;
    touch-action: manipulation;
    transition: transform 0.15s;
    z-index: 50;
  }

  .fab:active { transform: scale(0.94); }

  @media (hover: hover) and (pointer: fine) {
    .chip:not(.active):hover { border-color: var(--primary); background: var(--surface-hover); }
    .recipe-card:hover { transform: translateY(-2px); border-color: var(--border-strong); }
    .search-clear:hover { color: var(--text); }
    .fab:hover { transform: scale(1.05); }
  }
</style>
